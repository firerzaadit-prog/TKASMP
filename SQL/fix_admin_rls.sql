-- Fix materials table schema and RLS policies
-- The database has a simple schema, we need to add the missing columns

-- Add missing columns to materials table
ALTER TABLE public.materials
ADD COLUMN IF NOT EXISTS content TEXT,
ADD COLUMN IF NOT EXISTS chapter VARCHAR(100),
ADD COLUMN IF NOT EXISTS sub_chapter VARCHAR(100),
ADD COLUMN IF NOT EXISTS subject VARCHAR(50) DEFAULT 'Matematika',
ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'Sedang' CHECK (difficulty IN ('Mudah', 'Sedang', 'Sulit')),
ADD COLUMN IF NOT EXISTS material_type VARCHAR(20) DEFAULT 'Artikel' CHECK (material_type IN ('Artikel', 'Video', 'Infografis', 'Latihan')),
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS image_url TEXT,
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Update existing records to have default values
UPDATE public.materials
SET
    content = COALESCE(content, ''),
    chapter = COALESCE(chapter, 'Aljabar'),
    sub_chapter = COALESCE(sub_chapter, 'Pengantar'),
    subject = COALESCE(subject, 'Matematika'),
    difficulty = COALESCE(difficulty, 'Sedang'),
    material_type = COALESCE(material_type, 'Artikel'),
    tags = COALESCE(tags, ARRAY[]::TEXT[]),
    is_published = COALESCE(is_published, false),
    view_count = COALESCE(view_count, 0)
WHERE content IS NULL OR chapter IS NULL;

-- Enable RLS
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Materials are viewable by authenticated users" ON public.materials;
DROP POLICY IF EXISTS "Only admins can insert materials" ON public.materials;
DROP POLICY IF EXISTS "Only admins can update materials" ON public.materials;
DROP POLICY IF EXISTS "Only admins can delete materials" ON public.materials;

-- Create permissive policies for development
CREATE POLICY "Allow all operations for development" ON public.materials
    FOR ALL USING (true);

-- Also fix material_sections policies
DROP POLICY IF EXISTS "Material sections are viewable by authenticated users" ON public.material_sections;
DROP POLICY IF EXISTS "Only admins can insert material sections" ON public.material_sections;
DROP POLICY IF EXISTS "Only admins can update material sections" ON public.material_sections;
DROP POLICY IF EXISTS "Only admins can delete material sections" ON public.material_sections;

CREATE POLICY "Allow all operations for development on sections" ON public.material_sections
    FOR ALL USING (true);

-- Note: In production, implement proper admin authentication
-- These permissive policies allow anyone to modify materials (for development only)