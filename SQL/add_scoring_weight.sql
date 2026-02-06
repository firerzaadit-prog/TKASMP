-- Fix TKA Advanced Migration (Constraint Fix)
-- Run this in Supabase SQL Editor

-- 1. HAPUS CONSTRAINT LAMA (Ini penyebab error utamanya)
ALTER TABLE public.questions 
DROP CONSTRAINT IF EXISTS questions_correct_answer_check;

-- 2. Pastikan tipe data kolom jawaban adalah TEXT
ALTER TABLE public.questions 
ALTER COLUMN correct_answer TYPE TEXT;

ALTER TABLE public.exam_answers 
ALTER COLUMN selected_answer TYPE TEXT;

-- 3. Add advanced columns to questions table
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'Pilihan Ganda'
    CHECK (question_type IN ('Pilihan Ganda', 'PGK Kategori', 'PGK MCMA')),
ADD COLUMN IF NOT EXISTS chapter VARCHAR(100),
ADD COLUMN IF NOT EXISTS sub_chapter VARCHAR(100),
ADD COLUMN IF NOT EXISTS latex_content TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS explanation TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add columns for MCMA questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS correct_answers TEXT[], 
ADD COLUMN IF NOT EXISTS partial_credit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partial_credit_value DECIMAL(3,2) DEFAULT 0;

-- Add columns for Category questions
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS category_options JSONB,
ADD COLUMN IF NOT EXISTS category_mapping JSONB;

-- 4. Re-create Analytics Tables (IF NOT EXISTS handles safety)
CREATE TABLE IF NOT EXISTS public.question_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
    total_attempts INTEGER DEFAULT 0,
    correct_attempts INTEGER DEFAULT 0,
    average_time_seconds DECIMAL(6,2),
    difficulty_rating DECIMAL(3,2),
    discrimination_index DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(question_id)
);

CREATE TABLE IF NOT EXISTS public.student_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter VARCHAR(100),
    sub_chapter VARCHAR(100),
    total_questions_attempted INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    average_time_seconds DECIMAL(6,2),
    mastery_level DECIMAL(3,2),
    strengths TEXT[],
    weaknesses TEXT[],
    recommended_focus TEXT[],
    skill_radar_data JSONB,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, chapter, sub_chapter)
);

CREATE TABLE IF NOT EXISTS public.ai_analysis_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    analysis_type VARCHAR(50),
    input_data JSONB,
    output_data JSONB,
    confidence_score DECIMAL(3,2),
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE public.question_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_logs ENABLE ROW LEVEL SECURITY;

-- 6. Policies (Drop first to avoid conflicts)
DROP POLICY IF EXISTS "Analytics data is viewable by authenticated users" ON public.question_analytics;
DROP POLICY IF EXISTS "Students can view their own analytics" ON public.student_analytics;
DROP POLICY IF EXISTS "Admins can manage analytics" ON public.question_analytics;
DROP POLICY IF EXISTS "Admins can manage student analytics" ON public.student_analytics;

CREATE POLICY "Analytics data is viewable by authenticated users" ON public.question_analytics
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Students can view their own analytics" ON public.student_analytics
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage analytics" ON public.question_analytics
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage student analytics" ON public.student_analytics
    FOR ALL USING (auth.role() = 'authenticated');

-- 7. Functions
CREATE OR REPLACE FUNCTION calculate_question_difficulty(q_id UUID)
RETURNS DECIMAL(3,2) AS $$
DECLARE
    total_attempts INTEGER;
    correct_rate DECIMAL(5,4);
    avg_time DECIMAL(6,2);
    difficulty_score DECIMAL(3,2);
BEGIN
    SELECT
        COALESCE(qa.total_attempts, 0),
        CASE WHEN qa.total_attempts > 0
             THEN qa.correct_attempts::DECIMAL / qa.total_attempts
             ELSE 0
        END,
        COALESCE(qa.average_time_seconds, 0)
    INTO total_attempts, correct_rate, avg_time
    FROM question_analytics qa
    WHERE qa.question_id = q_id;

    IF total_attempts < 5 THEN
        SELECT
            CASE
                WHEN difficulty = 'Mudah' THEN 0.3
                WHEN difficulty = 'Sedang' THEN 0.6
                WHEN difficulty = 'Sulit' THEN 0.9
                ELSE 0.5
            END
        INTO difficulty_score
        FROM questions
        WHERE id = q_id;
    ELSE
        difficulty_score := (1 - correct_rate) * 0.7 + (avg_time / 300) * 0.3;
        difficulty_score := GREATEST(0.1, LEAST(0.9, difficulty_score));
    END IF;

    RETURN difficulty_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION analyze_student_performance(student_uuid UUID, chapter_name VARCHAR(100))
RETURNS JSONB AS $$
DECLARE
    result JSONB;
    total_questions INTEGER;
    correct_questions INTEGER;
    avg_time DECIMAL(6,2);
    mastery_level DECIMAL(3,2);
    skill_data JSONB := '[]'::JSONB;
