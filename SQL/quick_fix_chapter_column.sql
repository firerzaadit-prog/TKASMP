-- =============================================================================
-- QUICK FIX: Add Missing Columns for Questions Table
-- =============================================================================
-- Run this in Supabase SQL Editor to fix column not found errors
-- URL: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- Add ALL missing columns that are needed for advanced questions
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) DEFAULT 'Pilihan Ganda';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS chapter VARCHAR(100);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS sub_chapter VARCHAR(100);
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS scoring_weight INTEGER DEFAULT 1;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'Sedang';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS subject VARCHAR(50) DEFAULT 'Matematika';
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER DEFAULT 30;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS latex_content TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS correct_answers TEXT[];
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS partial_credit BOOLEAN DEFAULT false;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS category_options JSONB;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS category_mapping JSONB;

-- Verify ALL columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'questions'
AND column_name IN ('question_type', 'chapter', 'sub_chapter', 'scoring_weight', 'difficulty', 'subject', 'time_limit_minutes', 'explanation', 'category_options', 'category_mapping')
ORDER BY column_name;

-- Test query to make sure it works
SELECT id, question_text, question_type, chapter, explanation
FROM public.questions
LIMIT 5;