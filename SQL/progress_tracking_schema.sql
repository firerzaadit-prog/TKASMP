-- Progress Tracking Schema (FIXED)
-- Run this in Supabase SQL Editor

-- ==========================================
-- 1. Create Tables
-- ==========================================

-- Create concept_progress_history table for detailed tracking
CREATE TABLE IF NOT EXISTS public.concept_progress_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    concept_id VARCHAR(100) NOT NULL, -- concept identifier (e.g., 'aritmatika_dasar')
    mastery_level FLOAT NOT NULL CHECK (mastery_level BETWEEN 0 AND 1),
    performance_score FLOAT CHECK (performance_score BETWEEN 0 AND 1),
    time_spent_seconds INTEGER,
    attempt_count INTEGER DEFAULT 1,
    difficulty_level INTEGER CHECK (difficulty_level BETWEEN 1 AND 5),
    learning_velocity FLOAT, -- rate of mastery improvement
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    -- Pastikan tabel learning_sessions sudah ada. Jika belum, baris ini akan error.
    -- Jika error, hapus constraint REFERENCES sementara atau buat tabel learning_sessions dulu.
    session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL, 
    metadata JSONB DEFAULT '{}' -- additional tracking data
);

-- Create concept_milestones table for tracking achievements
CREATE TABLE IF NOT EXISTS public.concept_milestones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    concept_id VARCHAR(100) NOT NULL,
    milestone_type VARCHAR(50) NOT NULL, -- 'first_attempt', 'mastered', 'velocity_peak', etc.
    milestone_value FLOAT,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    description TEXT,
    UNIQUE(student_id, concept_id, milestone_type)
);

-- Create progress_analytics_cache table for computed analytics
CREATE TABLE IF NOT EXISTS public.progress_analytics_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    concept_id VARCHAR(100),
    analytics_type VARCHAR(50) NOT NULL, -- 'learning_curve', 'skill_gap', 'velocity', etc.
    data JSONB NOT NULL,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) + INTERVAL '1 hour',
    UNIQUE(student_id, concept_id, analytics_type)
);

-- ==========================================
-- 2. Enable RLS
-- ==========================================
ALTER TABLE public.concept_progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_analytics_cache ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. RLS Policies (Fixed with DROP IF EXISTS)
-- ==========================================

-- Policies for concept_progress_history
DROP POLICY IF EXISTS "Users can view their own concept progress history" ON public.concept_progress_history;
CREATE POLICY "Users can view their own concept progress history" ON public.concept_progress_history
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own concept progress history" ON public.concept_progress_history;
CREATE POLICY "Users can insert their own concept progress history" ON public.concept_progress_history
    FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can update their own concept progress history" ON public.concept_progress_history;
CREATE POLICY "Users can update their own concept progress history" ON public.concept_progress_history
    FOR UPDATE USING (auth.uid() = student_id);

-- Policies for concept_milestones
DROP POLICY IF EXISTS "Users can view their own concept milestones" ON public.concept_milestones;
CREATE POLICY "Users can view their own concept milestones" ON public.concept_milestones
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own concept milestones" ON public.concept_milestones;
CREATE POLICY "Users can insert their own concept milestones" ON public.concept_milestones
    FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Policies for progress_analytics_cache
DROP POLICY IF EXISTS "Users can view their own progress analytics cache" ON public.progress_analytics_cache;
CREATE POLICY "Users can view their own progress analytics cache" ON public.progress_analytics_cache
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own progress analytics cache" ON public.progress_analytics_cache;
CREATE POLICY "Users can insert their own progress analytics cache" ON public.progress_analytics_cache
    FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can update their own progress analytics cache" ON public.progress_analytics_cache;
CREATE POLICY "Users can update their own progress analytics cache" ON public.progress_analytics_cache
    FOR UPDATE USING (auth.uid() = student_id);

-- ==========================================
-- 4. Create Indexes
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_concept_progress_history_student ON public.concept_progress_history(student_id);
CREATE INDEX IF NOT EXISTS idx_concept_progress_history_concept ON public.concept_progress_history(concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_progress_history_recorded ON public.concept_progress_history(recorded_at);
CREATE INDEX IF NOT EXISTS idx_concept_milestones_student ON public.concept_milestones(student_id);
CREATE INDEX IF NOT EXISTS idx_concept_milestones_concept ON public.concept_milestones(concept_id);
CREATE INDEX IF NOT EXISTS idx_progress_analytics_cache_student ON public.progress_analytics_cache(student_id);
CREATE INDEX IF NOT EXISTS idx_progress_analytics_cache_concept ON public.progress_analytics_cache(concept_id);
CREATE INDEX IF NOT EXISTS idx_progress_analytics_cache_type ON public.progress_analytics_cache(analytics_type);

-- ==========================================
-- 5. Functions
-- ==========================================

-- Function to calculate learning velocity
CREATE OR REPLACE FUNCTION calculate_learning_velocity(
    p_student_id UUID,
    p_concept_id VARCHAR(100),
    p_time_window_days INTEGER DEFAULT 30
)
RETURNS FLOAT AS $$
DECLARE
    velocity FLOAT := 0;
    data_points INTEGER;
    time_diff FLOAT;
    mastery_diff FLOAT;
BEGIN
    -- Calculate velocity based on recent progress
    SELECT
        COUNT(*) as points,
        EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at)))/86400 as time_span,
        (MAX(mastery_level) - MIN(mastery_level)) as mastery_gain
    INTO data_points, time_diff, mastery_diff
    FROM concept_progress_history
    WHERE student_id = p_student_id
      AND concept_id = p_concept_id
      AND recorded_at >= NOW() - INTERVAL '1 day' * p_time_window_days;

    IF data_points >= 2 AND time_diff > 0 THEN
        velocity := mastery_diff / time_diff; -- mastery gain per day
    END IF;

    RETURN velocity;
END;
$$ LANGUAGE plpgsql;

-- Function to get concept mastery trend
CREATE OR REPLACE FUNCTION get_concept_mastery_trend(
    p_student_id UUID,
    p_concept_id VARCHAR(100),
    p_periods INTEGER DEFAULT 5
)
RETURNS TABLE (
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    avg_mastery FLOAT,
    trend_direction VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    WITH periods AS (
        SELECT
            generate_series(
                date_trunc('week', NOW() - INTERVAL '1 week' * (p_periods - 1)),
                date_trunc('week', NOW()),
                INTERVAL '1 week'
            ) as period_start
    ),
    period_data AS (
        SELECT
            p.period_start,
            p.period_start + INTERVAL '1 week' as period_end,
            AVG(cph.mastery_level) as avg_mastery
        FROM periods p
        LEFT JOIN concept_progress_history cph ON
            cph.student_id = p_student_id AND
            cph.concept_id = p_concept_id AND
            cph.recorded_at >= p.period_start AND
            cph.recorded_at < p.period_start + INTERVAL '1 week'
        GROUP BY p.period_start
    )
    SELECT
        pd.period_start,
        pd.period_end,
        pd.avg_mastery,
        CASE
            WHEN pd.avg_mastery > LAG(pd.avg_mastery) OVER (ORDER BY pd.period_start) THEN 'improving'
            WHEN pd.avg_mastery < LAG(pd.avg_mastery) OVER (ORDER BY pd.period_start) THEN 'declining'
            ELSE 'stable'
        END as trend_direction
    FROM period_data pd
    ORDER BY pd.period_start;
END;
$$ LANGUAGE plpgsql;

-- Verify setup
SELECT 'Progress tracking schema updated successfully' as status;