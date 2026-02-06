-- Create questions table for EduLearn TKA (ULTIMATE FIX)
-- Run this in Supabase SQL Editor
-- This version handles all edge cases and dependencies

-- DROP existing tables in reverse dependency order (if they exist)
DROP TABLE IF EXISTS public.question_set_questions CASCADE;
DROP TABLE IF EXISTS public.question_sets CASCADE;
DROP TABLE IF EXISTS public.question_attempts CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;

-- 1. BUAT TABEL PARENT TERLEBIH DAHULU
CREATE TABLE public.questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    time_limit_minutes INTEGER DEFAULT 30,
    subject VARCHAR(50) DEFAULT 'Umum',
    difficulty VARCHAR(20) DEFAULT 'Sedang' CHECK (difficulty IN ('Mudah', 'Sedang', 'Sulit')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- 2. BARU BUAT TABEL CHILD YANG MEREFERENSIKAN
CREATE TABLE public.question_attempts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE, -- ← SEKARANG BISA
    selected_answer CHAR(1),
    is_correct BOOLEAN,
    time_taken_seconds INTEGER,
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, question_id)
);

-- 3. Buat tabel question_sets
CREATE TABLE public.question_sets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_questions INTEGER DEFAULT 0,
    time_limit_minutes INTEGER DEFAULT 60,
    passing_score INTEGER DEFAULT 70,
    is_active BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Buat junction table
CREATE TABLE public.question_set_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    question_set_id UUID REFERENCES public.question_sets(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE, -- ← SEKARANG BISA
    order_position INTEGER,
    UNIQUE(question_set_id, question_id)
);

-- LANJUTKAN DENGAN RLS POLICIES, FUNCTIONS, TRIGGERS, INDEXES, DAN SAMPLE DATA...

-- Enable RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_set_questions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for questions
CREATE POLICY "Questions are viewable by authenticated users" ON public.questions
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow questions management for admin panel (simple auth)
CREATE POLICY "Allow questions management" ON public.questions
    FOR ALL USING (true);

-- RLS Policies for question_attempts
CREATE POLICY "Users can view their own attempts" ON public.question_attempts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attempts" ON public.question_attempts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for question_sets
CREATE POLICY "Question sets are viewable by authenticated users" ON public.question_sets
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can manage question sets" ON public.question_sets
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

-- RLS Policies for question_set_questions
CREATE POLICY "Question set questions are viewable by authenticated users" ON public.question_set_questions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can manage question set questions" ON public.question_set_questions
    FOR ALL USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

-- Create function to update question_sets total_questions
CREATE OR REPLACE FUNCTION update_question_set_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.question_sets
    SET total_questions = (
        SELECT COUNT(*) FROM public.question_set_questions
        WHERE question_set_id = COALESCE(NEW.question_set_id, OLD.question_set_id)
    )
    WHERE id = COALESCE(NEW.question_set_id, OLD.question_set_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating question count
CREATE TRIGGER update_question_count_trigger
    AFTER INSERT OR DELETE ON public.question_set_questions
    FOR EACH ROW EXECUTE FUNCTION update_question_set_count();

-- Create indexes for better performance
CREATE INDEX idx_questions_subject ON public.questions(subject);
CREATE INDEX idx_questions_difficulty ON public.questions(difficulty);
CREATE INDEX idx_questions_active ON public.questions(is_active);
CREATE INDEX idx_question_attempts_user ON public.question_attempts(user_id);
CREATE INDEX idx_question_attempts_question ON public.question_attempts(question_id);
CREATE INDEX idx_question_sets_active ON public.question_sets(is_active);

-- Insert sample questions for testing
INSERT INTO public.questions (question_text, option_a, option_b, option_c, option_d, correct_answer, time_limit_minutes, subject, difficulty) VALUES
('Berapakah hasil dari 2 + 2?', '3', '4', '5', '6', 'B', 5, 'Matematika', 'Mudah'),
('Siapakah presiden pertama Indonesia?', 'Soekarno', 'Soeharto', 'Habibie', 'Gus Dur', 'A', 10, 'Sejarah', 'Mudah'),
('Apa ibukota Indonesia?', 'Bandung', 'Surabaya', 'Jakarta', 'Medan', 'C', 5, 'Geografi', 'Mudah');

-- Insert sample question set
INSERT INTO public.question_sets (title, description, total_questions, time_limit_minutes, passing_score) VALUES
('Tes Kemampuan Dasar', 'Tes untuk mengukur kemampuan dasar siswa SMP', 3, 30, 70);

-- Link questions to question set
INSERT INTO public.question_set_questions (question_set_id, question_id, order_position)
SELECT qs.id, q.id, ROW_NUMBER() OVER (ORDER BY q.created_at)
FROM public.question_sets qs
CROSS JOIN public.questions q
WHERE qs.title = 'Tes Kemampuan Dasar'
AND q.subject IN ('Matematika', 'Sejarah', 'Geografi');

-- Verify setup
SELECT 'Questions table created successfully' as status;
SELECT COUNT(*) as total_questions FROM public.questions;
SELECT COUNT(*) as total_question_sets FROM public.question_sets;