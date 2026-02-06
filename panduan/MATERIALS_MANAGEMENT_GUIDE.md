# 📚 Panduan Lengkap Manajemen Materi EduLearn TKA

## 🎯 **Fitur Manajemen Materi Lengkap**

Sistem manajemen materi pembelajaran yang memungkinkan admin untuk membuat, mengelola, dan mempublikasikan materi pembelajaran yang dapat diakses siswa.

## 🗄️ **Database Schema**

### **Tabel `materials`**
```sql
CREATE TABLE public.materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    chapter VARCHAR(100),
    sub_chapter VARCHAR(100),
    subject VARCHAR(50) DEFAULT 'Matematika',
    difficulty VARCHAR(20) DEFAULT 'Sedang',
    material_type VARCHAR(20) DEFAULT 'Artikel',
    tags TEXT[],
    attachment_url TEXT,
    image_url TEXT,
    is_published BOOLEAN DEFAULT false,
    view_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Tabel `material_progress`**
```sql
CREATE TABLE public.material_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    time_spent_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, material_id)
);
```

## 🔧 **Setup Database**

### **1. Jalankan SQL Script**
Jalankan file berikut di Supabase SQL Editor:
- `create_materials_table.sql` - Membuat tabel dan RLS policies
- `setup_materials_storage.sql` - Setup Supabase Storage untuk file materi

### **2. Verifikasi Setup**
```sql
-- Cek tabel materials
SELECT * FROM public.materials LIMIT 5;

-- Cek tabel material_progress
SELECT * FROM public.material_progress LIMIT 5;

-- Cek storage bucket
SELECT id, name, public FROM storage.buckets WHERE name = 'materials';
```

## 👨‍💼 **Fitur Admin - Manajemen Materi**

### **Akses Admin Panel**
1. Buka `admin.html`
2. Login dengan username: `admin`, password: `admin123`
3. Klik tab **"Kelola Materi"**

### **Tambah Materi Baru**

#### **Form Input:**
- **Judul Materi**: Wajib diisi
- **Tipe Materi**: Artikel, Video, Infografis, Latihan
- **Bab**: Aritmatika, Aljabar, Geometri, dll.
- **Sub Bab**: Otomatis terisi berdasarkan bab yang dipilih
- **Tingkat Kesulitan**: Mudah, Sedang, Sulit
- **Upload Gambar Cover**: Opsional, untuk cover materi
- **Upload Lampiran**: PDF, video, atau file lainnya
- **Konten Materi**: Rich text editor (TinyMCE)
- **Publish**: Checkbox untuk mempublikasikan materi

#### **Rich Text Editor (TinyMCE)**
- **Toolbar lengkap**: Bold, italic, lists, links, images
- **Format teks**: Heading, paragraph, blockquote
- **Media support**: Insert images, videos, tables
- **Code blocks**: Untuk rumus matematika atau kode

### **Kelola Materi Existing**

#### **Tabel Daftar Materi:**
- **Judul**: Nama materi (klik untuk preview)
- **Tipe**: Artikel/Video/Infografis/Latihan
- **Bab**: Kategori bab matematika
- **Mata Pelajaran**: Default "Matematika"
- **Status**: Published/Draft
- **Dilihat**: Jumlah view dari siswa
- **Aksi**: Edit dan Hapus

#### **Edit Materi:**
1. Klik tombol **"Edit"** pada baris materi
2. Form akan terisi dengan data existing
3. Lakukan perubahan
4. Klik **"Simpan Materi"**

#### **Hapus Materi:**
1. Klik tombol **"Hapus"** pada baris materi
2. Konfirmasi penghapusan
3. Materi akan dihapus permanen

## 👨‍🎓 **Fitur Siswa - Akses Materi**

### **Akses Halaman Materi**
1. Login sebagai siswa
2. Dari dashboard (`halamanpertama.html`), klik menu **"Materi"**
3. Akan diarahkan ke `materi.html`

### **Filter dan Pencarian**
- **Mata Pelajaran**: Filter berdasarkan mata pelajaran
- **Bab**: Filter berdasarkan bab matematika
- **Tipe Materi**: Filter berdasarkan tipe (Artikel, Video, dll.)
- **Tingkat Kesulitan**: Filter berdasarkan kesulitan

### **Tampilan Materi**
- **Grid Layout**: Responsive card layout
- **Cover Image**: Gambar cover materi
- **Metadata**: Tipe, bab, tingkat kesulitan, jumlah view
- **Preview**: Ringkasan konten (100 karakter pertama)

### **Baca Materi Lengkap**
1. Klik card materi
2. **View Detail**:
   - Judul dan metadata lengkap
   - Konten lengkap dengan formatting
   - Gambar cover (jika ada)
   - Lampiran file (jika ada)
   - Tombol download untuk lampiran

3. **Tracking Progress**:
   - Otomatis tercatat sebagai "dibaca"
   - View count terupdate
   - Progress tersimpan di database

## 📊 **Analytics & Tracking**

### **Admin Analytics**
- **Total Materi**: Jumlah materi di dashboard
- **View Count**: Total views per materi
- **Publish Status**: Materi published vs draft

### **Student Progress Tracking**
- **Material Progress Table**: Track pembacaan siswa
- **Read Status**: Apakah siswa sudah baca materi
- **Time Spent**: Waktu yang dihabiskan membaca
- **Completion Rate**: Persentase materi yang dibaca

## 🔒 **Security & Permissions**

### **Row Level Security (RLS)**

#### **Materials Table:**
```sql
-- Siswa hanya bisa lihat materi published
CREATE POLICY "Materials are viewable by authenticated users" ON public.materials
    FOR SELECT USING (auth.role() = 'authenticated');

