-- Setup Supabase Storage untuk Materi Pembelajaran
-- Jalankan di Supabase SQL Editor

-- 1. Buat bucket 'materials' untuk menyimpan file materi (PDF, video, dll)
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Hapus policies yang bermasalah (jika ada)
DROP POLICY IF EXISTS "Materials are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view materials" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload material files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage material files" ON storage.objects;

-- 3. Set RLS policies yang aman untuk bucket materials
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

-- 4. Verifikasi setup
SELECT 'Materials storage setup completed successfully' as status;
SELECT id, name, public FROM storage.buckets WHERE name = 'materials';