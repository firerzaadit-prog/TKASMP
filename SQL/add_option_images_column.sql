-- Add option_images column to questions table for image support in multiple choice options
-- Run this in Supabase SQL Editor

-- Add the option_images column to store JSON data for option images
ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS option_images JSONB DEFAULT '{}'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN public.questions.option_images IS 'JSON object containing image URLs for each option (option_a_image, option_b_image, etc.)';

-- Create index for better performance when querying option images
CREATE INDEX IF NOT EXISTS idx_questions_option_images ON public.questions USING GIN (option_images);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'questions'
AND column_name = 'option_images'
AND table_schema = 'public';