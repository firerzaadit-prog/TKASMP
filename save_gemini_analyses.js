// save_gemini_analyses.js - Utility untuk menyimpan analisis Grok AI ke Supabase
import { supabase } from './clientSupabase.js';
import { geminiAnalytics } from './gemini_analytics.js';

/**
 * Utility class untuk mengelola penyimpanan analisis Grok AI
 */
class GeminiAnalysisManager {
    constructor() {
        this.batchSize = 5; // Jumlah analisis per batch
        this.delayBetweenBatches = 2000; // Delay 2 detik antar batch
        this.delayBetweenRequests = 1000; // Delay 1 detik antar request
    }

    /**
     * Simpan analisis untuk satu jawaban
     * @param {string} answerId - ID jawaban
     * @param {Object} analysis - Data analisis dari Grok AI
     * @returns {Promise<boolean>} - Status penyimpanan
     */
    async saveSingleAnalysis(answerId, analysis) {
        try {
            console.log(`[GeminiAnalysisManager] Menyimpan analisis untuk jawaban ${answerId}...`);

            const { data, error } = await supabase
                .from('gemini_analyses')
                .upsert({
                    answer_id: answerId,
                    analysis_data: analysis,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'answer_id'
                });

            if (error) {
                console.error('[GeminiAnalysisManager] Error menyimpan analisis:', error);
                return false;
            }

            console.log(`[GeminiAnalysisManager] Analisis berhasil disimpan untuk jawaban ${answerId}`);
            return true;
        } catch (error) {
            console.error('[GeminiAnalysisManager] Error menyimpan analisis:', error);
            return false;
        }
    }

    /**
     * Simpan analisis untuk multiple jawaban dalam batch
     * @param {Array} analyses - Array of {answerId, analysis}
     * @returns {Promise<Object>} - Hasil penyimpanan
     */
    async saveBatchAnalyses(analyses) {
        const results = {
            successful: [],
            failed: [],
            total: analyses.length
        };

        console.log(`[GeminiAnalysisManager] Memulai penyimpanan batch ${analyses.length} analisis...`);

        for (let i = 0; i < analyses.length; i += this.batchSize) {
            const batch = analyses.slice(i, i + this.batchSize);
            console.log(`[GeminiAnalysisManager] Memproses batch ${Math.floor(i/this.batchSize) + 1} dari ${Math.ceil(analyses.length/this.batchSize)}`);

            // Proses batch secara paralel
            const batchPromises = batch.map(async ({ answerId, analysis }) => {
                try {
                    const success = await this.saveSingleAnalysis(answerId, analysis);
                    if (success) {
                        results.successful.push(answerId);
                    } else {
                        results.failed.push({ answerId, error: 'Save failed' });
                    }
                } catch (error) {
                    results.failed.push({ answerId, error: error.message });
                }
            });

            await Promise.all(batchPromises);

            // Delay antar batch untuk menghindari rate limit
            if (i + this.batchSize < analyses.length) {
                console.log(`[GeminiAnalysisManager] Menunggu ${this.delayBetweenBatches}ms sebelum batch berikutnya...`);
                await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
            }
        }

        console.log(`[GeminiAnalysisManager] Penyimpanan batch selesai. Berhasil: ${results.successful.length}, Gagal: ${results.failed.length}`);
        return results;
    }

