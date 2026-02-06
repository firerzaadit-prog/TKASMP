-- Fix exam_sessions table schema
-- Run this in Supabase SQL Editor to fix the foreign key relationship issue

-- Drop the table if it exists with wrong foreign key
DROP TABLE IF EXISTS public.exam_sessions CASCADE;

-- Create the correct exam_sessions table
CREATE TABLE IF NOT EXISTS public.exam_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_set_id UUID,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    total_time_seconds INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    passing_score INTEGER DEFAULT 70,
    is_passed BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'in_progress',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create exam_answers table if not exists
CREATE TABLE IF NOT EXISTS public.exam_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_answer CHAR(1),
    is_correct BOOLEAN DEFAULT false,
    time_taken_seconds INTEGER DEFAULT 0,
    answered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_answers ENABLE ROW LEVEL SECURITY;

-- Policies for exam_sessions
DROP POLICY IF EXISTS "Users can view their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can view their own exam sessions" ON public.exam_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can insert their own exam sessions" ON public.exam_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can update their own exam sessions" ON public.exam_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Policies for exam_answers
DROP POLICY IF EXISTS "Users can view their own exam answers" ON public.exam_answers;
CREATE POLICY "Users can view their own exam answers" ON public.exam_answers
    FOR SELECT USING (
        auth.uid() = (SELECT user_id FROM public.exam_sessions WHERE id = exam_session_id)
    );

DROP POLICY IF EXISTS "Users can insert their own exam answers" ON public.exam_answers;
CREATE POLICY "Users can insert their own exam answers" ON public.exam_answers
    FOR INSERT WITH CHECK (
        auth.uid() = (SELECT user_id FROM public.exam_sessions WHERE id = exam_session_id)
    );

DROP POLICY IF EXISTS "Users can update their own exam answers" ON public.exam_answers;
CREATE POLICY "Users can update their own exam answers" ON public.exam_answers
    FOR UPDATE USING (
        auth.uid() = (SELECT user_id FROM public.exam_sessions WHERE id = exam_session_id)
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_id ON public.exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON public.exam_sessions(status);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_created_at ON public.exam_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_exam_answers_session_id ON public.exam_answers(exam_session_id);
CREATE INDEX IF NOT EXISTS idx_exam_answers_question_id ON public.exam_answers(question_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exam_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_exam_sessions_updated_at ON public.exam_sessions;
CREATE TRIGGER trigger_update_exam_sessions_updated_at
    BEFORE UPDATE ON public.exam_sessions
    FOR EACH ROW EXECUTE FUNCTION update_exam_sessions_updated_at();

-- Grant necessary permissions
GRANT ALL ON public.exam_sessions TO authenticated;
GRANT ALL ON public.exam_answers TO authenticated;

SELECT 'Exam sessions schema fixed successfully' as status;