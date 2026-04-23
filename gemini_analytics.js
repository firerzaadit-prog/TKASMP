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

        // DETEKSI APAKAH JAWABAN KOSONG
        const tidakDijawab = (!jawabanSiswa || jawabanSiswa.trim() === '' || jawabanSiswa === '-');

        // BUAT INSTRUKSI DINAMIS BERDASARKAN STATUS JAWABAN
        let instruksiTugas = '';
        let statusJawaban = '';

        if (isCorrect) {
            statusJawaban = 'BENAR';
            instruksiTugas = `Jawaban siswa BENAR. Identifikasi kompetensi spesifik yang dikuasai siswa dari soal ini.`;
        } else if (tidakDijawab) {
            statusJawaban = 'TIDAK DIJAWAB (KOSONG)';
            instruksiTugas = `Siswa TIDAK MENJAWAB soal ini (dibiarkan kosong, seharusnya: ${kunciJawaban}). Ini mengindikasikan siswa mungkin sama sekali belum memahami konsepnya, bingung cara memulai, atau kehabisan waktu. Identifikasi kelemahan mendasar ini dan berikan saran agar siswa berani mencoba atau menguasai dasar materinya.`;
        } else {
            statusJawaban = 'SALAH';
            instruksiTugas = `Jawaban siswa SALAH (jawaban: ${jawabanSiswa}, seharusnya: ${kunciJawaban}). Identifikasi kesalahan konsep atau pemahaman spesifik yang menyebabkan siswa menjawab salah.`;
        }

        return `Kamu adalah guru matematika SMP yang menganalisis jawaban siswa pada soal TKA (Tes Kemampuan Akademik).

INFORMASI SOAL:
- Elemen: ${bab}
- Sub-elemen: ${subBab}
- Level Kognitif: ${levelKognitif}
- Proses Berpikir: ${prosesBerpikir}
- Kompetensi: ${competenceText}
- Soal: ${questionData.question_text || ''}
- Kunci Jawaban: ${kunciJawaban}
- Pembahasan: ${penjelasan}

JAWABAN SISWA: ${tidakDijawab ? '[KOSONG / TIDAK DIJAWAB]' : jawabanSiswa}
STATUS: ${statusJawaban}

TUGAS:
${instruksiTugas}

Aturan WAJIB:
- Jika jawaban BENAR: strengths berisi kompetensi yang dikuasai, weaknesses HARUS array kosong []
- Jika jawaban SALAH / TIDAK DIJAWAB: weaknesses berisi letak kelemahan konsep, strengths boleh kosong []
- Jangan tulis "Tidak ada kelemahan" di weaknesses jika jawaban benar - tulis [] saja
- Semua item dalam bahasa Indonesia, spesifik pada materi soal ini
- learningSuggestions harus relevan dengan materi soal ini dan sangat membantu bagi siswa yang salah/tidak bisa menjawab.

Output HANYA JSON valid tanpa markdown, tanpa teks lain:
{"score":0-100,"correctness":"Benar/Salah/Tidak Dijawab","strengths":[],"weaknesses":[],"explanation":"ringkasan singkat 1 kalimat","learningSuggestions":[]}`;
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
 // ── BATCH ANALYSIS: 1 API call untuk 30 soal sekaligus ──────────────────
    async analyzeBatchAnswers(answersPayload) {
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
                        sessionInfo: { timestamp: new Date().toISOString() }
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
                    weaknesses: Array.isArray(batchResult.weaknesses) ? batchResult.weaknesses : [],
                    learningSuggestions: Array.isArray(batchResult.learningSuggestions) ? batchResult.learningSuggestions : [],
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
        return { score: 0, correctness: "Error", explanation: "Analisis AI gagal.", strengths: [], weaknesses: [], learningSuggestions: [] };
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