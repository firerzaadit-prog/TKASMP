# Setup Database Soal untuk EduLearn

## Overview

Fitur manajemen soal memungkinkan admin untuk membuat, mengedit, dan menghapus soal yang akan digunakan siswa dalam tes.

## Struktur Database

### Tabel `questions`
Menyimpan data soal dan jawaban:

```sql
CREATE TABLE public.questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text TEXT NOT NULL,           -- Teks pertanyaan
    option_a TEXT NOT NULL,                -- Pilihan jawaban A
    option_b TEXT NOT NULL,                -- Pilihan jawaban B
    option_c TEXT NOT NULL,                -- Pilihan jawaban C
    option_d TEXT NOT NULL,                -- Pilihan jawaban D
    correct_answer CHAR(1) NOT NULL,       -- Jawaban benar (A/B/C/D)
    time_limit_minutes INTEGER DEFAULT 30, -- Waktu pengerjaan per soal
    subject VARCHAR(50) DEFAULT 'Umum',    -- Mata pelajaran
    difficulty VARCHAR(20) DEFAULT 'Sedang', -- Tingkat kesulitan
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true         -- Status aktif/nonaktif
);
```

### Tabel `question_attempts`
Menyimpan riwayat pengerjaan siswa:

```sql
CREATE TABLE public.question_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_answer CHAR(1),               -- Jawaban yang dipilih
    is_correct BOOLEAN,                    -- Apakah jawaban benar
    time_taken_seconds INTEGER,            -- Waktu yang dibutuhkan
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, question_id)           -- Satu user hanya bisa jawab sekali
);
```

### Tabel `question_sets`
Mengelompokkan soal menjadi set tes:

```sql
CREATE TABLE public.question_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    total_questions INTEGER DEFAULT 0,
    time_limit_minutes INTEGER DEFAULT 60,
    passing_score INTEGER DEFAULT 70,
    is_active BOOLEAN DEFAULT false,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Setup Database

### 1. Jalankan SQL Migration

Buka **Supabase Dashboard** → **SQL Editor** → Copy-paste kode dari `create_questions_table.sql`:

```sql
-- Jalankan seluruh isi file create_questions_table.sql
```

### 2. Verifikasi Setup

Jalankan query untuk memastikan tabel sudah terbuat:

```sql
-- Cek tabel questions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'questions'
ORDER BY ordinal_position;

-- Cek data sample
SELECT COUNT(*) as total_questions FROM questions;
SELECT COUNT(*) as total_question_sets FROM question_sets;
```

## Fitur Admin Panel

### 1. **Manajemen Soal**
- ✅ Tambah soal baru dengan pilihan A/B/C/D
- ✅ Edit soal existing
- ✅ Hapus soal
- ✅ Set waktu pengerjaan per soal
- ✅ Kategorisasi berdasarkan mata pelajaran
- ✅ Tingkat kesulitan (Mudah/Sedang/Sulit)

### 2. **Dashboard Statistik**
- ✅ Total soal yang tersedia
- ✅ Update otomatis saat soal ditambah/dihapus

### 3. **Form Validasi**
- ✅ Validasi semua field wajib diisi
- ✅ Validasi format jawaban benar
- ✅ Preview soal sebelum disimpan

## Cara Menggunakan

### 1. **Login Admin**
```
Username: admin
Password: admin123
```

### 2. **Akses Manajemen Soal**
- Klik section "Manajemen Soal"
- Klik "Tambah Soal Baru" untuk membuat soal baru
- Atau klik "Edit" pada soal existing

### 3. **Membuat Soal Baru**
- Isi teks pertanyaan
- Isi 4 pilihan jawaban (A, B, C, D)
- Pilih jawaban yang benar
- Set waktu pengerjaan (menit)
- Pilih mata pelajaran dan tingkat kesulitan
- Klik "Simpan Soal"

### 4. **Edit/Hapus Soal**
- Klik tombol "Edit" untuk mengubah soal
- Klik tombol "Hapus" untuk menghapus soal
- Konfirmasi akan diminta sebelum menghapus

## Keamanan

- ✅ **RLS (Row Level Security)** diaktifkan
- ✅ **Policy-based access** untuk admin only
- ✅ **Input validation** di frontend dan backend
- ✅ **SQL injection protection** via Supabase

## Troubleshooting

### Error: "Could not find the 'questions' column"
- Pastikan migration SQL sudah dijalankan
- Cek apakah tabel `questions` sudah ada di database

### Error: "Permission denied"
- Pastikan menggunakan service role key untuk admin access
- Atau pastikan RLS policies sudah benar

### Soal tidak muncul di dashboard
- Cek console browser untuk error
- Pastikan koneksi internet stabil
- Verify bahwa data tersimpan di database

## Development Notes

- **Service Role Key** diperlukan untuk operasi admin
- **File**: `create_questions_table.sql` berisi full schema
- **UI Components**: Form validation dan error handling included
- **Real-time Updates**: Dashboard update otomatis saat data berubah

## Next Steps

1. **Question Sets Management** - Kelola kumpulan soal
2. **Bulk Import** - Import soal dari CSV/Excel
3. **Question Preview** - Preview soal sebelum publish
4. **Analytics** - Laporan performa siswa
5. **Question Categories** - Sistem tagging lebih advanced