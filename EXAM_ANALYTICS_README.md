# Sistem Analytics Ujian TKA Matematika

Sistem lengkap untuk menyimpan jawaban ujian siswa dan mengirimkan data performa ke dashboard analytics admin.

## 📋 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Cara Kerja](#-cara-kerja)
- [Instalasi](#-instalasi)
- [Penggunaan](#-penggunaan)
- [Struktur Database](#-struktur-database)
- [API Reference](#-api-reference)
- [Contoh Implementasi](#-contoh-implementasi)

## 🚀 Fitur Utama

- ✅ **Penyimpanan Otomatis**: Jawaban siswa tersimpan real-time ke database
- 📊 **Analytics Real-time**: Admin dapat melihat performa siswa segera
- 📈 **Visualisasi Data**: Charts dan grafik performa per bab matematika
- 🎯 **Rekomendasi AI**: Saran otomatis berdasarkan analisis performa
- 📚 **Pelacakan Historis**: Tren performa siswa dari waktu ke waktu
- 🏆 **Scoring Otomatis**: Perhitungan skor berdasarkan jenis soal

## 🔄 Cara Kerja

### Alur Data Lengkap:

```
1. Siswa Login → 2. Mulai Ujian → 3. Jawab Soal → 4. Simpan Jawaban
       ↓                    ↓                    ↓                    ↓
   Autentikasi        Load Soal           Real-time Save       exam_answers
       ↓                    ↓                    ↓                    ↓
5. Selesai Ujian → 6. Hitung Skor → 7. Update Analytics → 8. Admin Dashboard
       ↓                    ↓                    ↓                    ↓
 exam_sessions    student_analytics    Visualisasi Data    Charts & Reports
```

### Proses Detail:

1. **Siswa mengerjakan ujian** di `ujian.html`
2. **Jawaban tersimpan** ke tabel `exam_answers` setiap pergantian soal
3. **Ujian selesai** → Sistem menghitung skor total
4. **Data performa** dikirim ke `student_analytics`
5. **Admin melihat** dashboard dengan data real-time

## 📦 Instalasi

### 1. Persiapan Database

Pastikan tabel-tabel berikut sudah ada di Supabase:

```sql
-- Tabel untuk menyimpan jawaban per soal
CREATE TABLE exam_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_session_id UUID REFERENCES exam_sessions(id),
    question_id UUID REFERENCES questions(id),
    selected_answer TEXT,
    is_correct BOOLEAN,
    time_taken_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabel untuk sesi ujian
CREATE TABLE exam_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    question_set_id TEXT,
    total_time_seconds INTEGER,
    total_score INTEGER,
    completed_at TIMESTAMP,
    status TEXT DEFAULT 'in_progress',
    is_passed BOOLEAN,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Tabel untuk analytics siswa
CREATE TABLE student_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    chapter TEXT,
    sub_chapter TEXT,
    total_questions_attempted INTEGER,
    correct_answers INTEGER,
    mastery_level DECIMAL,
    skill_radar_data JSONB,
    last_updated TIMESTAMP DEFAULT NOW()
);
```

### 2. Import File

```javascript
// Di ujian.js
import { updateStudentAnalyticsAfterExam } from './exam_analytics_system.js';

// Di admin.js
import { updateStudentAnalyticsFromExams } from './exam_analytics_system.js';
```

## 💻 Penggunaan

### Di Ujian (ujian.js)

```javascript
// Setelah ujian selesai
async function completeExam() {
    // Hitung skor
    const totalScore = calculateScore(questions, answers);

    // Update sesi ujian
    await supabase.from('exam_sessions').update({
        completed_at: new Date().toISOString(),
        total_score: totalScore,
        status: 'completed',
        is_passed: totalScore >= 70
    }).eq('id', examSessionId);

    // Kirim data ke analytics
    await updateStudentAnalyticsAfterExam(questions, answers, examSessionId);

    // Lanjutkan ke halaman selesai
    showExamCompleted();
}
```

### Di Admin Dashboard (admin.js)

```javascript
// Saat memuat halaman analytics
async function loadAnalytics() {
    // Update data dari ujian terbaru
    await updateStudentAnalyticsFromExams();

    // Load dan tampilkan data
    const { data: analytics } = await supabase
        .from('student_analytics')
        .select('*')
        .order('last_updated', { ascending: false });

    // Buat visualisasi
    createSkillRadarChart(analytics);
    createSkillBars(analytics);

    // Generate rekomendasi AI
    const recommendations = generateAIRecommendations(analytics);
    displayRecommendations(recommendations);
}
```

## 🗄️ Struktur Database

### exam_answers
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| exam_session_id | UUID | Referensi ke sesi ujian |
| question_id | UUID | Referensi ke soal |
| selected_answer | TEXT | Jawaban yang dipilih siswa |
| is_correct | BOOLEAN | Apakah jawaban benar |
| time_taken_seconds | INTEGER | Waktu yang dibutuhkan |
| created_at | TIMESTAMP | Waktu pembuatan |

### exam_sessions
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| user_id | UUID | ID siswa |
| question_set_id | TEXT | ID set soal |
| total_time_seconds | INTEGER | Total waktu ujian |
| total_score | INTEGER | Skor akhir |
| completed_at | TIMESTAMP | Waktu selesai |
| status | TEXT | Status ujian |
| is_passed | BOOLEAN | Lulus/tidak |

### student_analytics
| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| id | UUID | Primary key |
| user_id | UUID | ID siswa |
| chapter | TEXT | Bab matematika |
| sub_chapter | TEXT | Sub bab |
| total_questions_attempted | INTEGER | Total soal dikerjakan |
| correct_answers | INTEGER | Jawaban benar |
| mastery_level | DECIMAL | Tingkat penguasaan (0-1) |
| skill_radar_data | JSONB | Data untuk visualisasi |
| last_updated | TIMESTAMP | Terakhir update |

## 📚 API Reference

### updateStudentAnalyticsAfterExam(questions, answers, examSessionId)

Update analytics untuk satu ujian yang baru selesai.

**Parameter:**
- `questions`: Array objek soal
- `answers`: Array jawaban siswa
- `examSessionId`: ID sesi ujian

**Return:** Promise<void>

### updateStudentAnalyticsFromExams()

Update analytics agregat dari semua ujian yang telah selesai.

**Return:** Promise<void>

### calculateScore(questions, answers)

Hitung skor total berdasarkan jawaban.

**Parameter:**
- `questions`: Array objek soal
- `answers`: Array jawaban siswa

**Return:** number (total skor)

### generateAIRecommendations(analyticsData)

Generate rekomendasi AI berdasarkan data performa.

**Parameter:**
- `analyticsData`: Array data analytics siswa

**Return:** Array<string> (rekomendasi)

## 🎯 Contoh Implementasi

### Contoh Lengkap di ujian.js

```javascript
import { updateStudentAnalyticsAfterExam, calculateScore } from './exam_analytics_system.js';

// Variabel global
let questions = [];
let answers = [];
let examSessionId = null;

// Fungsi selesai ujian
async function finishExam() {
    // Validasi jawaban yang belum terisi
    const unanswered = answers.filter(answer => answer === null).length;
    if (unanswered > 0) {
        if (!confirm(`Masih ada ${unanswered} soal yang belum dijawab. Yakin ingin menyelesaikan?`)) {
            return;
        }
    }

    // Hitung skor
    const totalScore = calculateScore(questions, answers);

    // Update database
    const totalTime = Math.floor((Date.now() - examStartTime) / 1000);

    await supabase.from('exam_sessions').update({
        completed_at: new Date().toISOString(),
        total_time_seconds: totalTime,
        total_score: totalScore,
        status: 'completed',
        is_passed: totalScore >= 70
    }).eq('id', examSessionId);

    // Kirim ke analytics
    await updateStudentAnalyticsAfterExam(questions, answers, examSessionId);

    // Tampilkan hasil
    showExamCompleted();
}
```

### Contoh Lengkap di admin.js

```javascript
import { updateStudentAnalyticsFromExams, generateAIRecommendations } from './exam_analytics_system.js';

// Fungsi load analytics
async function loadAnalytics() {
    try {
        // Update data terbaru dari ujian
        await updateStudentAnalyticsFromExams();

        // Ambil data analytics
        const { data: analytics, error } = await supabase
            .from('student_analytics')
            .select('*')
            .order('last_updated', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Buat visualisasi
        createSkillRadarChart(analytics);
        createSkillBars(analytics);

        // Generate dan tampilkan rekomendasi
        const recommendations = generateAIRecommendations(analytics);
        displayRecommendations(recommendations);

    } catch (error) {
        console.error('Error loading analytics:', error);
        // Fallback ke data demo
        loadDemoAnalytics();
    }
}
```

## 🔧 Troubleshooting

### Masalah: Data tidak muncul di analytics

**Solusi:**
1. Pastikan tabel database sudah dibuat dengan benar
2. Periksa koneksi Supabase
3. Cek console browser untuk error
4. Pastikan user sudah login saat ujian

### Masalah: Skor tidak terhitung dengan benar

**Solusi:**
1. Periksa struktur data soal dan jawaban
2. Validasi logika perhitungan skor per jenis soal
3. Cek apakah `scoring_weight` sudah di-set di database

### Masalah: Analytics tidak update real-time

**Solusi:**
1. Pastikan fungsi `updateStudentAnalyticsFromExams()` dipanggil saat load analytics
2. Periksa permission database untuk operasi upsert
3. Cek apakah ada error di network request

## 📈 Keunggulan Sistem

- **Otomatis**: Tidak perlu input manual
- **Real-time**: Data tersedia segera setelah ujian
- **Komprehensif**: Analisis per bab dan subjek
- **Visual**: Mudah dipahami melalui dashboard
- **Scalable**: Mendukung banyak siswa dan ujian
- **Accurate**: Perhitungan skor berdasarkan jenis soal

## 🤝 Kontribusi

Untuk mengembangkan sistem ini lebih lanjut:

1. Fork repository
2. Buat branch fitur baru
3. Commit perubahan
4. Push ke branch
5. Buat Pull Request

## 📄 Lisensi

Sistem ini dibuat untuk keperluan edukasi dan pengembangan platform TKA Matematika.