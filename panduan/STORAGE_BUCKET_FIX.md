# 🔧 **SUPABASE STORAGE BUCKET FIX**

## 🚨 **MASALAH YANG TERJADI:**
```
Gagal upload lampiran: Bucket not found
```

Error ini terjadi karena bucket Supabase storage belum dibuat atau policies RLS bermasalah.

## 🛠️ **SOLUSI CEPAT:**

### **1. Jalankan Script Setup Storage**
Buka **Supabase Dashboard** → **SQL Editor** → Copy-paste script berikut:

```sql
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
```

### **2. Atau Gunakan File Script**
File script lengkap tersedia di: `panduan/setup_storage_buckets.sql`

### **3. Verifikasi Setup**
Setelah menjalankan script, pastikan output menunjukkan:
```
Storage buckets setup completed successfully!
```

Dan tabel buckets menampilkan:
- `images` - public: true
- `materials` - public: true

## 📁 **BUCKET YANG DIBUTUHKAN:**

### **Bucket `images`:**
- ✅ **Digunakan untuk:** Gambar soal, foto profil siswa
- ✅ **Public access:** Ya (untuk menampilkan gambar)
- ✅ **Upload by:** Authenticated users

### **Bucket `materials`:**
- ✅ **Digunakan untuk:** File materi (PDF, video, dokumen)
- ✅ **Public access:** Ya (untuk mengakses materi)
- ✅ **Upload by:** Authenticated users (admin/students)

## 🔒 **KEAMANAN:**
- ✅ **RLS aktif** - Hanya user terautentikasi yang bisa upload
- ✅ **Public read** - Semua orang bisa melihat file
- ✅ **No recursion** - Policies tidak menyebabkan infinite loop

## 🧪 **TESTING:**
Setelah setup, coba:
1. **Upload gambar soal** di admin panel
2. **Upload lampiran materi** di admin panel
3. **Upload foto profil** di halaman siswa

Semua harus berhasil tanpa error "Bucket not found".

## 🚀 **SETELAH FIX:**
Admin panel akan bisa:
- ✅ Upload gambar untuk soal
- ✅ Upload lampiran PDF/video untuk materi
- ✅ Menyimpan file dengan aman di Supabase Storage

---

## 📞 **BUTUH BANTUAN?**
Jika masih error, periksa:
1. **Supabase project** aktif
2. **RLS enabled** di storage settings
3. **User authenticated** saat upload
4. **Bucket names** sesuai ('images', 'materials')