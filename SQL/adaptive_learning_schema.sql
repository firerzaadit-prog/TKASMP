-- Adaptive Learning System Schema (FIXED)
-- Run this in Supabase SQL Editor

-- 1. Create Tables (Gunakan IF NOT EXISTS agar data lama aman)
CREATE TABLE IF NOT EXISTS public.adaptive_content (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    difficulty_level INTEGER NOT NULL CHECK (difficulty_level BETWEEN 1 AND 10),
    prerequisites UUID[],
    subject VARCHAR(50) DEFAULT 'Matematika',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.learning_paths (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Ubah ke auth.users jika profiles belum ada, atau biarkan public.profiles jika sudah setup
    path_name TEXT NOT NULL,
    content_sequence UUID[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.concept_mastery (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Disarankan refer ke auth.users untuk konsistensi jika profiles opsional
    content_id UUID REFERENCES public.adaptive_content(id) ON DELETE CASCADE,
    mastery_level FLOAT NOT NULL CHECK (mastery_level BETWEEN 0 AND 1),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(student_id, content_id)
);

CREATE TABLE IF NOT EXISTS public.learning_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.adaptive_content(id) ON DELETE CASCADE,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    session_end TIMESTAMP WITH TIME ZONE,
    performance_score FLOAT CHECK (performance_score BETWEEN 0 AND 1),
    time_spent_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable RLS on all tables
ALTER TABLE public.adaptive_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for adaptive_content (DROP dulu sebelum CREATE)
DROP POLICY IF EXISTS "Adaptive content viewable by authenticated users" ON public.adaptive_content;
CREATE POLICY "Adaptive content viewable by authenticated users" ON public.adaptive_content
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Only admins can insert adaptive content" ON public.adaptive_content;
CREATE POLICY "Only admins can insert adaptive content" ON public.adaptive_content
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'role' = 'admin' 
        OR auth.email() = 'admin@edulearn.com' -- Menggunakan auth.email() lebih aman daripada subquery ke profiles
    );

DROP POLICY IF EXISTS "Only admins can update adaptive content" ON public.adaptive_content;
CREATE POLICY "Only admins can update adaptive content" ON public.adaptive_content
    FOR UPDATE USING (
        auth.jwt() ->> 'role' = 'admin' 
        OR auth.email() = 'admin@edulearn.com'
    );

DROP POLICY IF EXISTS "Only admins can delete adaptive content" ON public.adaptive_content;
CREATE POLICY "Only admins can delete adaptive content" ON public.adaptive_content
    FOR DELETE USING (
        auth.jwt() ->> 'role' = 'admin' 
        OR auth.email() = 'admin@edulearn.com'
    );

-- 4. RLS Policies for learning_paths
DROP POLICY IF EXISTS "Users can view their own learning paths" ON public.learning_paths;
CREATE POLICY "Users can view their own learning paths" ON public.learning_paths
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own learning paths" ON public.learning_paths;
CREATE POLICY "Users can insert their own learning paths" ON public.learning_paths
    FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can update their own learning paths" ON public.learning_paths;
CREATE POLICY "Users can update their own learning paths" ON public.learning_paths
    FOR UPDATE USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can delete their own learning paths" ON public.learning_paths;
CREATE POLICY "Users can delete their own learning paths" ON public.learning_paths
    FOR DELETE USING (auth.uid() = student_id);

-- 5. RLS Policies for concept_mastery
DROP POLICY IF EXISTS "Users can view their own concept mastery" ON public.concept_mastery;
CREATE POLICY "Users can view their own concept mastery" ON public.concept_mastery
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own concept mastery" ON public.concept_mastery;
CREATE POLICY "Users can insert their own concept mastery" ON public.concept_mastery
    FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can update their own concept mastery" ON public.concept_mastery;
CREATE POLICY "Users can update their own concept mastery" ON public.concept_mastery
    FOR UPDATE USING (auth.uid() = student_id);

-- 6. RLS Policies for learning_sessions
DROP POLICY IF EXISTS "Users can view their own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can view their own learning sessions" ON public.learning_sessions
    FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can insert their own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can insert their own learning sessions" ON public.learning_sessions
    FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Users can update their own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can update their own learning sessions" ON public.learning_sessions
    FOR UPDATE USING (auth.uid() = student_id);

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_adaptive_content_subject ON public.adaptive_content(subject);
CREATE INDEX IF NOT EXISTS idx_adaptive_content_difficulty ON public.adaptive_content(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_learning_paths_student ON public.learning_paths(student_id);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_student ON public.concept_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_content ON public.concept_mastery(content_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_student ON public.learning_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_content ON public.learning_sessions(content_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_start ON public.learning_sessions(session_start);

-- 8. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handle_updated_at_adaptive_content ON public.adaptive_content;
CREATE TRIGGER handle_updated_at_adaptive_content
    BEFORE UPDATE ON public.adaptive_content
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at_learning_paths ON public.learning_paths;
CREATE TRIGGER handle_updated_at_learning_paths
    BEFORE UPDATE ON public.learning_paths
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Verify setup
SELECT 'Adaptive learning schema created/updated successfully' as status;