-- Setup Supabase Storage untuk Upload Gambar
-- Jalankan di Supabase SQL Editor

-- 1. Buat bucket 'images' untuk menyimpan gambar soal
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Hapus policies yang bermasalah (jika ada)
DROP POLICY IF EXISTS "Images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage images" ON storage.objects;

-- 3. Set RLS policies yang aman untuk bucket images
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

-- 4. Verifikasi setup
SELECT 'Supabase Storage setup completed successfully' as status;
SELECT id, name, public FROM storage.buckets WHERE name = 'images';