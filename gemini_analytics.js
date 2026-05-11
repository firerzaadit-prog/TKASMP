// gemini_analytics.js - Menggunakan Edge Function Supabase sebagai proxy
// API key TIDAK disimpan di sini - aman untuk GitHub
import { supabase } from './clientSupabase.js';

const EDGE_FUNCTION_URL = 'https://tsgldkyuktqpsbeuevsn.supabase.co/functions/v1/gemini-chat';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA4MDYwNjcsImV4cCI6MjA1NjM4MjA2N30.tQSNSjP1G-HONEnRmKCE73nMgFrHFXJWyJ_PbuwuBHA';

class GeminiAnalytics {
    constructor() {
        this.cache = new Map();
    }

    async analyzeStudentAnswer(answerData, questionData) {
        try {
            const cacheKey = `${answerData.id}_${questionData.id}`;
            if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

            console.log(`[Gemini AI] Menganalisis jawaban ID: ${answerData.id}...`);
            const prompt = this.buildAnalysisPrompt(answerData, questionData);
            const responseText = await this.callGeminiAPI(prompt);
            const analysis = this.parseAIResponse(responseText);

            this.cache.set(cacheKey, analysis);
            await this.storeAnalysisResult(answerData.id, analysis);
            return analysis;
        } catch (error) {
            console.error('[Gemini AI] Gagal menganalisis:', error);
            if (error.message && error.message.includes('Rate limit')) {
                throw error;
            }
            return this.getFallbackAnalysis();
        }
    }

