// gemini_analytics.js - Menggunakan GROQ AI (Llama 3)
import { supabase } from './clientSupabase.js';

// KONFIGURASI
const FUNCTION_URL = 'https://tsgldkyuktqpsbeuevsn.supabase.co/functions/v1/gemini-chat';
// Gunakan Anon Key Anda (Tetap sama)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTExOTksImV4cCI6MjA3OTI2NzE5OX0.C0g6iZcwd02ZFmuGFluYXScX9uuahntJtkPvHt5g1FE';

class GeminiAnalytics {
    constructor() {
        this.functionUrl = FUNCTION_URL;
        this.supabaseKey = SUPABASE_ANON_KEY;
        this.cache = new Map();
    }

    // Fungsi Utama: Analisis Jawaban
    async analyzeStudentAnswer(answerData, questionData) {
        try {
            const cacheKey = `${answerData.id}_${questionData.id}`;
            if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

            console.log(`[AI] Menganalisis jawaban ID: ${answerData.id}...`);
            const prompt = this.buildAnalysisPrompt(answerData, questionData);

            const responseText = await this.callEdgeFunction(prompt);
            const analysis = this.parseAIResponse(responseText);

            this.cache.set(cacheKey, analysis);
            await this.storeAnalysisResult(answerData.id, analysis);

            return analysis;
        } catch (error) {
            console.error('[AI] Gagal menganalisis:', error);

            // Check if it's a rate limit error
            if (error.message && error.message.includes('Rate limit reached')) {
                console.warn('[AI] Rate limit reached, re-throwing for retry logic');
                throw error; // Re-throw rate limit errors for retry handling
            }

            return this.getFallbackAnalysis(answerData, questionData);
        }
    }

    buildAnalysisPrompt(answerData, questionData) {
        const competenceText = questionData.competence || this.getCompetencyDescription(questionData.bab, questionData.sub_bab) || 'Kompetensi umum matematika';

        return `
Analisis jawaban siswa matematika ini berdasarkan konteks berikut:
TIPE SOAL: ${questionData.tipe_soal || ''} (pilihan ganda, PGK Kategori, atau PGK MCMA)
BAB: ${questionData.bab || ''}
SUB BAB: ${questionData.sub_bab || ''}
KOMPETENSI: ${competenceText}
SOAL: ${questionData.question_text || ''}
KUNCI JAWABAN: ${questionData.correct_answer || ''}
JAWABAN SISWA: ${answerData.answer_text || ''}

Tugas: Berikan analisis mendalam tentang kekurangan, kelebihan siswa, dan saran belajar spesifik berdasarkan tipe soal, bab, sub bab, dan kompetensi yang diharapkan. Output HANYA dalam format JSON valid. Jangan ada teks lain.
Format JSON:
{
    "score": (angka 0-100 berdasarkan akurasi dan pemahaman konsep),
    "correctness": "Benar/Salah/Sebagian",
    "strengths": ["Kelebihan siswa berdasarkan kompetensi, mis: 'Memahami operasi aritmetika pada bilangan dengan baik'"],
    "weaknesses": ["Kekurangan siswa, mis: 'Kesulitan dalam menerapkan teorema Pythagoras'"],
    "explanation": "Penjelasan detail kekurangan dan kelebihan siswa terkait tipe soal, bab, sub bab, dan kompetensi...",
    "learningSuggestions": ["Saran belajar spesifik berdasarkan kompetensi, mis: 'Latih penyelesaian sistem persamaan linear dua variabel'"]
}
`.trim();
    }

