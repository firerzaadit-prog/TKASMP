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

JAWABAN SISWA: ${jawabanSiswa}
STATUS: ${isCorrect ? 'BENAR' : 'SALAH'}

TUGAS:
${isCorrect
  ? `Jawaban siswa BENAR. Identifikasi kompetensi spesifik yang dikuasai siswa dari soal ini.`
  : `Jawaban siswa SALAH (jawaban: ${jawabanSiswa}, seharusnya: ${kunciJawaban}). Identifikasi kesalahan konsep atau pemahaman yang menyebabkan siswa menjawab salah.`
}

Aturan WAJIB:
- Jika jawaban BENAR: strengths berisi kompetensi yang dikuasai, weaknesses HARUS array kosong []
- Jika jawaban SALAH: weaknesses berisi kesalahan konsep spesifik, strengths boleh kosong []
- Jangan tulis "Tidak ada kelemahan" di weaknesses jika jawaban benar - tulis [] saja
- Semua item dalam bahasa Indonesia, spesifik pada materi soal ini
- learningSuggestions harus relevan dengan materi soal ini

Output HANYA JSON valid tanpa markdown, tanpa teks lain:
{"score":0-100,"correctness":"Benar/Salah/Sebagian","strengths":[],"weaknesses":[],"explanation":"ringkasan singkat 1 kalimat","learningSuggestions":[]}`;
    }

    getCompetencyDescription(bab, subBab) {
        const competencies = {
            'Bilangan': {
                'Bilangan Real': 'Perbandingan dan sifat bilangan; operasi aritmetika; estimasi; faktorisasi prima; rasio, skala, proporsi, laju perubahan; perbandingan senilai dan berbalik nilai. Mencakup bilangan bulat, rasional, irasional, berpangkat, akar, dan notasi ilmiah.',
                'Bilangan real': 'Perbandingan dan sifat bilangan; operasi aritmetika; estimasi; faktorisasi prima; rasio, skala, proporsi, laju perubahan; perbandingan senilai dan berbalik nilai.'
            },
            'Aljabar': {
                'Persamaan dan Pertidaksamaan Linier': 'Persamaan linear satu variabel; pertidaksamaan linear satu variabel; sistem persamaan linear dua variabel.',
                'Persamaan dan pertidaksamaan linear': 'Persamaan linear satu variabel; pertidaksamaan linear satu variabel; sistem persamaan linear dua variabel.',
                'Bentuk Aljabar': 'Bentuk aljabar dan sifat-sifat operasinya: komutatif, asosiatif, dan distributif.',
                'Fungsi': 'Relasi dan fungsi (domain, kodomain, range), serta penyajiannya.',
                'Barisan dan Deret': 'Barisan berhingga bilangan; deret berhingga bilangan.',
                'fungsi dan barisan deret': 'Relasi dan fungsi, barisan dan deret berhingga bilangan.'
            },
            'Geometri dan Pengukuran': {
                'Objek Geometri': 'Hubungan antar-sudut (dua garis berpotongan/sejajar); Teorema Pythagoras; kekongruenan dan kesebangunan bangun datar; jaring-jaring bangun ruang (prisma, tabung, limas, kerucut).',
                'Objek geometri': 'Hubungan antar-sudut; Teorema Pythagoras; kesebangunan; jaring-jaring bangun ruang.',
                'Transformasi Geometri': 'Transformasi tunggal: refleksi, translasi, rotasi, dan dilatasi terhadap titik, garis, dan bangun datar pada bidang.',
                'transformasi geometri': 'Refleksi, translasi, rotasi, dan dilatasi terhadap bangun datar.',
                'Pengukuran': 'Keliling dan luas bangun datar (segi banyak, lingkaran, gabungannya); volume bangun ruang (prisma, limas, bola).',
                'pengukuran': 'Keliling, luas bangun datar, volume bangun ruang.'
            },
            'Geometri dan pengukuran': {
                'Objek Geometri': 'Hubungan antar-sudut; Teorema Pythagoras; kekongruenan dan kesebangunan; jaring-jaring bangun ruang.',
                'Transformasi Geometri': 'Refleksi, translasi, rotasi, dan dilatasi terhadap bangun datar.',
                'Pengukuran': 'Keliling dan luas bangun datar; volume bangun ruang.'
            },
            'Data dan Peluang': {
                'Data': 'Perumusan pertanyaan untuk data; penyajian dan interpretasi data (diagram batang, garis, lingkaran, tabel); mean, median, modus, jangkauan; perbandingan ukuran pemusatan dan penyebaran.',
                'Peluang': 'Peluang dan frekuensi relatif dari kejadian tunggal.',
                'Data dan peluang': 'Penyajian data, mean, median, modus, peluang kejadian tunggal.'
            },
            'Data dan peluang': {
                'Data': 'Penyajian dan interpretasi data; mean, median, modus, jangkauan.',
                'Peluang': 'Peluang dan frekuensi relatif dari kejadian tunggal.'
            }
        };
        // Cari exact match dulu, lalu case-insensitive
        if (competencies[bab]?.[subBab]) return competencies[bab][subBab];
        // Fallback: cari key yang mirip (case-insensitive)
        for (const [k, v] of Object.entries(competencies)) {
            if (k.toLowerCase() === bab?.toLowerCase()) {
                for (const [sk, sv] of Object.entries(v)) {
                    if (sk.toLowerCase() === subBab?.toLowerCase()) return sv;
                }
            }
        }
        return 'Kompetensi umum matematika SMP';
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
