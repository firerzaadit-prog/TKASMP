-- ==========================================
-- IRT PARAMETERS SCHEMA
-- Menambahkan kolom untuk parameter IRT ke tabel questions
-- ==========================================
-- Run this in Supabase SQL Editor

-- 1. Add IRT parameter columns to questions table
ALTER TABLE public.questions 
ADD COLUMN IF NOT EXISTS irt_a_parameter DOUBLE PRECISION DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS irt_b_parameter DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS irt_c_parameter DOUBLE PRECISION DEFAULT 0.25,
ADD COLUMN IF NOT EXISTS difficulty_pvalue DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS discrimination_index DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS is_valid_item BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_calibrated TIMESTAMP WITH TIME ZONE;

-- 2. Add comments for documentation
COMMENT ON COLUMN public.questions.irt_a_parameter IS 'IRT discrimination parameter (a) - higher values indicate better discrimination';
COMMENT ON COLUMN public.questions.irt_b_parameter IS 'IRT difficulty parameter (b) - negative = easy, positive = difficult';
COMMENT ON COLUMN public.questions.irt_c_parameter IS 'IRT guessing parameter (c) - probability of correct guess';
COMMENT ON COLUMN public.questions.difficulty_pvalue IS 'Classical difficulty - proportion of students who answered correctly (0-1)';
COMMENT ON COLUMN public.questions.discrimination_index IS 'Point-biserial correlation - measures how well item discriminates between high and low performers';
COMMENT ON COLUMN public.questions.is_valid_item IS 'Whether the item meets quality criteria based on IRT analysis';
COMMENT ON COLUMN public.questions.last_calibrated IS 'Timestamp of last IRT calibration';

-- 3. Create index for IRT-based queries
CREATE INDEX IF NOT EXISTS idx_questions_irt_difficulty ON public.questions(irt_b_parameter);
CREATE INDEX IF NOT EXISTS idx_questions_irt_discrimination ON public.questions(irt_a_parameter);
CREATE INDEX IF NOT EXISTS idx_questions_valid_item ON public.questions(is_valid_item);

-- 4. Create IRT calibration history table for tracking
CREATE TABLE IF NOT EXISTS public.irt_calibration_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    calibration_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_items_calibrated INTEGER,
    average_difficulty DOUBLE PRECISION,
    average_discrimination DOUBLE PRECISION,
    valid_items_count INTEGER,
    invalid_items_count INTEGER,
    calibration_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS on calibration history
ALTER TABLE public.irt_calibration_history ENABLE ROW LEVEL SECURITY;

-- 6. Policy for calibration history
DROP POLICY IF EXISTS "Admins can view calibration history" ON public.irt_calibration_history;
CREATE POLICY "Admins can view calibration history" ON public.irt_calibration_history
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert calibration history" ON public.irt_calibration_history;
CREATE POLICY "Admins can insert calibration history" ON public.irt_calibration_history
    FOR INSERT WITH CHECK (true);

