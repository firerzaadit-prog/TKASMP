-- Create materials table for EduLearn TKA
-- Run this in Supabase SQL Editor

-- Create materials table
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    chapter VARCHAR(100),
    sub_chapter VARCHAR(100),
    subject VARCHAR(50) DEFAULT 'Matematika',
    difficulty VARCHAR(20) DEFAULT 'Sedang' CHECK (difficulty IN ('Mudah', 'Sedang', 'Sulit')),
    material_type VARCHAR(20) DEFAULT 'Artikel' CHECK (material_type IN ('Artikel', 'Video', 'Infografis', 'Latihan')),
    tags TEXT[],
    attachment_url TEXT, -- For PDF, video, or other files
    image_url TEXT, -- For cover image or illustrations
    is_published BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create material_progress table to track student progress
CREATE TABLE IF NOT EXISTS public.material_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    time_spent_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, material_id)
);

-- Enable RLS
ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies for materials
CREATE POLICY "Materials are viewable by authenticated users" ON public.materials
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can insert materials" ON public.materials
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

CREATE POLICY "Only admins can update materials" ON public.materials
    FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

CREATE POLICY "Only admins can delete materials" ON public.materials
    FOR DELETE USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

-- RLS Policies for material_progress
CREATE POLICY "Users can view their own material progress" ON public.material_progress
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own material progress" ON public.material_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own material progress" ON public.material_progress
    FOR UPDATE USING (auth.uid() = user_id);

-- Create function to update material view count
CREATE OR REPLACE FUNCTION increment_material_views(material_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.materials
    SET view_count = view_count + 1
    WHERE id = material_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_materials_subject ON public.materials(subject);
CREATE INDEX IF NOT EXISTS idx_materials_chapter ON public.materials(chapter);
CREATE INDEX IF NOT EXISTS idx_materials_type ON public.materials(material_type);
CREATE INDEX IF NOT EXISTS idx_materials_published ON public.materials(is_published);
CREATE INDEX IF NOT EXISTS idx_materials_tags ON public.materials USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_material_progress_user ON public.material_progress(user_id);

-- Insert sample materials
INSERT INTO public.materials (
    title, content, chapter, sub_chapter, subject, difficulty, material_type, tags, is_published
) VALUES
(
    'Pengantar Aljabar Dasar',
    '<h2>Apa itu Aljabar?</h2>
    <p>Aljabar adalah cabang matematika yang menggunakan simbol-simbol untuk mewakili angka dan operasi matematika.</p>

    <h3>Konsep Dasar</h3>
    <ul>
        <li>Variabel: Simbol yang mewakili nilai yang tidak diketahui</li>
        <li>Konstanta: Nilai yang tetap</li>
        <li>Koefisien: Angka yang mengalikan variabel</li>
    </ul>

    <h3>Contoh Soal</h3>
    <p>Jika x = 5, maka 2x + 3 = ?</p>
    <p><strong>Jawaban:</strong> 2×5 + 3 = 13</p>',
    'Aljabar',
    'Pengantar',
    'Matematika',
    'Mudah',
    'Artikel',
    ARRAY['aljabar', 'dasar', 'variabel'],
    true
),
(
    'Geometri: Segitiga dan Sifatnya',
    '<h2>Segitiga dalam Geometri</h2>
    <p>Segitiga adalah bangun datar yang memiliki 3 sisi dan 3 sudut.</p>

    <h3>Jenis-Jenis Segitiga</h3>
    <ol>
        <li>Segitiga sama sisi: Ketiga sisinya sama panjang</li>
        <li>Segitiga sama kaki: Dua sisi sama panjang</li>
        <li>Segitiga sembarang: Tidak ada sisi yang sama</li>
    </ol>

    <h3>Rumus Luas Segitiga</h3>
    <p>L = ½ × a × t</p>
    <p>Dimana a = alas, t = tinggi</p>',
    'Geometri',
    'Segitiga',
    'Matematika',
    'Sedang',
    'Artikel',
    ARRAY['geometri', 'segitiga', 'bangun datar'],
    true
),
(
    'Statistika: Pengertian dan Manfaat',
    '<h2>Apa itu Statistika?</h2>
    <p>Statistika adalah ilmu yang mempelajari cara mengumpulkan, menganalisis, dan menyajikan data.</p>

    <h3>Jenis Data</h3>
    <ul>
        <li>Data Kualitatif: Data non-angka (warna, jenis kelamin)</li>
        <li>Data Kuantitatif: Data angka (umur, tinggi badan)</li>
    </ul>

    <h3>Manfaat Statistika</h3>
    <ul>
        <li>Membantu pengambilan keputusan</li>
        <li>Menganalisis tren dan pola</li>
        <li>Memprediksi hasil masa depan</li>
    </ul>',
    'Statistika',
    'Pengantar',
    'Matematika',
    'Sedang',
    'Artikel',
    ARRAY['statistika', 'data', 'analisis'],
    true
);

-- Verify setup
SELECT 'Materials table created successfully' as status;
SELECT COUNT(*) as total_materials FROM public.materials;
SELECT material_type, COUNT(*) as count FROM public.materials GROUP BY material_type;