    /**
     * Memetakan Level Kognitif dan Proses Berpikir ke deskripsi lengkap
     * berdasarkan Matriks Kompetensi Kemdikbudristek untuk TKA SMP Matematika.
     *
     * @param {string} level   - Nilai level kognitif, misal: "Level 1", "Level 2", "Level 3",
     *                           atau nomor saja: "1", "2", "3"
     * @param {string} proses  - Nama proses berpikir, misal: "Menghitung", "Memodelkan",
     *                           "Menganalisis", dst.
     * @returns {{ levelLabel: string, prosesLabel: string, deskripsi: string,
     *             implikasiSalah: string }}
     *   - levelLabel    : Label level kognitif yang sudah dinormalisasi
     *   - prosesLabel   : Nama proses berpikir yang sudah dinormalisasi
     *   - deskripsi     : Deskripsi proses berpikir sesuai dokumen resmi Kemdikbudristek
     *   - implikasiSalah: Penjelasan spesifik tentang apa artinya siswa GAGAL pada proses ini,
     *                     digunakan AI untuk menyusun weaknesses & learningRoadmap yang tajam
     */
    getProsesBerpikirDescription(level, proses) {
        // --- Tabel pemetaan lengkap dari dokumen resmi Kemdikbudristek ---
        // Kunci: nama proses berpikir (lowercase, tanpa spasi ekstra)
        const prosesMap = {
            // ── Level 1: Pengetahuan & Pemahaman (Knowing and Understanding) ──
            'menghitung': {
                levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
                prosesLabel: 'Menghitung',
                deskripsi: 'Melakukan perhitungan berdasarkan prosedur yang mencakup operasi hitung aritmatika (+, -, ×, ÷, atau kombinasinya), operasi aljabar, atau operasi matematika lainnya.',
                implikasiSalah: 'Siswa gagal menjalankan prosedur perhitungan dasar. Kelemahan ada pada penguasaan algoritma atau operasi hitung, bukan pada pemahaman konsep tinggi. Latihan yang dibutuhkan: drill prosedur perhitungan bertahap pada topik terkait.'
            },
            'memahami informasi': {
                levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
                prosesLabel: 'Memahami Informasi',
                deskripsi: 'Memahami informasi dari grafik fungsi, tabel, diagram, infografis, atau bentuk visual lainnya.',
                implikasiSalah: 'Siswa tidak mampu membaca atau mengekstrak informasi yang tersaji secara visual (grafik, tabel, diagram). Kelemahan ada pada literasi representasi matematis. Latihan yang dibutuhkan: membaca dan menginterpretasi berbagai bentuk penyajian data secara sistematis.'
            },
            'mengelompokkan': {
                levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
                prosesLabel: 'Mengelompokkan',
                deskripsi: 'Mengelompokkan objek berdasarkan fakta, konsep, dan prinsip matematika dalam cakupan sub-elemen.',
                implikasiSalah: 'Siswa tidak dapat mengidentifikasi sifat atau atribut pembeda antar objek matematika. Kelemahan ada pada pemahaman definisi dan konsep dasar. Latihan yang dibutuhkan: identifikasi ciri dan klasifikasi objek matematika pada sub-materi terkait.'
            },
            'mengidentifikasi': {
                levelLabel: 'Level 1 – Pengetahuan & Pemahaman',
                prosesLabel: 'Mengidentifikasi',
                deskripsi: 'Melakukan identifikasi terhadap objek menggunakan konsep, fakta, dan prinsip matematika dalam cakupan sub-elemen.',
                implikasiSalah: 'Siswa tidak mampu mengenali atau mencocokkan objek/situasi dengan konsep matematika yang relevan. Kelemahan ada pada penguasaan fakta dan definisi dasar. Latihan yang dibutuhkan: menghafal dan memahami definisi, fakta, serta contoh-contoh pada sub-materi terkait.'
            },

            // ── Level 2: Aplikasi (Applying) ──
            'memodelkan': {
                levelLabel: 'Level 2 – Aplikasi',
                prosesLabel: 'Memodelkan',
                deskripsi: 'Memodelkan permasalahan kontekstual terkait cakupan sub-elemen ke dalam kalimat matematika.',
                implikasiSalah: 'Siswa gagal menerjemahkan situasi nyata/kontekstual ke dalam bentuk ekspresi atau persamaan matematika. Kelemahan ada pada jembatan antara konteks dunia nyata dan representasi formal matematis. Latihan yang dibutuhkan: latihan soal cerita bertahap—mulai dari mengidentifikasi variabel, lalu menyusun kalimat matematika secara eksplisit.'
            },
            'mengaplikasikan': {
                levelLabel: 'Level 2 – Aplikasi',
                prosesLabel: 'Mengaplikasikan',
                deskripsi: 'Mengaplikasikan strategi dan operasi matematika (berupa operasi hitung, operasi aljabar, atau bentuk operasi lainnya) untuk menyelesaikan permasalahan yang melibatkan konsep dan prosedur matematis yang familiar dan rutin.',
                implikasiSalah: 'Siswa tidak dapat menggunakan prosedur atau strategi yang sudah dipelajari pada situasi yang familiar. Kelemahan ada pada transfer pengetahuan ke soal rutin. Latihan yang dibutuhkan: mengerjakan variasi soal standar dengan prosedur yang sama secara berulang hingga otomatis.'
            },
            'menginterpretasikan': {
                levelLabel: 'Level 2 – Aplikasi',
                prosesLabel: 'Menginterpretasikan',
                deskripsi: 'Memahami dan menjelaskan makna dari berbagai situasi, kejadian, pernyataan, representasi, atau masalah matematika.',
                implikasiSalah: 'Siswa tidak mampu memaknai hasil perhitungan atau representasi matematis dalam konteks aslinya. Kelemahan ada pada kemampuan menafsirkan jawaban matematis kembali ke situasi nyata. Latihan yang dibutuhkan: latihan menjelaskan arti jawaban secara lisan/tulisan, bukan sekadar menghitung angka akhir.'
            },

            // ── Level 3: Penalaran (Reasoning) ──
            'menganalisis': {
                levelLabel: 'Level 3 – Penalaran',
                prosesLabel: 'Menganalisis',
                deskripsi: 'Menentukan, menjelaskan, dan menggunakan hubungan beberapa konsep, fakta, prinsip, atau prosedur matematika dalam cakupan sub-elemen.',
                implikasiSalah: 'Siswa tidak mampu menghubungkan dua atau lebih konsep matematika secara bersamaan untuk menyelesaikan masalah. Kelemahan ada pada penalaran relasional antar konsep. Latihan yang dibutuhkan: soal yang menuntut penggunaan lebih dari satu konsep sekaligus, dengan panduan membuat peta konsep antar topik.'
            },
            'memecahkan masalah': {
                levelLabel: 'Level 3 – Penalaran',
                prosesLabel: 'Memecahkan Masalah',
                deskripsi: 'Mengaitkan beberapa konsep, fakta, prinsip, prosedur, dan representasi matematika dalam cakupan sub-elemen, untuk menyelesaikan permasalahan dalam situasi baru atau konteks yang tidak rutin.',
                implikasiSalah: 'Siswa tidak dapat menyelesaikan masalah dalam situasi baru yang belum pernah dijumpai sebelumnya. Kelemahan ada pada fleksibilitas penalaran dan kemampuan beradaptasi dengan konteks non-rutin. Latihan yang dibutuhkan: soal open-ended dan soal tidak rutin dengan variasi konteks yang beragam, dibahas dengan pendekatan heuristik (misal: memahami soal → merencanakan → menjalankan → merefleksi).'
            },
            'mengevaluasi': {
                levelLabel: 'Level 3 – Penalaran',
                prosesLabel: 'Mengevaluasi',
                deskripsi: 'Mengevaluasi alternatif strategi dan solusi dari suatu pemecahan masalah.',
                implikasiSalah: 'Siswa tidak mampu menilai kebenaran, efisiensi, atau ketepatan suatu solusi atau strategi matematika. Kelemahan ada pada kemampuan berpikir kritis terhadap proses penyelesaian masalah. Latihan yang dibutuhkan: latihan memeriksa jawaban sendiri, membandingkan dua strategi berbeda, dan menentukan strategi mana yang lebih efisien beserta alasannya.'
            },
            'menyimpulkan': {
                levelLabel: 'Level 3 – Penalaran',
                prosesLabel: 'Menyimpulkan',
                deskripsi: 'Menarik kesimpulan yang valid dari informasi, data, atau bukti yang diberikan menggunakan konsep, fakta, prinsip, dan prosedur matematika dalam cakupan sub-elemen.',
                implikasiSalah: 'Siswa tidak mampu menarik kesimpulan yang logis dan valid berdasarkan data atau informasi yang tersedia. Kelemahan ada pada penalaran deduktif. Latihan yang dibutuhkan: latihan membaca informasi matematis lalu merumuskan kesimpulan secara eksplisit, disertai diskusi tentang apa yang boleh dan tidak boleh disimpulkan dari suatu data.'
            },
            'melakukan generalisasi': {
                levelLabel: 'Level 3 – Penalaran',
                prosesLabel: 'Melakukan Generalisasi',
                deskripsi: 'Menyusun pernyataan matematis yang menggambarkan hubungan yang lebih umum terkait konsep, fakta, prinsip, dan prosedur dalam cakupan sub-elemen.',
                implikasiSalah: 'Siswa tidak mampu mengabstraksikan pola atau aturan umum dari beberapa contoh spesifik. Kelemahan ada pada kemampuan berpikir abstrak dan membentuk generalisasi matematis. Latihan yang dibutuhkan: eksplorasi pola pada beberapa kasus konkret, kemudian dibimbing untuk merumuskan aturan umum dalam bentuk pernyataan matematis.'
            }
        };

        // Normalisasi input: lowercase dan trim
        const prosesKey = (proses || '').trim().toLowerCase();
        const levelStr  = (level  || '').trim().toLowerCase();

        // Cari entri yang cocok
        const entry = prosesMap[prosesKey];

        if (entry) {
            return entry;
        }

        // Fallback: tidak ditemukan di peta, kembalikan info generik berdasarkan level
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
            deskripsi: `Proses berpikir "${proses}" tidak ditemukan dalam peta kompetensi. Gunakan konteks soal untuk menentukan kelemahan dan saran belajar.`,
            implikasiSalah: `Analisis kelemahan dan saran belajar berdasarkan konteks materi soal secara umum.`
        };
    }

    buildAnalysisPrompt(answerData, questionData) {
        const bab = questionData.bab || questionData.chapter || '';
        const subBab = questionData.sub_bab || questionData.sub_chapter || '';
        const competenceText = questionData.competence
            || this.getCompetencyDescription(bab, subBab)
            || 'Kompetensi umum matematika';

        const isCorrect = answerData.is_correct;
        const jawabanSiswa = answerData.selected_answer || answerData.answer_text || '';
        const kunciJawaban = questionData.correct_answer || (questionData.correct_answers || []).join(', ') || '';
        const penjelasan = questionData.explanation || '';
        const levelKognitif = questionData.level_kognitif || '';
        const prosesBerpikir = questionData.proses_berpikir || '';

        // Ambil deskripsi lengkap proses berpikir dari Kemdikbudristek
        const prosesInfo = this.getProsesBerpikirDescription(levelKognitif, prosesBerpikir);

        // DETEKSI APAKAH JAWABAN KOSONG
        const tidakDijawab = (!jawabanSiswa || jawabanSiswa.trim() === '' || jawabanSiswa === '-');

        // BUAT INSTRUKSI DINAMIS BERDASARKAN STATUS JAWABAN
        let instruksiTugas = '';
        let statusJawaban = '';

        if (isCorrect) {
            statusJawaban = 'BENAR';
            instruksiTugas = `Jawaban siswa BENAR. Identifikasi kompetensi proses berpikir spesifik yang berhasil dikuasai siswa, yaitu kemampuan "${prosesInfo.prosesLabel}" pada ${prosesInfo.levelLabel}.`;
        } else if (tidakDijawab) {
            statusJawaban = 'TIDAK DIJAWAB (KOSONG)';
            instruksiTugas = `Siswa TIDAK MENJAWAB soal ini (jawaban kosong, seharusnya: ${kunciJawaban}).
Soal ini menguji proses berpikir "${prosesInfo.prosesLabel}" (${prosesInfo.levelLabel}).
Deskripsi proses berpikir ini: ${prosesInfo.deskripsi}
Implikasi kegagalan pada proses ini: ${prosesInfo.implikasiSalah}
Identifikasi kelemahan spesifik pada proses berpikir tersebut dan berikan saran belajar yang LANGSUNG mengatasi kegagalan proses berpikir "${prosesInfo.prosesLabel}", bukan sekadar menyuruh belajar materi secara umum.`;
        } else {
            statusJawaban = 'SALAH';
            instruksiTugas = `Jawaban siswa SALAH (jawaban: ${jawabanSiswa}, seharusnya: ${kunciJawaban}).
Soal ini menguji proses berpikir "${prosesInfo.prosesLabel}" (${prosesInfo.levelLabel}).
Deskripsi proses berpikir ini: ${prosesInfo.deskripsi}
Implikasi kegagalan pada proses ini: ${prosesInfo.implikasiSalah}
Identifikasi KEGAGALAN PROSES BERPIKIR "${prosesInfo.prosesLabel}" yang menyebabkan siswa menjawab salah, dan berikan saran belajar yang SPESIFIK mengatasi kegagalan proses tersebut.`;
        }

        return `Kamu adalah guru matematika SMP ahli yang menganalisis jawaban siswa pada soal TKA (Tes Kemampuan Akademik) berdasarkan Matriks Kompetensi resmi Kemdikbudristek.

INFORMASI SOAL:
- Elemen: ${bab}
- Sub-elemen: ${subBab}
- Level Kognitif: ${prosesInfo.levelLabel}
- Proses Berpikir: ${prosesInfo.prosesLabel}
- Deskripsi Proses Berpikir (Kemdikbudristek): ${prosesInfo.deskripsi}
- Kompetensi Sub-elemen: ${competenceText}
- Soal: ${questionData.question_text || ''}
- Kunci Jawaban: ${kunciJawaban}
- Pembahasan: ${penjelasan}

JAWABAN SISWA: ${tidakDijawab ? '[KOSONG / TIDAK DIJAWAB]' : jawabanSiswa}
STATUS: ${statusJawaban}

TUGAS:
${instruksiTugas}

ATURAN WAJIB UNTUK OUTPUT:
- Jika jawaban BENAR: strengths berisi nama proses berpikir yang dikuasai + kompetensi spesifik; weaknesses HARUS array kosong []
- Jika jawaban SALAH / TIDAK DIJAWAB:
  * weaknesses HARUS menyebut NAMA PROSES BERPIKIR yang gagal (misal: "Kegagalan proses Memodelkan: siswa belum mampu..."), bukan sekadar "kurang paham materi"
  * learningSuggestions HARUS berisi latihan yang SPESIFIK untuk melatih proses berpikir "${prosesInfo.prosesLabel}", bukan saran belajar generik
  * strengths boleh kosong []
- Semua item dalam bahasa Indonesia
- learningSuggestions minimal 2 saran konkret yang dapat langsung ditindaklanjuti siswa

Output HANYA JSON valid tanpa markdown, tanpa teks lain:
{"score":0-100,"correctness":"Benar/Salah/Tidak Dijawab","strengths":[],"weaknesses":[],"explanation":"ringkasan singkat 1 kalimat yang menyebut proses berpikir","learningSuggestions":[]}`;
    }

    getCompetencyDescription(bab, subBab) {
        // Fallback mapping if database doesn't have it
        const competencies = {
            // 1. BILANGAN
            'Bilangan': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Perbandingan dan sifat bilangan; Operasi aritmetika; Estimasi hasil; Faktorisasi prima; Rasio (skala, proporsi, laju perubahan); Perbandingan senilai dan berbalik nilai. Mencakup bilangan bulat, rasional, irasional, berpangkat bulat, akar, dan notasi ilmiah.',
            'Bilangan Real': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Perbandingan dan sifat-sifat bilangan; Operasi aritmetika pada bilangan; Estimasi/perkiraan hasil perhitungan; Faktorisasi prima bilangan asli; Rasio (skala, proporsi, dan laju perubahan); Perbandingan senilai dan berbalik nilai. Mencakup bilangan bulat, rasional dan irasional, berpangkat bulat, akar, dan notasi ilmiah.',

            // 2. ALJABAR
            'Aljabar': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi pada persamaan/pertidaksamaan linear, bentuk aljabar, fungsi, serta barisan dan deret.',
            'Persamaan dan Pertidaksamaan Linier': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Persamaan linear satu variabel; Pertidaksamaan linear satu variabel; Sistem persamaan linear dua variabel.',
            'Bentuk Aljabar': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Bentuk aljabar dan sifat-sifat operasinya (komutatif, asosiatif, dan distributif).',
            'Fungsi': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Relasi dan fungsi (domain, kodomain, range), serta penyajiannya.',
            'Barisan dan Deret': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Barisan berhingga bilangan; Deret berhingga bilangan.',

            // 3. GEOMETRI DAN PENGUKURAN
            'Geometri dan Pengukuran': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi terkait objek geometri, transformasi geometri, dan pengukuran dua/tiga dimensi.',
            'Objek Geometri': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Hubungan antar-sudut (berpotongan, sejajar, transversal, sudut segitiga); Teorema Pythagoras; Kekongruenan dan kesebangunan bangun datar; Jaring-jaring bangun ruang (prisma, tabung, limas, kerucut).',
            'Transformasi Geometri': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Transformasi tunggal (refleksi, translasi, rotasi, dan dilatasi) terhadap titik, garis, dan bangun datar pada bidang.',
            'Pengukuran': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Keliling dan luas bangun datar (daerah segi banyak, lingkaran, dan gabungannya); Volume bangun ruang (prisma, limas, dan bola).',

            // 4. DATA DAN PELUANG
            'Data dan Peluang': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk merumuskan, menyajikan, dan menginterpretasi data, serta analisis peluang kejadian.',
            'Data': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Perumusan, penyajian (diagram batang, garis, lingkaran, tabel), dan interpretasi data; Penentuan/penaksiran rerata (mean), median, modus, dan jangkauan (range); Perbandingan ukuran pemusatan dan penyebaran kelompok data.',
            'Peluang': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Peluang dan frekuensi relatif dari kejadian tunggal.'
        };

        // Normalize keys for case-insensitive matching
        const normalizedBab = (bab || '').trim().toLowerCase();
        const normalizedSubBab = (subBab || '').trim().toLowerCase();

        // Cari berdasarkan Sub Bab terlebih dahulu (Lebih spesifik)
        for (const [key, desc] of Object.entries(competencies)) {
            if (normalizedSubBab === key.toLowerCase()) return desc;
        }

        // Jika tidak ketemu, cari berdasarkan Bab (Lebih umum)
        for (const [key, desc] of Object.entries(competencies)) {
            if (normalizedBab === key.toLowerCase()) return desc;
            if (normalizedBab.includes(key.toLowerCase())) return desc;
        }

        return '';
    }

    async callGeminiAPI(prompt) {
        // Gunakan Edge Function sebagai proxy - API key aman di Supabase Secrets
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || SUPABASE_ANON_KEY}`,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ message: prompt })
        });

        if (!response.ok) {
            const errText = await response.text();
            if (response.status === 429 || errText.includes('quota') || errText.includes('RESOURCE_EXHAUSTED')) {
                throw new Error('Rate limit: ' + errText);
            }
            throw new Error(`Edge Function error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        // Edge Function mengembalikan: { choices: [{ message: { content: text } }] }
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Edge Function tidak memberikan jawaban: ' + JSON.stringify(data));
        return text;
    }

    async batchAnalyzeAnswers(answersData, questionsMap) {
        const results = [];
        for (const answer of answersData) {
            const question = questionsMap instanceof Map
                ? questionsMap.get(answer.question_id)
                : questionsMap[answer.question_id];
            if (question) {
                await new Promise(r => setTimeout(r, 2000));
                const analysis = await this.analyzeStudentAnswer(answer, question);
                results.push({ answerId: answer.id, analysis });
            }
        }
        return results;
    }

    parseAIResponse(responseText) {
        try {
            const clean = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const match = clean.match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
        } catch (e) {}
        return { score: 50, correctness: "Perlu Review", strengths: [], weaknesses: [], explanation: responseText, learningSuggestions: [] };
    }

    async storeAnalysisResult(answerId, analysis) {
        try {
            await supabase.from('gemini_analyses').upsert({
                answer_id: answerId,
                analysis_data: analysis,
                updated_at: new Date()
            });
        } catch (e) { console.warn("Gagal simpan ke DB", e); }
    }

    // ── BATCH ANALYSIS: 1 API call untuk 30 soal sekaligus ──────────────────
    /**
     * @param {Array}  answersPayload  - Array objek jawaban siswa (wajib)
     * @param {Object|string|null} studentHistory
     *   [CIRI 4] Data riwayat ujian sebelumnya untuk analisis longitudinal (opsional).
     *   Boleh berupa objek terstruktur atau string ringkasan.
     *   Contoh objek:
     *   {
     *     ujian_sebelumnya: [
     *       { tanggal: "2025-03-10", skor: 65, kelemahan: ["Memodelkan", "Menganalisis"] },
     *       { tanggal: "2025-04-15", skor: 70, kelemahan: ["Memodelkan"] }
     *     ]
     *   }
     */
    async analyzeBatchAnswers(answersPayload, studentHistory = null) {
        const maxRetries = 3;
        let attempt = 0;

        // Perulangan WHILE ini yang membuat perintah 'continue' menjadi sah/valid
        while (attempt < maxRetries) {
            try {
                const response = await fetch(EDGE_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                        answers: answersPayload,
                        sessionInfo: { timestamp: new Date().toISOString() },
                        // ── [CIRI 4] Sertakan riwayat pelajar dalam payload jika ada ──
                        ...(studentHistory !== null && studentHistory !== undefined
                            ? { studentHistory }
                            : {})
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    // Exponential backoff untuk error 429 / 5xx
                    if (response.status === 429 || response.status >= 500) {
                        attempt++;
                        if (attempt >= maxRetries) throw new Error(`Max retries reached: ${errText}`);
                        const waitMs = Math.pow(2, attempt) * 5000; // 10s, 20s, 40s
                        console.warn(`[AI Batch] Error ${response.status} - retry ${attempt}/${maxRetries} in ${waitMs/1000}s...`);
                        await new Promise(r => setTimeout(r, waitMs));
                        continue; // Kembali ke awal 'while' loop
                    }
                    throw new Error(`Batch error ${response.status}: ${errText}`);
                }

                const data = await response.json();

                // Menyesuaikan pembacaan data dengan output dari index.ts
                const textResult = data.choices?.[0]?.message?.content;
                if (!textResult) {
                    throw new Error('Format balasan dari server tidak sesuai');
                }

                // Membersihkan markdown JSON (jika Gemini mengirimkan ```json)
                const cleanJson = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsedResult = JSON.parse(cleanJson);

                console.log('[AI Batch] Analysis complete:', parsedResult);
                return parsedResult;

            } catch (err) {
                attempt++;
                if (attempt >= maxRetries) {
                    console.error('[AI Batch] Failed after max retries:', err);
                    throw err; // Jika sudah gagal 3x, menyerah
                }
                const waitMs = Math.pow(2, attempt) * 5000;
                console.warn(`[AI Batch] Retry ${attempt}/${maxRetries} in ${waitMs/1000}s...`);
                await new Promise(r => setTimeout(r, waitMs));
            }
        }
    }

    // Store batch result as a single session-level record
    // [CIRI 2 & 3] Dikemas kini untuk menyokong struktur weaknesses (array of objects)
    // dan learningRoadmap (object) yang baharu.
    async storeBatchResult(sessionId, batchResult) {
        try {
            if (!sessionId || !batchResult) {
                console.warn('[AI Batch] storeBatchResult: invalid args', { sessionId, batchResult });
                return;
            }

            const dataToStore = {
                answer_id: sessionId,
                analysis_data: {
                    summary: batchResult.summary || '',
                    strengths: Array.isArray(batchResult.strengths) ? batchResult.strengths : [],
                    // [CIRI 2] weaknesses kini array of objects — simpan terus tanpa transformasi
                    weaknesses: Array.isArray(batchResult.weaknesses) ? batchResult.weaknesses : [],
                    // [CIRI 3] learningRoadmap menggantikan learningSuggestions
                    learningRoadmap: (batchResult.learningRoadmap && typeof batchResult.learningRoadmap === 'object')
                        ? batchResult.learningRoadmap
                        : {
                            langkah1_mendasar: '',
                            langkah2_menengah: '',
                            langkah3_penerapan: ''
                          },
                    is_batch: true,
                    analyzed_at: new Date().toISOString()
                },
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('gemini_analyses')
                .upsert(dataToStore, { onConflict: 'answer_id' });

            if (error) {
                console.warn('[AI Batch] Store error:', error.message, error.code);
            } else {
                console.log('[AI Batch] Result stored OK for session:', sessionId);
            }
        } catch (e) {
            console.warn('[AI Batch] Store failed:', e);
        }
    }

    getFallbackAnalysis() {
        return {
            score: 0,
            correctness: "Error",
            explanation: "Analisis AI gagal.",
            strengths: [],
            weaknesses: [],
            learningSuggestions: []
        };
    }

    getFallbackCapabilityReport() {
        return { overallCapability: "Sedang", mainStrengths: [], areasForImprovement: [] };
    }
}

export const geminiAnalytics = new GeminiAnalytics();
export function isGeminiAvailable() { return true; }
export async function getGeminiStatus() {
    try {
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ message: 'Hi' })
        });
        const data = await response.json();
        return {
            available: true,
            connected: response.ok,
            validResponse: response.ok,
            error: null,
            apiConfigured: true,
            cacheSize: geminiAnalytics.cache.size,
            lastTest: new Date()
        };
    } catch (error) {
        return { available: false, connected: false, validResponse: false, error: error.message, apiConfigured: true, lastTest: new Date() };
    }
}