-- 7. Create function to get item statistics
CREATE OR REPLACE FUNCTION get_item_statistics()
RETURNS TABLE (
    question_id UUID,
    question_text TEXT,
    total_responses BIGINT,
    correct_responses BIGINT,
    p_value DOUBLE PRECISION,
    mean_score_correct DOUBLE PRECISION,
    mean_score_incorrect DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.question_id,
        q.question_text,
        COUNT(*) as total_responses,
        SUM(CASE WHEN ea.is_correct THEN 1 ELSE 0 END) as correct_responses,
        SUM(CASE WHEN ea.is_correct THEN 1 ELSE 0 END)::DOUBLE PRECISION / COUNT(*)::DOUBLE PRECISION as p_value,
        AVG(CASE WHEN ea.is_correct THEN es.total_score ELSE NULL END) as mean_score_correct,
        AVG(CASE WHEN NOT ea.is_correct THEN es.total_score ELSE NULL END) as mean_score_incorrect
    FROM exam_answers ea
    JOIN questions q ON ea.question_id = q.id
    JOIN exam_sessions es ON ea.exam_session_id = es.id
    WHERE es.status = 'completed'
    GROUP BY ea.question_id, q.question_text;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to calculate discrimination index
CREATE OR REPLACE FUNCTION calculate_discrimination_index(p_question_id UUID)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    v_correct_mean DOUBLE PRECISION;
    v_incorrect_mean DOUBLE PRECISION;
    v_std_dev DOUBLE PRECISION;
    v_p_value DOUBLE PRECISION;
    v_q_value DOUBLE PRECISION;
    v_discrimination DOUBLE PRECISION;
BEGIN
    -- Get statistics for the question
    SELECT 
        AVG(CASE WHEN ea.is_correct THEN es.total_score END),
        AVG(CASE WHEN NOT ea.is_correct THEN es.total_score END),
        STDDEV(es.total_score),
        SUM(CASE WHEN ea.is_correct THEN 1 ELSE 0 END)::DOUBLE PRECISION / COUNT(*)::DOUBLE PRECISION
    INTO v_correct_mean, v_incorrect_mean, v_std_dev, v_p_value
    FROM exam_answers ea
    JOIN exam_sessions es ON ea.exam_session_id = es.id
    WHERE ea.question_id = p_question_id AND es.status = 'completed';

    v_q_value := 1 - COALESCE(v_p_value, 0.5);
    
    -- Calculate point-biserial correlation
    IF v_std_dev > 0 AND v_p_value > 0 AND v_q_value > 0 THEN
        v_discrimination := (COALESCE(v_correct_mean, 0) - COALESCE(v_incorrect_mean, 0)) / v_std_dev * SQRT(v_p_value * v_q_value);
    ELSE
        v_discrimination := 0;
    END IF;

    -- Clamp to valid range
    v_discrimination := GREATEST(-1, LEAST(1, v_discrimination));

    RETURN v_discrimination;
END;
$$ LANGUAGE plpgsql;

-- 9. Create function to auto-calibrate items
CREATE OR REPLACE FUNCTION auto_calibrate_items()
RETURNS TABLE (
    question_id UUID,
    p_value DOUBLE PRECISION,
    b_parameter DOUBLE PRECISION,
    discrimination DOUBLE PRECISION,
    a_parameter DOUBLE PRECISION
) AS $$
DECLARE
    item_record RECORD;
    v_p_value DOUBLE PRECISION;
    v_b_parameter DOUBLE PRECISION;
    v_discrimination DOUBLE PRECISION;
    v_a_parameter DOUBLE PRECISION;
BEGIN
    FOR item_record IN 
        SELECT DISTINCT question_id FROM exam_answers
    LOOP
        -- Calculate p-value
        SELECT 
            SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::DOUBLE PRECISION / COUNT(*)::DOUBLE PRECISION
        INTO v_p_value
        FROM exam_answers WHERE question_id = item_record.question_id;

        -- Convert to IRT b-parameter using logit transformation
        IF v_p_value = 0 THEN
            v_b_parameter := 3.0;
        ELSIF v_p_value = 1 THEN
            v_b_parameter := -3.0;
        ELSE
            v_b_parameter := -LN(v_p_value / (1 - v_p_value));
        END IF;

        v_b_parameter := GREATEST(-3, LEAST(3, v_b_parameter));

        -- Calculate discrimination
        v_discrimination := calculate_discrimination_index(item_record.question_id);
        
        -- Convert to a-parameter
        v_a_parameter := GREATEST(0.1, LEAST(3, ABS(v_discrimination) * 1.7));

        -- Update the question
        UPDATE questions
        SET 
            difficulty_pvalue = v_p_value,
            irt_b_parameter = v_b_parameter,
            discrimination_index = v_discrimination,
            irt_a_parameter = v_a_parameter,
            is_valid_item = (v_p_value > 0.1 AND v_p_value < 0.9 AND v_discrimination > 0.1),
            last_calibrated = NOW()
        WHERE id = item_record.question_id;

        question_id := item_record.question_id;
        p_value := v_p_value;
        b_parameter := v_b_parameter;
        discrimination := v_discrimination;
        a_parameter := v_a_parameter;
        
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$ LANGUAGE plpgsql;

-- 10. Verify setup
SELECT 'IRT parameters schema created successfully!' as status;

-- 11. Show updated columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'questions' 
AND column_name IN ('irt_a_parameter', 'irt_b_parameter', 'irt_c_parameter', 'difficulty_pvalue', 'discrimination_index', 'is_valid_item', 'last_calibrated');
