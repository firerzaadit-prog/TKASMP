-- 1. BUAT TABEL INDUK: MATERIALS (Wajib ada sebelum material_sections)
CREATE TABLE IF NOT EXISTS public.materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. ISI DATA DUMMY KE MATERIALS (Agar skrip insert section di bawah bisa menemukan ID-nya)
INSERT INTO public.materials (title, description)
VALUES 
    ('Pengantar Aljabar Dasar', 'Materi dasar untuk pemula aljabar'),
    ('Geometri: Segitiga dan Sifatnya', 'Memahami bangun datar segitiga'),
    ('Statistika: Pengertian dan Manfaat', 'Pengenalan dasar statistika')
ON CONFLICT DO NOTHING; -- Mencegah error jika data sudah ada

-- ---------------------------------------------------------
-- KODE ASLI ANDA (SUDAH DIPERBAIKI URUTANNYA)
-- ---------------------------------------------------------

-- 3. Create material_sections table
CREATE TABLE IF NOT EXISTS public.material_sections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    section_order INTEGER NOT NULL,
    section_type VARCHAR(20) DEFAULT 'text' CHECK (section_type IN ('text', 'heading', 'list', 'code', 'image', 'video', 'file')),
    title VARCHAR(255),
    content TEXT,
    metadata JSONB, 
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,

    UNIQUE(material_id, section_order)
);

-- Enable RLS
ALTER TABLE public.material_sections ENABLE ROW LEVEL SECURITY;

-- CATATAN: Pastikan tabel "public.profiles" sudah ada sebelum menjalankan policy ini.
-- Jika belum ada, policy di bawah mungkin akan error. 
-- Untuk keamanan saat setup awal, kita buat policy sederhana dulu atau pastikan profiles ada.

-- RLS Policies for material_sections
CREATE POLICY "Material sections are viewable by authenticated users" ON public.material_sections
    FOR SELECT USING (auth.role() = 'authenticated');

-- (Opsional: Kita bungkus policy admin agar tidak error fatal jika tabel profiles belum ada)
-- Asumsi tabel profiles sudah ada sesuai setup Anda sebelumnya.
CREATE POLICY "Only admins can insert material sections" ON public.material_sections
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'admin' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email = 'admin@edulearn.com'
    ));

CREATE POLICY "Only admins can update material sections" ON public.material_sections
    FOR UPDATE USING (auth.jwt() ->> 'role' = 'admin' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email = 'admin@edulearn.com'
    ));

CREATE POLICY "Only admins can delete material sections" ON public.material_sections
    FOR DELETE USING (auth.jwt() ->> 'role' = 'admin' OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND email = 'admin@edulearn.com'
    ));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_sections_material_id ON public.material_sections(material_id);
CREATE INDEX IF NOT EXISTS idx_material_sections_order ON public.material_sections(material_id, section_order);

-- Function to update material updated_at when sections are modified
CREATE OR REPLACE FUNCTION update_material_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.materials
    SET updated_at = TIMEZONE('utc'::text, NOW())
    WHERE id = COALESCE(NEW.material_id, OLD.material_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_material_updated_at ON public.material_sections;
CREATE TRIGGER trigger_update_material_updated_at
    AFTER INSERT OR UPDATE OR DELETE ON public.material_sections
    FOR EACH ROW EXECUTE FUNCTION update_material_updated_at();

-- 4. Insert sample material sections
DO $$
DECLARE
    aljabar_material_id UUID;
    geometri_material_id UUID;
    statistika_material_id UUID;
BEGIN
    -- Get material IDs
    SELECT id INTO aljabar_material_id FROM public.materials WHERE title = 'Pengantar Aljabar Dasar' LIMIT 1;
    SELECT id INTO geometri_material_id FROM public.materials WHERE title = 'Geometri: Segitiga dan Sifatnya' LIMIT 1;
    SELECT id INTO statistika_material_id FROM public.materials WHERE title = 'Statistika: Pengertian dan Manfaat' LIMIT 1;

    -- Insert sections for Aljabar material
    IF aljabar_material_id IS NOT NULL THEN
        INSERT INTO public.material_sections (material_id, section_order, section_type, title, content) VALUES
        (aljabar_material_id, 1, 'heading', 'Apa itu Aljabar?', 'Aljabar adalah cabang matematika yang menggunakan simbol-simbol untuk mewakili angka dan operasi matematika.'),
        (aljabar_material_id, 2, 'heading', 'Konsep Dasar', NULL),
        (aljabar_material_id, 3, 'list', 'Konsep Dasar Aljabar', 'Variabel: Simbol yang mewakili nilai yang tidak diketahui\nKonstanta: Nilai yang tetap\nKoefisien: Angka yang mengalikan variabel'),
        (aljabar_material_id, 4, 'heading', 'Contoh Soal', 'Jika x = 5, maka 2x + 3 = ?'),
        (aljabar_material_id, 5, 'text', 'Jawaban', '2×5 + 3 = 13')
        ON CONFLICT (material_id, section_order) DO NOTHING;
    END IF;

    -- Insert sections for Geometri material
    IF geometri_material_id IS NOT NULL THEN
        INSERT INTO public.material_sections (material_id, section_order, section_type, title, content) VALUES
        (geometri_material_id, 1, 'heading', 'Segitiga dalam Geometri', 'Segitiga adalah bangun datar yang memiliki 3 sisi dan 3 sudut.'),
        (geometri_material_id, 2, 'heading', 'Jenis-Jenis Segitiga', NULL),
        (geometri_material_id, 3, 'list', 'Jenis Segitiga', 'Segitiga sama sisi: Ketiga sisinya sama panjang\nSegitiga sama kaki: Dua sisi sama panjang\nSegitiga sembarang: Tidak ada sisi yang sama'),
        (geometri_material_id, 4, 'heading', 'Rumus Luas Segitiga', 'L = ½ × a × t'),
        (geometri_material_id, 5, 'text', 'Keterangan', 'Dimana a = alas, t = tinggi')
        ON CONFLICT (material_id, section_order) DO NOTHING;
    END IF;

    -- Insert sections for Statistika material
    IF statistika_material_id IS NOT NULL THEN
        INSERT INTO public.material_sections (material_id, section_order, section_type, title, content) VALUES
        (statistika_material_id, 1, 'heading', 'Apa itu Statistika?', 'Statistika adalah ilmu yang mempelajari cara mengumpulkan, menganalisis, dan menyajikan data.'),
        (statistika_material_id, 2, 'heading', 'Jenis Data', NULL),
        (statistika_material_id, 3, 'list', 'Jenis Data', 'Data Kualitatif: Data non-angka (warna, jenis kelamin)\nData Kuantitatif: Data angka (umur, tinggi badan)'),
        (statistika_material_id, 4, 'heading', 'Manfaat Statistika', NULL),
        (statistika_material_id, 5, 'list', 'Manfaat Statistika', 'Membantu pengambilan keputusan\nMenganalisis tren dan pola\nMemprediksi hasil masa depan')
        ON CONFLICT (material_id, section_order) DO NOTHING;
    END IF;
END $$;

-- Verify setup
SELECT 'Setup completed successfully' as status;
SELECT m.title, COUNT(ms.id) as sections_count
FROM public.materials m
LEFT JOIN public.material_sections ms ON m.id = ms.material_id
GROUP BY m.id, m.title
ORDER BY m.title;