    getCompetencyDescription(bab, subBab) {
        const competencies = {
            'Bilangan': {
                'Bilangan real': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Perbandingan dan sifat-sifat bilangan; Operasi aritmetika pada bilangan; Estimasi/perkiraan hasil perhitungan; Faktorisasi prima bilangan asli; Rasio (skala, proporsi, dan laju perubahan); Perbandingan senilai dan berbalik nilai.'
            },
            'Aljabar': {
                'Persamaan dan pertidaksamaan linear': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Persamaan linear satu variabel; Pertidaksamaan linear satu variabel; Sistem persamaan linear dua variabel.',
                'Bentuk Aljabar': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Bentuk aljabar dan sifat-sifat operasinya (komutatif, asosiatif, dan distributif).',
                'fungsi dan barisan deret': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Relasi dan fungsi (domain, kodomain, range), serta penyajiannya; Barisan berhingga bilangan; Deret berhingga bilangan.'
            },
            'Geometri dan pengukuran': {
                'Objek geometri': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Hubungan antar-sudut yang terbentuk oleh dua garis yang berpotongan, dan oleh dua garis sejajar yang dipotong suatu garis transversal (termasuk penentuan besar sudut dalam segitiga); Teorema Pythagoras; Kekongruenan dan kesebangunan bangun datar; Jaring-jaring bangun ruang (prisma, tabung, limas dan kerucut).',
                'transformasi geometri': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Transformasi tunggal (refleksi, translasi, rotasi, dan dilatasi) terhadap titik, garis, dan bangun datar pada bidang.',
                'pengukuran': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Keliling dan luas bangun datar (daerah segi banyak dan daerah lingkaran, serta daerah gabungannya); Volume bangun ruang (prisma, limas, dan bola).'
            },
            'Data dan peluang': {
                'Data dan peluang': 'Memahami, mengaplikasikan, dan bernalar yang lebih tinggi untuk menyelesaikan permasalahan terkait: Perumusan pertanyaan untuk mendapatkan data, serta penyajian, dan penginterpretasian data; Penentuan dan penaksiran rerata (mean), median, modus, dan jangkauan (range) dari data; Perbandingan ukuran pemusatan dan ukuran penyebaran beberapa kelompok data; Peluang dan frekuensi relatif dari kejadian tunggal.'
            }
        };
        return competencies[bab]?.[subBab] || 'Kompetensi umum matematika';
    }

    async callEdgeFunction(prompt) {
        try {
            const response = await fetch(this.functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.supabaseKey}`
                },
                body: JSON.stringify({ message: prompt })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || `HTTP Error ${response.status}`);
            }

            // PERUBAHAN UTAMA: Format Groq (OpenAI Compatible)
            if (data.choices && data.choices.length > 0) {
                return data.choices[0].message.content;
            } else {
                throw new Error("AI tidak memberikan jawaban.");
            }

        } catch (error) {
            throw error; 
        }
    }

    // FUNGSI PENTING: Batch Analysis
    async batchAnalyzeAnswers(answersData, questionsMap) {
        const results = [];
        for (const answer of answersData) {
            let question;
            if (questionsMap instanceof Map) {
                question = questionsMap.get(answer.question_id);
            } else {
                question = questionsMap[answer.question_id];
            }

            if (question) {
                // Increased delay to prevent rate limiting (30 RPM limit)
                await new Promise(r => setTimeout(r, 2500)); // 2.5 seconds between requests
                const analysis = await this.analyzeStudentAnswer(answer, question);
                results.push({ answerId: answer.id, analysis: analysis });
            }
        }
        return results;
    }

    // FUNGSI PENTING: Capability Report
    async generateCapabilityReport(studentId, analyses) {
        try {
            const prompt = `Buat laporan ringkas JSON (overallCapability, mainStrengths, areasForImprovement) dari ${analyses.length} data ini.`;
            const responseText = await this.callEdgeFunction(prompt);
            return this.parseCapabilityReport(responseText);
        } catch (error) {
            return this.getFallbackCapabilityReport();
        }
    }

    // Parsing JSON dari AI (Pembersihan Markdown)
    parseAIResponse(responseText) {
        try {
            // Bersihkan format markdown ```json jika ada
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
            return this.parseTextResponse(responseText);
        } catch (e) {
            return this.parseTextResponse(responseText);
        }
    }

    parseTextResponse(text) {
        return {
            score: 50,
            correctness: "Perlu Review",
            strengths: [],
            weaknesses: [],
            explanation: text,
            learningSuggestions: []
        };
    }

    parseCapabilityReport(text) {
        try {
            const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) {}
        return this.getFallbackCapabilityReport();
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

    getFallbackAnalysis() {
        return {
            score: 0,
            correctness: "Error",
            explanation: "Analisis AI gagal.",
            strengths: [], weaknesses: [], learningSuggestions: []
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
        // Test connection by making a simple request
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ message: 'Test connection' })
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            return {
                available: true,
                connected: true,
                validResponse: true,
                responseTime: Date.now() - performance.now(),
                apiConfigured: true,
                cacheSize: geminiAnalytics.cache.size,
                totalAnalyses: 0, // Would need to query DB for this
                lastTest: new Date()
            };
        } else {
            return {
                available: true,
                connected: true,
                validResponse: false,
                error: data.error,
                apiConfigured: true,
                lastTest: new Date()
            };
        }
    } catch (error) {
        return {
            available: false,
            connected: false,
            validResponse: false,
            error: error.message,
            apiConfigured: true,
            lastTest: new Date()
        };
    }
}