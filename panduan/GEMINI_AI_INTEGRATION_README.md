# Gemini AI Integration untuk Analisis Jawaban Siswa

Panduan lengkap untuk mengintegrasikan Google Gemini AI dalam sistem EduLearn TKA untuk analisis mendalam jawaban siswa.

## 🎯 **Fitur Utama**

- **Analisis Jawaban Otomatis**: Gemini AI menganalisis setiap jawaban siswa secara detail
- **Identifikasi Kekuatan & Kelemahan**: Mendeteksi pola kekuatan dan kelemahan siswa
- **Rekomendasi Pembelajaran**: Saran pembelajaran yang dipersonalisasi
- **Skoring Cerdas**: Evaluasi kebenaran jawaban dengan konteks
- **Laporan Kemampuan**: Ringkasan kemampuan siswa secara keseluruhan

## 📋 **Prasyarat**

1. **Google Cloud Project** dengan Gemini AI API enabled
2. **API Key** dari Google AI Studio
3. **Database Schema** yang telah di-setup

## ⚙️ **Setup & Konfigurasi**

### 1. **Dapatkan Gemini API Key**

1. Kunjungi [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Buat project baru atau pilih existing project
3. Generate API key
4. Copy API key untuk digunakan dalam aplikasi

### 2. **Konfigurasi API Key**

Edit file `gemini_analytics.js`:

```javascript
const GEMINI_API_KEY = 'YOUR_ACTUAL_API_KEY_HERE'; // Ganti dengan API key asli
```

### 3. **Setup Database**

Jalankan SQL script untuk membuat tabel analisis:

```sql
-- Jalankan file: SQL/gemini_analytics_schema.sql
\i SQL/gemini_analytics_schema.sql
```

### 4. **Import Dependencies**

Pastikan file-file berikut sudah di-import dengan benar:

```javascript
// Di analytics.js
import { geminiAnalytics, isGeminiAvailable } from './gemini_analytics.js';
```

## 🚀 **Cara Penggunaan**

### **Analisis Otomatis**

Sistem akan secara otomatis menganalisis jawaban siswa ketika:

1. Siswa menyelesaikan ujian
2. Admin membuka halaman Analytics
3. Sistem mendeteksi jawaban baru yang belum dianalisis

### **Melihat Hasil Analisis**

1. **Dashboard Analytics**: Buka tab "Gemini AI"
2. **Status Gemini**: Cek apakah AI aktif dan berfungsi
3. **Analisis Detail**: Lihat breakdown setiap jawaban
4. **Insights**: Lihat pola kekuatan dan kelemahan kelas

### **Manual Testing**

Jalankan file test untuk memastikan integrasi berfungsi:

```javascript
// Jalankan di browser console atau Node.js
import { runAllTests } from './test_gemini_analytics.js';
runAllTests();
```

## 📊 **Output Analisis Gemini**

Setiap analisis menghasilkan data terstruktur:

```json
{
  "score": 85,
  "correctness": "Sebagian Benar",
  "strengths": [
    "Memahami konsep dasar",
    "Langkah-langkah sistematis"
  ],
  "weaknesses": [
    "Kurang teliti dalam perhitungan",
    "Lupa konversi satuan"
  ],
  "explanation": "Penjelasan detail mengapa jawaban benar/salah...",
  "learningSuggestions": [
    "Pelajari ulang konversi satuan",
    "Praktik soal perhitungan lebih banyak"
  ],
  "concepts": ["Aritmatika", "Konversi Satuan"],
  "practiceExamples": ["Contoh soal 1", "Contoh soal 2"],
  "difficulty": "Sedang",
  "timeSpent": "Efisien"
}
```

## 🎨 **UI Components**

### **Tab Gemini AI**
- **Status Display**: Menampilkan status koneksi Gemini AI
- **Analysis Cards**: Detail analisis setiap jawaban
- **Insights Panel**: Ringkasan pola kelas

### **Score Badges**
- 🟢 **Excellent** (80-100): Hijau
- 🔵 **Good** (60-79): Biru
- 🟡 **Average** (40-59): Kuning
- 🔴 **Poor** (0-39): Merah

## 🔧 **Troubleshooting**

### **Error: "Gemini API error: 400"**
- Periksa API key valid dan belum expired
- Pastikan billing diaktifkan di Google Cloud
- Cek quota penggunaan API

### **Error: "Duplicate export"**
- Pastikan tidak ada export duplikat di `content_adaptation.js`
- Jalankan `npm run build` untuk clean build

### **Analisis tidak muncul**
- Cek koneksi internet
- Pastikan tabel `gemini_analyses` sudah dibuat
- Lihat browser console untuk error details

## 📈 **Analytics & Insights**

### **Dashboard Insights**
- **Kualitas Jawaban**: Rata-rata skor analisis AI
- **Kelebihan Siswa**: Pola kekuatan yang paling umum
- **Kekurangan Siswa**: Area yang perlu diperbaiki
- **Rekomendasi**: Saran pembelajaran berdasarkan analisis

### **Laporan Kemampuan Siswa**
- Evaluasi keseluruhan kemampuan
- Identifikasi area kekuatan utama
- Deteksi kesenjangan pembelajaran
- Rekomendasi tingkat kesulitan yang sesuai

## 🔒 **Keamanan & Privasi**

- **Data Encryption**: Jawaban siswa dienkripsi saat transit
- **Access Control**: Hanya admin yang dapat melihat analisis detail
- **Data Retention**: Analisis disimpan sesuai kebijakan sekolah
- **API Security**: API key tidak diekspos ke client-side

## 📚 **Best Practices**

### **Optimasi Performa**
- Analisis dilakukan secara batch untuk efisiensi
- Cache hasil analisis untuk menghindari API call berulang
- Rate limiting untuk menghindari quota exceeded

### **Quality Assurance**
- Validasi output Gemini sebelum ditampilkan
- Fallback ke analisis manual jika AI gagal
- Monitoring accuracy analisis secara berkala

### **User Experience**
- Loading indicators saat analisis berlangsung
- Error handling yang user-friendly
- Progressive disclosure untuk informasi detail

## 🔄 **Update & Maintenance**

### **Update API Key**
```javascript
// Edit gemini_analytics.js
const GEMINI_API_KEY = 'NEW_API_KEY';
```

### **Monitoring Usage**
- Track API quota usage
- Monitor response times
- Log error rates

### **Model Updates**
- Gemini AI model diperbarui secara otomatis
- Test compatibility dengan versi baru
- Update prompts jika diperlukan

## 📞 **Support**

Untuk bantuan teknis atau pertanyaan:
- Cek dokumentasi Google Gemini AI
- Review browser console untuk error details
- Pastikan semua dependencies ter-install dengan benar

---

**Catatan**: Pastikan untuk mematuhi terms of service Google Gemini AI dan kebijakan privasi data siswa saat menggunakan fitur ini.