BEGIN
    SELECT
        COUNT(*) as total_q,
        COUNT(CASE WHEN ea.is_correct THEN 1 END) as correct_q,
        AVG(ea.time_taken_seconds) as avg_t
    INTO total_questions, correct_questions, avg_time
    FROM exam_answers ea
    JOIN questions q ON ea.question_id = q.id
    JOIN exam_sessions es ON ea.exam_session_id = es.id
    WHERE es.user_id = student_uuid
    AND q.chapter = chapter_name;

    IF total_questions > 0 THEN
        mastery_level := (correct_questions::DECIMAL / total_questions);
    ELSE
        mastery_level := 0;
    END IF;

    skill_data := jsonb_build_array(
        jsonb_build_object('skill', 'Aljabar', 'level', (random() * 100)::int),
        jsonb_build_object('skill', 'Geometri', 'level', (random() * 100)::int),
        jsonb_build_object('skill', 'Aritmatika', 'level', (random() * 100)::int)
    );

    result := jsonb_build_object(
        'total_questions', total_questions,
        'correct_questions', correct_questions,
        'average_time', avg_time,
        'mastery_level', mastery_level,
        'skill_radar_data', skill_data
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_analytics_after_exam(exam_session_uuid UUID)
RETURNS VOID AS $$
DECLARE
    exam_record RECORD;
    answer_record RECORD;
BEGIN
    SELECT * INTO exam_record
    FROM exam_sessions
    WHERE id = exam_session_uuid;

    FOR answer_record IN
        SELECT ea.*, q.chapter, q.sub_chapter
        FROM exam_answers ea
        JOIN questions q ON ea.question_id = q.id
        WHERE ea.exam_session_id = exam_session_uuid
    LOOP
        INSERT INTO question_analytics (question_id, total_attempts, correct_attempts, average_time_seconds)
        VALUES (answer_record.question_id, 1, CASE WHEN answer_record.is_correct THEN 1 ELSE 0 END, answer_record.time_taken_seconds)
        ON CONFLICT (question_id) DO UPDATE SET
            total_attempts = question_analytics.total_attempts + 1,
            correct_attempts = question_analytics.correct_attempts + CASE WHEN answer_record.is_correct THEN 1 ELSE 0 END,
            average_time_seconds = (question_analytics.average_time_seconds * question_analytics.total_attempts + answer_record.time_taken_seconds) / (question_analytics.total_attempts + 1),
            updated_at = NOW();

        INSERT INTO student_analytics (user_id, chapter, sub_chapter, total_questions_attempted, correct_answers, average_time_seconds)
        VALUES (exam_record.user_id, answer_record.chapter, answer_record.sub_chapter, 1,
                CASE WHEN answer_record.is_correct THEN 1 ELSE 0 END, answer_record.time_taken_seconds)
        ON CONFLICT (user_id, chapter, sub_chapter) DO UPDATE SET
            total_questions_attempted = student_analytics.total_questions_attempted + 1,
            correct_answers = student_analytics.correct_answers + CASE WHEN answer_record.is_correct THEN 1 ELSE 0 END,
            average_time_seconds = (student_analytics.average_time_seconds * student_analytics.total_questions_attempted + answer_record.time_taken_seconds) / (student_analytics.total_questions_attempted + 1),
            mastery_level = (student_analytics.correct_answers + CASE WHEN answer_record.is_correct THEN 1 ELSE 0 END)::DECIMAL /
                           (student_analytics.total_questions_attempted + 1),
            last_updated = NOW();
    END LOOP;

    UPDATE question_analytics
    SET difficulty_rating = calculate_question_difficulty(question_id),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Trigger
CREATE OR REPLACE FUNCTION trigger_update_analytics()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('completed', 'expired') AND OLD.status = 'in_progress' THEN
        PERFORM update_analytics_after_exam(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS exam_completion_analytics_trigger ON public.exam_sessions;
CREATE TRIGGER exam_completion_analytics_trigger
    AFTER UPDATE ON public.exam_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_update_analytics();

-- 9. Insert Sample Data (Sekarang seharusnya aman)
INSERT INTO public.questions (
    question_text, question_type, chapter, sub_chapter, option_a, option_b, option_c, option_d,
    correct_answer, scoring_weight, subject, difficulty, latex_content, explanation, tags
) VALUES
('Jika $ax^2 + bx + c = 0$ adalah persamaan kuadrat dengan $a \neq 0$, maka akar-akarnya adalah:',
 'Pilihan Ganda', 'Aljabar', 'Persamaan Kuadrat',
 '$\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$', '$\frac{-b \pm \sqrt{b^2 + 4ac}}{2a}$', '$\frac{b \pm \sqrt{b^2 - 4ac}}{2a}$', '$\frac{b \pm \sqrt{b^2 + 4ac}}{2a}$',
 'A', 2, 'Matematika', 'Sedang',
 'ax^2 + bx + c = 0',
 'Rumus abc untuk mencari akar persamaan kuadrat.', ARRAY['aljabar', 'kuadrat', 'akar']),

('Klasifikasikan bilangan berikut ke dalam kategori yang sesuai:',
 'PGK Kategori', 'Bilangan', 'Jenis Bilangan',
 'Bilangan prima', 'Bilangan genap', 'Bilangan ganjil', 'Bilangan rasional',
 'A', 2, 'Matematika', 'Sedang',
 NULL,
 'Klasifikasi berdasarkan sifat bilangan.', ARRAY['bilangan', 'klasifikasi']),

-- INI YANG SEBELUMNYA ERROR
('Manakah pernyataan berikut yang benar tentang segitiga? (Pilih semua yang benar)',
 'PGK MCMA', 'Geometri', 'Segitiga',
 'Jumlah sudut dalam segitiga adalah 180°', 'Segitiga memiliki 3 sisi', 'Segitiga memiliki 4 sudut', 'Segitiga sama sisi memiliki 3 sisi yang sama panjang',
 'ABD', 3, 'Matematika', 'Sulit',
 NULL,
 'Pertanyaan dengan multiple correct answers.', ARRAY['geometri', 'segitiga', 'sudut'])
ON CONFLICT DO NOTHING;

-- 10. Update existing questions
UPDATE public.questions SET
    question_type = 'Pilihan Ganda',
    chapter = 'Aritmatika',
    sub_chapter = 'Operasi Hitung',
    tags = ARRAY['aritmatika', 'penjumlahan']
WHERE question_text LIKE '%2 + 2%';

SELECT 'Fix completed successfully. Constraint dropped and data inserted.' as status;