    /**
     * Analisis dan simpan jawaban yang belum memiliki analisis
     * @param {Array} answers - Array jawaban dari database
     * @param {Map|Object} questionsMap - Map pertanyaan
     * @returns {Promise<Object>} - Hasil analisis dan penyimpanan
     */
    async analyzeAndSaveUnanalyzedAnswers(answers, questionsMap) {
        try {
            console.log(`[GeminiAnalysisManager] Mengecek ${answers.length} jawaban untuk analisis...`);

            // Ambil analisis yang sudah ada
            const { data: existingAnalyses, error } = await supabase
                .from('gemini_analyses')
                .select('answer_id')
                .in('answer_id', answers.map(a => a.id));

            if (error) {
                console.error('[GeminiAnalysisManager] Error mengambil analisis existing:', error);
                return { success: false, error: error.message };
            }

            const existingAnalysisIds = new Set(existingAnalyses.map(a => a.answer_id));
            const unanalyzedAnswers = answers.filter(answer => !existingAnalysisIds.has(answer.id));

            console.log(`[GeminiAnalysisManager] Ditemukan ${unanalyzedAnswers.length} jawaban yang belum dianalisis`);

            if (unanalyzedAnswers.length === 0) {
                return {
                    success: true,
                    message: 'Semua jawaban sudah memiliki analisis',
                    analyzed: 0,
                    saved: 0
                };
            }

            // Analisis jawaban yang belum ada
            const analysesToSave = [];
            let analyzedCount = 0;

            for (const answer of unanalyzedAnswers) {
                try {
                    const question = questionsMap instanceof Map
                        ? questionsMap.get(answer.question_id)
                        : questionsMap[answer.question_id];

                    if (!question) {
                        console.warn(`[GeminiAnalysisManager] Question tidak ditemukan untuk answer ${answer.id}`);
                        continue;
                    }

                    console.log(`[GeminiAnalysisManager] Menganalisis jawaban ${answer.id}...`);

                    const analysis = await geminiAnalytics.analyzeStudentAnswer(answer, question);
                    analysesToSave.push({ answerId: answer.id, analysis });
                    analyzedCount++;

                    // Delay antar request
                    if (analyzedCount < unanalyzedAnswers.length) {
                        await new Promise(resolve => setTimeout(resolve, this.delayBetweenRequests));
                    }

                } catch (error) {
                    console.error(`[GeminiAnalysisManager] Error menganalisis jawaban ${answer.id}:`, error);
                    // Lanjutkan ke jawaban berikutnya
                }
            }

            // Simpan hasil analisis
            const saveResults = await this.saveBatchAnalyses(analysesToSave);

            return {
                success: true,
                message: `Berhasil menganalisis ${analyzedCount} jawaban dan menyimpan ${saveResults.successful.length} analisis`,
                analyzed: analyzedCount,
                saved: saveResults.successful.length,
                failed: saveResults.failed.length,
                details: saveResults
            };

        } catch (error) {
            console.error('[GeminiAnalysisManager] Error dalam analyzeAndSaveUnanalyzedAnswers:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Update analisis yang sudah ada dengan data baru
     * @param {string} answerId - ID jawaban
     * @param {Object} newAnalysis - Analisis baru
     * @returns {Promise<boolean>} - Status update
     */
    async updateExistingAnalysis(answerId, newAnalysis) {
        try {
            console.log(`[GeminiAnalysisManager] Mengupdate analisis untuk jawaban ${answerId}...`);

            const { data, error } = await supabase
                .from('gemini_analyses')
                .update({
                    analysis_data: newAnalysis,
                    updated_at: new Date().toISOString()
                })
                .eq('answer_id', answerId);

            if (error) {
                console.error('[GeminiAnalysisManager] Error mengupdate analisis:', error);
                return false;
            }

            console.log(`[GeminiAnalysisManager] Analisis berhasil diupdate untuk jawaban ${answerId}`);
            return true;
        } catch (error) {
            console.error('[GeminiAnalysisManager] Error mengupdate analisis:', error);
            return false;
        }
    }

    /**
     * Hapus analisis untuk jawaban tertentu
     * @param {string} answerId - ID jawaban
     * @returns {Promise<boolean>} - Status penghapusan
     */
    async deleteAnalysis(answerId) {
        try {
            console.log(`[GeminiAnalysisManager] Menghapus analisis untuk jawaban ${answerId}...`);

            const { error } = await supabase
                .from('gemini_analyses')
                .delete()
                .eq('answer_id', answerId);

            if (error) {
                console.error('[GeminiAnalysisManager] Error menghapus analisis:', error);
                return false;
            }

            console.log(`[GeminiAnalysisManager] Analisis berhasil dihapus untuk jawaban ${answerId}`);
            return true;
        } catch (error) {
            console.error('[GeminiAnalysisManager] Error menghapus analisis:', error);
            return false;
        }
    }

    /**
     * Ambil semua analisis dengan informasi siswa
     * @param {number} limit - Batas jumlah data
     * @returns {Promise<Array>} - Array analisis dengan info siswa
     */
    async getAnalysesWithStudentInfo(limit = 100) {
        try {
            console.log(`[GeminiAnalysisManager] Mengambil ${limit} analisis dengan info siswa...`);

            const { data, error } = await supabase
                .from('gemini_analyses')
                .select(`
                    *,
                    exam_answers (
                        id,
                        exam_session_id,
                        question_id,
                        selected_answer,
                        is_correct,
                        time_taken_seconds,
                        exam_sessions (
                            user_id,
                            profiles (
                                nama_lengkap,
                                class_name
                            )
                        )
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('[GeminiAnalysisManager] Error mengambil analisis:', error);
                return [];
            }

            // Format data untuk kemudahan penggunaan
            const formattedData = data.map(item => ({
                analysisId: item.id,
                answerId: item.answer_id,
                analysis: item.analysis_data,
                createdAt: item.created_at,
                studentName: item.exam_answers?.exam_sessions?.profiles?.nama_lengkap || 'Unknown',
                studentClass: item.exam_answers?.exam_sessions?.profiles?.class_name || 'Unknown',
                examSessionId: item.exam_answers?.exam_session_id,
                questionId: item.exam_answers?.question_id,
                selectedAnswer: item.exam_answers?.selected_answer,
                isCorrect: item.exam_answers?.is_correct,
                timeTaken: item.exam_answers?.time_taken_seconds
            }));

            console.log(`[GeminiAnalysisManager] Berhasil mengambil ${formattedData.length} analisis`);
            return formattedData;
        } catch (error) {
            console.error('[GeminiAnalysisManager] Error mengambil analisis:', error);
            return [];
        }
    }

    /**
     * Export analisis ke format JSON untuk backup
     * @returns {Promise<string>} - JSON string data analisis
     */
    async exportAnalysesToJSON() {
        try {
            console.log('[GeminiAnalysisManager] Mengexport analisis ke JSON...');

            const analyses = await this.getAnalysesWithStudentInfo(1000); // Export max 1000

            const exportData = {
                exportedAt: new Date().toISOString(),
                totalAnalyses: analyses.length,
                aiModel: 'Grok AI (Llama 3.3)',
                analyses: analyses
            };

            const jsonString = JSON.stringify(exportData, null, 2);
            console.log(`[GeminiAnalysisManager] Export berhasil: ${analyses.length} analisis`);
            return jsonString;
        } catch (error) {
            console.error('[GeminiAnalysisManager] Error export:', error);
            return null;
        }
    }
}

// Export instance dan fungsi utility
export const geminiAnalysisManager = new GeminiAnalysisManager();

// Fungsi utility untuk penggunaan langsung
export async function saveGrokAnalysis(answerId, analysis) {
    return await geminiAnalysisManager.saveSingleAnalysis(answerId, analysis);
}

export async function batchSaveGrokAnalyses(analyses) {
    return await geminiAnalysisManager.saveBatchAnalyses(analyses);
}

export async function analyzeAndSaveUnanalyzed(answers, questionsMap) {
    return await geminiAnalysisManager.analyzeAndSaveUnanalyzedAnswers(answers, questionsMap);
}

export async function getGrokAnalysesWithStudents(limit = 100) {
    return await geminiAnalysisManager.getAnalysesWithStudentInfo(limit);
}

export async function exportGrokAnalyses() {
    return await geminiAnalysisManager.exportAnalysesToJSON();
}

// Contoh penggunaan:
/*
// Simpan analisis tunggal
await saveGrokAnalysis('answer-uuid', {
    score: 85,
    correctness: 'Benar Lengkap',
    strengths: ['Pemahaman konsep baik'],
    weaknesses: ['Perlu latihan perhitungan'],
    explanation: 'Jawaban sangat baik...',
    learningSuggestions: ['Lanjutkan latihan']
});

// Analisis dan simpan jawaban yang belum ada
const result = await analyzeAndSaveUnanalyzed(answersArray, questionsMap);
console.log(`Diperoleh ${result.analyzed} analisis, disimpan ${result.saved}`);

// Ambil data untuk dashboard
const analyses = await getGrokAnalysesWithStudents(50);

// Export untuk backup
const jsonData = await exportGrokAnalyses();
*/