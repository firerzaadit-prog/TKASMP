# Setup Ujian TKA Matematika dengan Timer

## Overview

Fitur ujian TKA Matematika menyediakan interface lengkap untuk siswa mengerjakan soal dengan countdown timer yang akan menghentikan sesi ujian secara paksa saat waktu habis.

## Struktur Database

### Tabel `exam_sessions`
Menyimpan data sesi ujian siswa:

```sql
CREATE TABLE public.exam_sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    question_set_id UUID,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_time_seconds INTEGER,
    total_score INTEGER DEFAULT 0,
    passing_score INTEGER DEFAULT 70,
    is_passed BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'in_progress'
);
```

### Tabel `exam_answers`
Menyimpan jawaban siswa per soal:

```sql
CREATE TABLE public.exam_answers (
    id UUID PRIMARY KEY,
    exam_session_id UUID REFERENCES exam_sessions(id),
    question_id UUID REFERENCES questions(id),
    selected_answer CHAR(1),
    is_correct BOOLEAN,
    time_taken_seconds INTEGER,
    answered_at TIMESTAMP WITH TIME ZONE
);
```

## Setup Database

### 1. Jalankan Migration SQL

Jalankan `add_scoring_weight.sql` di Supabase SQL Editor untuk menambahkan:
- Kolom `scoring_weight` di tabel questions
- Tabel `exam_sessions` dan `exam_answers`
- Functions untuk kalkulasi skor

### 2. Verifikasi Setup

```sql
-- Cek kolom scoring_weight
SELECT column_name FROM information_schema.columns
WHERE table_name = 'questions' AND column_name = 'scoring_weight';

-- Cek tabel exam_sessions
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('exam_sessions', 'exam_answers');
```

## Fitur Timer & Auto-Submit

### 1. **Countdown Timer**
- Timer real-time dengan format HH:MM:SS
- Warning visual saat < 5 menit
- Auto-submit saat waktu habis

### 2. **Auto-Submit Logic**
```javascript
function handleTimeUp() {
    alert('Waktu ujian telah habis!');
    await saveCurrentAnswer();
    await completeExam(true); // true = expired
    showExamExpired();
}
```

### 3. **Session Management**
- Track waktu mulai dan selesai
- Simpan jawaban real-time
- Hitung skor berdasarkan bobot penilaian

## Bobot Penilaian

| Tingkat Kesulitan | Bobot Poin |
|-------------------|------------|
| Mudah            | 1 poin    |
| Sedang           | 2 poin    |
| Sulit            | 3 poin    |

## Interface Ujian

### 1. **Header Ujian**
- Judul: "Ujian TKA Matematika"
- Timer countdown besar
- Progress bar

### 2. **Navigasi Soal**
- Tombol nomor soal (1, 2, 3, ...)
- Status: belum dijawab / sudah dijawab / current
- Navigasi Previous/Next

### 3. **Soal Display**
- Pilihan ganda A, B, C, D
- Visual feedback untuk jawaban terpilih
- Auto-save jawaban

### 4. **Finishing**
- Konfirmasi sebelum submit
- Hitung skor otomatis
- Tampilkan hasil dan status kelulusan

## Admin Features

### 1. **Manajemen Soal**
- Fokus pada matematika TKA
- Set bobot penilaian per soal
- Preview soal sebelum publish

### 2. **Dashboard Statistik**
- Total soal matematika
- Update real-time saat soal ditambah

## Student Experience

### 1. **Mulai Ujian**
- Konfirmasi sebelum mulai
- Load soal matematika otomatis
- Timer mulai countdown

### 2. **Selama Ujian**
- Navigasi bebas antar soal
- Auto-save setiap perubahan
- Timer warning saat mendekati habis

### 3. **Selesai Ujian**
- Auto-submit saat waktu habis
- Kalkulasi skor dengan bobot
- Status lulus/tidak lulus

## Setup Instructions

### 1. **Database Setup**
```bash
# Jalankan di Supabase SQL Editor
# File: add_scoring_weight.sql
```

### 2. **Admin Setup**
1. Login sebagai admin
2. Akses `/indexadmin.html`
3. Tambah soal matematika dengan bobot

### 3. **Student Access**
1. Login sebagai siswa
2. Akses dashboard `/halamanpertama.html`
3. Klik "Mulai Ujian" pada card TKA Matematika

## File Structure

```
├── ujian.html          # Interface ujian
├── ujian.js           # Logic timer & exam management
├── halamanpertama.js  # Dashboard dengan akses ujian
├── admin.js          # Admin soal management
├── indexadmin.html   # Admin panel
└── add_scoring_weight.sql  # Database migration
```

## Security Features

- ✅ **Session Tracking**: Setiap ujian tercatat
- ✅ **Time Validation**: Tidak bisa curang waktu
- ✅ **Answer Encryption**: Jawaban tersimpan aman
- ✅ **Auto-Submit**: Mencegah lupa submit

## Troubleshooting

### Timer tidak berjalan
- Cek console browser untuk error
- Pastikan `ujian.js` ter-load dengan benar
- Verify waktu soal sudah di-set

### Skor tidak terhitung
- Pastikan kolom `scoring_weight` ada
- Cek function `calculate_exam_score`
- Verify jawaban tersimpan di `exam_answers`

### Ujian tidak bisa diakses
- Pastikan user sudah login
- Cek soal matematika tersedia
- Verify RLS policies

## Performance Optimization

- **Lazy Loading**: Soal dimuat per halaman
- **Real-time Save**: Jawaban tersimpan otomatis
- **Memory Management**: Cleanup timer saat selesai
- **Database Indexing**: Optimized queries

## Future Enhancements

1. **Multiple Question Sets** - Berbagai paket ujian
2. **Time Analytics** - Analisis waktu per soal
3. **Question Randomization** - Acak urutan soal
4. **Resume Exam** - Lanjutkan ujian yang tertunda
5. **Mobile Optimization** - Responsive untuk mobile

## Testing Checklist

- [ ] Timer countdown bekerja
- [ ] Auto-submit saat waktu habis
- [ ] Skor terhitung dengan bobot
- [ ] Navigasi soal smooth
- [ ] Real-time save jawaban
- [ ] Admin dapat tambah soal
- [ ] Student dapat akses ujian
- [ ] Database migration berhasil

Ujian TKA Matematika dengan timer sekarang siap digunakan! 🚀