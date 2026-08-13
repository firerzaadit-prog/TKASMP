import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Pemetaan Proses Berpikir (Kemdikbudristek) ────────────────────────────────
// Digunakan oleh batch processor untuk memperkaya setiap item soal dalam prompt.
// Struktur mengikuti dokumen resmi Matriks Kompetensi TKA SMP Matematika.
const PROSES_BERPIKIR_MAP: Record<string, {
  levelLabel: string;
  deskripsi: string;
  implikasiSalah: string;
}> = {
  // ── Level 1: Pengetahuan & Pemahaman ──
  'menghitung': {
    levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
    deskripsi: 'Melakukan perhitungan berdasarkan prosedur yang mencakup operasi hitung aritmatika (+, -, ×, ÷, atau kombinasinya), operasi aljabar, atau operasi matematika lainnya.',
    implikasiSalah: 'Siswa gagal menjalankan prosedur perhitungan dasar. Saran: latihan drill prosedur perhitungan bertahap pada topik terkait, bukan sekadar menghafal rumus.'
  },
  'memahami informasi': {
    levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
    deskripsi: 'Memahami informasi dari grafik fungsi, tabel, diagram, infografis, atau bentuk visual lainnya.',
    implikasiSalah: 'Siswa tidak mampu membaca atau mengekstrak informasi yang tersaji secara visual. Saran: latihan membaca berbagai representasi data (grafik, tabel, diagram) secara sistematis.'
  },
  'mengelompokkan': {
    levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
    deskripsi: 'Mengelompokkan objek berdasarkan fakta, konsep, dan prinsip matematika dalam cakupan sub-elemen.',
    implikasiSalah: 'Siswa tidak dapat mengidentifikasi sifat pembeda antar objek matematika. Saran: latihan identifikasi ciri dan klasifikasi objek matematika pada sub-materi terkait.'
  },
  'mengidentifikasi': {
    levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
    deskripsi: 'Melakukan identifikasi terhadap objek menggunakan konsep, fakta, dan prinsip matematika dalam cakupan sub-elemen.',
    implikasiSalah: 'Siswa tidak mampu mengenali objek/situasi dengan konsep matematika yang relevan. Saran: pelajari definisi, fakta, dan contoh-contoh konkret pada sub-materi terkait.'
  },

  // ── Level 2: Aplikasi ──
  'memodelkan': {
    levelLabel: 'Level 2 – Aplikasi',
    deskripsi: 'Memodelkan permasalahan kontekstual terkait cakupan sub-elemen ke dalam kalimat matematika.',
    implikasiSalah: 'Siswa gagal menerjemahkan situasi nyata ke dalam bentuk ekspresi atau persamaan matematika. Saran: latihan soal cerita bertahap—identifikasi variabel → susun kalimat matematika → selesaikan. Jangan langsung ke operasi hitung.'
  },
  'mengaplikasikan': {
    levelLabel: 'Level 2 – Aplikasi',
    deskripsi: 'Mengaplikasikan strategi dan operasi matematika untuk menyelesaikan permasalahan yang melibatkan konsep dan prosedur matematis yang familiar dan rutin.',
    implikasiSalah: 'Siswa tidak dapat menggunakan prosedur yang sudah dipelajari pada situasi rutin. Saran: kerjakan variasi soal standar dengan prosedur yang sama secara berulang hingga otomatis.'
  },
  'menginterpretasikan': {
    levelLabel: 'Level 2 – Aplikasi',
    deskripsi: 'Memahami dan menjelaskan makna dari berbagai situasi, kejadian, pernyataan, representasi, atau masalah matematika.',
    implikasiSalah: 'Siswa tidak mampu memaknai hasil perhitungan dalam konteks aslinya. Saran: latihan menjelaskan arti jawaban secara lisan/tulisan, bukan sekadar menghitung angka akhir.'
  },

  // ── Level 3: Penalaran ──
  'menganalisis': {
    levelLabel: 'Level 3 – Penalaran',
    deskripsi: 'Menentukan, menjelaskan, dan menggunakan hubungan beberapa konsep, fakta, prinsip, atau prosedur matematika dalam cakupan sub-elemen.',
    implikasiSalah: 'Siswa tidak mampu menghubungkan dua atau lebih konsep matematika secara bersamaan. Saran: kerjakan soal yang menuntut penggunaan lebih dari satu konsep sekaligus, dengan panduan membuat peta konsep antar topik.'
  },
  'memecahkan masalah': {
    levelLabel: 'Level 3 – Penalaran',
    deskripsi: 'Mengaitkan beberapa konsep, fakta, prinsip, prosedur, dan representasi matematika untuk menyelesaikan permasalahan dalam situasi baru atau konteks yang tidak rutin.',
    implikasiSalah: 'Siswa tidak dapat menyelesaikan masalah dalam situasi baru/non-rutin. Saran: latihan soal open-ended dan tidak rutin dengan pendekatan heuristik (memahami soal → merencanakan → menjalankan → merefleksi).'
  },
  'mengevaluasi': {
    levelLabel: 'Level 3 – Penalaran',
    deskripsi: 'Mengevaluasi alternatif strategi dan solusi dari suatu pemecahan masalah.',
    implikasiSalah: 'Siswa tidak mampu menilai kebenaran atau efisiensi suatu solusi. Saran: latihan memeriksa jawaban sendiri, membandingkan dua strategi berbeda, dan menentukan strategi yang lebih efisien beserta alasannya.'
  },
  'menyimpulkan': {
    levelLabel: 'Level 3 – Penalaran',
    deskripsi: 'Menarik kesimpulan yang valid dari informasi, data, atau bukti yang diberikan menggunakan konsep, fakta, prinsip, dan prosedur matematika.',
    implikasiSalah: 'Siswa tidak mampu menarik kesimpulan logis dari data yang tersedia. Saran: latihan membaca informasi matematis lalu merumuskan kesimpulan secara eksplisit, disertai diskusi apa yang boleh dan tidak boleh disimpulkan.'
  },
  'melakukan generalisasi': {
    levelLabel: 'Level 3 – Penalaran',
    deskripsi: 'Menyusun pernyataan matematis yang menggambarkan hubungan yang lebih umum terkait konsep, fakta, prinsip, dan prosedur dalam cakupan sub-elemen.',
    implikasiSalah: 'Siswa tidak mampu mengabstraksikan pola atau aturan umum dari beberapa contoh spesifik. Saran: eksplorasi pola pada beberapa kasus konkret, lalu dibimbing merumuskan aturan umum dalam bentuk pernyataan matematis.'
  }
};

