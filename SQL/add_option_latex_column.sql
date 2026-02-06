-- Add option_latex column to questions table for LaTeX equation support in multiple choice options
-- Run this in Supabase SQL Editor

-- Add the option_latex column to store JSON data for option LaTeX content
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS option_latex JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN public.questions.option_latex IS 'JSON object containing LaTeX content for each option (option_a_latex, option_b_latex, etc.)';

-- Create index for better performance when querying option LaTeX
CREATE INDEX IF NOT EXISTS idx_questions_option_latex ON public.questions USING GIN (option_latex);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'questions'
AND column_name = 'option_latex'
AND table_schema = 'public';