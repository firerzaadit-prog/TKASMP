-- Add objectives column to materials table
-- Run this in Supabase SQL Editor

ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS objectives TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.materials.objectives IS 'Learning objectives for the material';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'materials'
AND column_name = 'objectives'
AND table_schema = 'public';