/**
 * Ambil info proses berpikir dari peta. Jika tidak ditemukan, kembalikan fallback.
 */
function getProsesBerpikirInfo(level: string, proses: string): {
  levelLabel: string;
  prosesLabel: string;
  deskripsi: string;
  implikasiSalah: string;
} {
  const key = (proses || '').trim().toLowerCase();
  const entry = PROSES_BERPIKIR_MAP[key];

  if (entry) {
    return { prosesLabel: proses, ...entry };
  }

  // Fallback: tentukan label level dari string level
  const levelStr = (level || '').toLowerCase();
  let levelLabel = 'Level Kognitif Tidak Diketahui';
  if (levelStr.includes('1') || levelStr.includes('pengetahuan')) {
    levelLabel = 'Level 1 – Pengetahuan & Pemahaman';
  } else if (levelStr.includes('2') || levelStr.includes('aplikasi')) {
    levelLabel = 'Level 2 – Aplikasi';
  } else if (levelStr.includes('3') || levelStr.includes('penalaran')) {
    levelLabel = 'Level 3 – Penalaran';
  }

  return {
    levelLabel,
    prosesLabel: proses || 'Tidak Diketahui',
    deskripsi: `Proses berpikir "${proses}" tidak ditemukan dalam peta kompetensi. Gunakan konteks soal.`,
    implikasiSalah: 'Analisis kelemahan dan saran belajar berdasarkan konteks materi soal.'
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // ── MODE BATCH (Array soal) ────────────────────────────────────────────
    if (body.answers && Array.isArray(body.answers)) {
      const answers = body.answers;

      // System prompt: instruksikan AI untuk fokus pada kegagalan PROSES BERPIKIR
      const systemInstruction = `Anda adalah guru matematika SMP ahli dalam asesmen kognitif berbasis Matriks Kompetensi Kemdikbudristek.
Tugas Anda: menganalisis hasil ujian siswa dan memberikan evaluasi yang SPESIFIK pada PROSES BERPIKIR yang gagal dikuasai siswa.

ATURAN KRITIS UNTUK weaknesses dan learningSuggestions:
1. weaknesses WAJIB menyebut NAMA PROSES BERPIKIR yang gagal secara eksplisit.
   Contoh BENAR: "Kegagalan proses Memodelkan (Level 2–Aplikasi): siswa belum mampu menerjemahkan soal cerita ke kalimat matematika pada topik SPLTV."
   Contoh SALAH: "Siswa kurang memahami materi aljabar." (terlalu umum, tidak menyebut proses)
2. learningSuggestions WAJIB berisi latihan yang LANGSUNG melatih proses berpikir yang gagal tersebut.
   Contoh BENAR untuk gagal "Memodelkan": "Latihan soal cerita bertahap: (1) identifikasi variabel, (2) susun kalimat matematika tanpa menghitung dulu, (3) selesaikan."
   Contoh SALAH: "Pelajari kembali materi SPLTV dari awal." (tidak menyebut latihan proses spesifik)
3. Jika soal tidak dijawab (KOSONG), anggap sebagai indikasi terkuat bahwa siswa BELUM MENGUASAI proses berpikir yang diuji soal tersebut.
4. strengths hanya diisi jika siswa menjawab BENAR, dan harus menyebut proses berpikir yang berhasil dikuasai.`;

      // Susun prompt per soal dengan informasi proses berpikir yang diperkaya
      let promptText = `${systemInstruction}\n\nAnalisis hasil ujian siswa berikut (Total ${answers.length} soal):\n\n`;

      answers.forEach((item: any, idx: number) => {
        const bab      = item.question?.bab || item.question?.chapter || 'Materi Umum';
        const subBab   = item.question?.sub_bab || item.question?.sub_chapter || '-';
        const kognitif = item.question?.level_kognitif || '-';
        const proses   = item.question?.proses_berpikir || '-';

        // Ambil deskripsi lengkap proses berpikir dari peta Kemdikbudristek
        const prosesInfo = getProsesBerpikirInfo(kognitif, proses);

        // Deteksi jawaban kosong / tidak dijawab
        const jwbSiswa = item.answer?.answer_value || item.answer?.selected_answer || '';
        const isKosong = (!jwbSiswa || jwbSiswa === '-' || jwbSiswa.trim() === '');
        const kunci    = item.question?.correct_answer || '-';
        const status   = isKosong
          ? 'TIDAK DIJAWAB (KOSONG) — indikasi kuat kegagalan proses berpikir'
          : (item.answer?.is_correct ? 'BENAR' : 'SALAH');

        promptText += `── Soal ${idx + 1} ──\n`;
        promptText += `- Elemen / Sub-elemen: ${bab} / ${subBab}\n`;
        promptText += `- Level Kognitif: ${prosesInfo.levelLabel}\n`;
        promptText += `- Proses Berpikir yang Diuji: ${prosesInfo.prosesLabel}\n`;
        promptText += `- Deskripsi Proses (Kemdikbudristek): ${prosesInfo.deskripsi}\n`;
        promptText += `- Implikasi Jika Gagal: ${prosesInfo.implikasiSalah}\n`;
        promptText += `- Pertanyaan: ${item.question?.question_text || '-'}\n`;
        promptText += `- Jawaban Siswa: ${isKosong ? '[KOSONG]' : jwbSiswa}\n`;
        promptText += `- Kunci Jawaban: ${kunci}\n`;
        promptText += `- Status: ${status}\n\n`;
      });

      promptText += `Berikan output WAJIB HANYA berupa JSON murni (tanpa markdown, tanpa tag \`\`\`json) dengan struktur berikut:
{
  "summary": "Ringkasan evaluasi performa secara keseluruhan (1-2 kalimat, sebutkan pola kegagalan proses berpikir yang dominan)",
  "strengths": [
    "Kekuatan 1: sebutkan proses berpikir dan materi/konsep spesifik yang berhasil dikuasai siswa",
    "Kekuatan 2"
  ],
  "weaknesses": [
    "Kelemahan 1: WAJIB menyebut nama proses berpikir yang gagal + level kognitif + sub-materi terkait",
    "Kelemahan 2"
  ],
  "learningSuggestions": [
    "Saran 1: WAJIB berisi latihan SPESIFIK yang melatih proses berpikir yang gagal, bukan saran belajar umum",
    "Saran 2"
  ]
}`;

      // Kirim ke API Google Gemini
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
          })
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        return new Response(
          JSON.stringify({ error: geminiData }),
          { status: 400, headers: corsHeaders }
        );
      }

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return new Response(
        JSON.stringify({ choices: [{ message: { content: text } }] }),
        { headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid Payload: 'answers' array is missing" }),
      { status: 400, headers: corsHeaders }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});