-- Hanya admin yang bisa CRUD
CREATE POLICY "Only admins can insert materials" ON public.materials
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

#### **Material Progress:**
```sql
-- Siswa hanya bisa lihat progress sendiri
CREATE POLICY "Users can view their own material progress" ON public.material_progress
    FOR SELECT USING (auth.uid() = user_id);
```

### **Storage Security**
```sql
-- Bucket materials public untuk akses file
CREATE POLICY "Materials are publicly accessible" ON storage.objects
    FOR SELECT USING (bucket_id = 'materials');
```

## 🎨 **UI/UX Features**

### **Admin Interface**
- **Tabbed Interface**: Soal dan Materi terpisah
- **Rich Form**: Input lengkap dengan validasi
- **TinyMCE Editor**: WYSIWYG untuk konten
- **File Upload**: Drag & drop untuk gambar dan lampiran
- **Real-time Preview**: Preview konten saat edit

### **Student Interface**
- **Card-based Layout**: Modern dan responsive
- **Filter System**: Mudah mencari materi
- **Detail View**: Full-screen reading experience
- **Progress Indicator**: Visual feedback pembacaan

## 📱 **Responsive Design**

### **Desktop (>768px)**
- **Admin**: Full form layout dengan sidebar
- **Student**: 3-column grid untuk materi cards

### **Mobile (<768px)**
- **Admin**: Stacked form layout
- **Student**: Single column card layout

## 🚀 **Advanced Features**

### **Auto-tagging System**
```javascript
// Generate tags otomatis berdasarkan konten
function generateMaterialTags(materialData) {
    const keywords = [
        'aljabar', 'geometri', 'aritmatika', 'bilangan',
        'persamaan', 'kuadrat', 'segitiga', 'lingkaran',
        'statistika', 'peluang', 'logika', 'fungsi'
    ];
    // Auto-detect dan assign tags
}
```

### **Content Analytics**
- **View Tracking**: Increment counter saat dibaca
- **Popular Content**: Sort berdasarkan view count
- **Engagement Metrics**: Time spent, completion rate

### **File Management**
- **Multiple Formats**: Support PDF, video, images
- **Secure Upload**: Supabase Storage dengan policies
- **Public Access**: Direct download links

## 🔧 **Troubleshooting**

### **Materi Tidak Muncul di Siswa**
```sql
-- Cek apakah materi published
SELECT title, is_published FROM materials WHERE is_published = false;

-- Update status publish
UPDATE materials SET is_published = true WHERE id = 'material-id';
```

### **TinyMCE Tidak Load**
```javascript
// Cek di browser console
if (typeof tinymce === 'undefined') {
    console.error('TinyMCE not loaded');
}
```

### **File Upload Gagal**
```javascript
// Cek storage bucket permissions
SELECT * FROM storage.buckets WHERE name = 'materials';

// Cek RLS policies
SELECT * FROM pg_policies WHERE tablename = 'objects';
```

## 📋 **Checklist Implementasi**

### **Database Setup**
- ✅ `create_materials_table.sql` dijalankan
- ✅ `setup_materials_storage.sql` dijalankan
- ✅ RLS policies aktif
- ✅ Storage bucket 'materials' dibuat

### **Admin Features**
- ✅ Form tambah/edit materi
- ✅ Rich text editor (TinyMCE)
- ✅ File upload (gambar & lampiran)
- ✅ CRUD operations lengkap
- ✅ Filter dan search

### **Student Features**
- ✅ Halaman materi dengan grid layout
- ✅ Filter system
- ✅ Detail view dengan formatting
- ✅ Progress tracking
- ✅ Responsive design

### **Security**
- ✅ RLS policies implemented
- ✅ Admin-only CRUD operations
- ✅ Public read access untuk siswa
- ✅ File access controls

## 🎯 **Cara Penggunaan**

### **Untuk Admin:**
1. **Login** ke admin panel
2. **Klik "Kelola Materi"**
3. **Klik "Tambah Materi"**
4. **Isi form lengkap** dengan konten rich text
5. **Upload gambar/lampiran** jika perlu
6. **Centang "Publish"** untuk mempublikasikan
7. **Simpan** materi

### **Untuk Siswa:**
1. **Login** ke dashboard
2. **Klik menu "Materi"**
3. **Filter** berdasarkan bab/tipe jika perlu
4. **Klik card materi** untuk baca detail
5. **Download lampiran** jika tersedia

---

**Sistem manajemen materi EduLearn TKA sekarang lengkap dengan fitur CRUD, rich text editing, file upload, dan tracking progress siswa!** 📚✨