-- =====================================================
-- SETUP SUPABASE STORAGE BUCKETS
-- Jalankan di Supabase SQL Editor
-- =====================================================

-- 1. BUAT BUCKET 'images' UNTUK GAMBAR SOAL DAN PROFIL
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. BUAT BUCKET 'materials' UNTUK FILE MATERI (PDF, VIDEO, DLL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO NOTHING;

-- 3. HAPUS POLICIES LAMA YANG BERMASALAH (JIKA ADA)
DROP POLICY IF EXISTS "Images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their images" ON storage.objects;
DROP POLICY IF EXISTS "Materials are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete their materials" ON storage.objects;

-- 4. SETUP POLICIES UNTUK BUCKET 'images'
CREATE POLICY "Images are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'images');

CREATE POLICY "Authenticated users can upload images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'images'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can update their images" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'images'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can delete their images" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'images'
        AND auth.role() = 'authenticated'
    );

-- 5. SETUP POLICIES UNTUK BUCKET 'materials'
CREATE POLICY "Materials are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'materials');

CREATE POLICY "Authenticated users can upload materials" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'materials'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can update their materials" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'materials'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Authenticated users can delete their materials" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'materials'
        AND auth.role() = 'authenticated'
    );

-- 6. VERIFIKASI SETUP
SELECT 'Storage buckets setup completed successfully!' as status;
SELECT id, name, public, created_at FROM storage.buckets WHERE name IN ('images', 'materials') ORDER BY name;