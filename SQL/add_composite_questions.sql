-- Add support for composite/multi-part questions
-- Run this in Supabase SQL Editor

-- Add column for composite question sections
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'questions' AND column_name = 'question_sections') THEN
        ALTER TABLE public.questions ADD COLUMN question_sections JSONB;
    END IF;
END $$;

-- Update question_type check constraint to include new type
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check
    CHECK (question_type IN ('Pilihan Ganda', 'PGK Kategori', 'PGK MCMA', 'Komposit'));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_questions_sections ON public.questions USING GIN(question_sections);

SELECT 'Composite questions support added successfully' as status;