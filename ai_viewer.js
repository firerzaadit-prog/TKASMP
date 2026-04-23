// ai_viewer.js - Halaman mandiri untuk Analisis AI Mendalam
// Mengambil parameter session & user dari URL, lalu menjalankan analisis AI

import { supabase } from './clientSupabase.js';
import { geminiAnalytics } from './gemini_analytics.js';

// ────────────────────────────────────────────────
// Helpers UI
// ────────────────────────────────────────────────
function setStatus(text, state = 'loading') {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (dot) {
        dot.className = 'status-dot';
        if (state === 'loading') dot.classList.add('loading');
        else if (state === 'error') dot.classList.add('error');
        // 'done' → hijau default
    }
    if (statusText) statusText.textContent = text;
}

function showError(title, message) {
    document.getElementById('aiLoadingCard').style.display = 'none';
    const errCard = document.getElementById('aiErrorCard');
    errCard.style.display = 'block';
    document.getElementById('errorTitle').textContent = title;
    document.getElementById('errorMessage').textContent = message;
    setStatus('Gagal memuat analisis', 'error');
}

function setLoadingDetail(text) {
    const el = document.getElementById('loadingDetail');
    if (el) el.textContent = text;
}

// ────────────────────────────────────────────────
// Helper: cek jawaban benar (semua tipe soal)
// ────────────────────────────────────────────────
function checkAnswerCorrectness(question, answer) {
    if (!answer || !question) return false;
    try {
        if (question.question_type === 'PGK MCMA') {
            const sel = (answer || '').split(',').sort();
            const cor = Array.isArray(question.correct_answers)
                ? question.correct_answers.sort()
                : (question.correct_answers || '').split(',').sort();
            return JSON.stringify(sel) === JSON.stringify(cor);
        } else if (question.question_type === 'PGK Kategori') {
            const sel = typeof answer === 'string' ? JSON.parse(answer) : answer;
            const map = typeof question.category_mapping === 'string'
                ? JSON.parse(question.category_mapping)
                : question.category_mapping;
            if (!map || !sel) return false;
            for (const [k, v] of Object.entries(sel)) {
                if (map[k] !== v) return false;
            }
            for (const [k, v] of Object.entries(map)) {
                if (v && sel[k] !== true) return false;
            }
            return true;
        } else {
            return answer === question.correct_answer;
        }
    } catch (e) { return false; }
}

// ────────────────────────────────────────────────
// Render hasil analisis AI ke DOM
// ────────────────────────────────────────────────
function renderGlobalAiAnalysis(data, analyticsData) {
    const container = document.getElementById('aiAnalysisContent');
    if (!container) return;

    // ── Matriks kognitif (bab × level) ──────────────────
    let matrixHtml = '';
    if (analyticsData && analyticsData.levelKognitif) {
        const CHAPTERS = ['Bilangan', 'Aljabar', 'Geometri & Pengukuran', 'Data dan Peluang'];
        const LEVELS = ['Level 1', 'Level 2', 'Level 3'];
        const matrix = analyticsData.levelKognitif;

        const rows = CHAPTERS.map(bab => {
            const babKey = bab;
            let totalBenar = 0, totalSalah = 0;
            const cells = LEVELS.map(lv => {
                const cell = (matrix[babKey] && matrix[babKey][lv]) || { benar: 0, salah: 0 };
                totalBenar += cell.benar;
                totalSalah += cell.salah;
                if (cell.benar === 0 && cell.salah === 0) {
                    return `<td><span style="color:#d1d5db;">—</span></td>`;
                }
                return `<td>
                    <span class="cell-correct">${cell.benar}</span>
                    <span style="color:#9ca3af;margin:0 2px;">/</span>
                    <span class="cell-wrong">${cell.salah}</span>
                </td>`;
            }).join('');

            const hasData = totalBenar > 0 || totalSalah > 0;
            return `<tr>
                <td>${bab}</td>
                ${cells}
                <td>${hasData ? `<span class="cell-total">${totalBenar + totalSalah}</span> <span style="font-size:0.75rem;color:#9ca3af;">(${totalBenar}✓)</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
            </tr>`;
        }).join('');

        matrixHtml = `
        <div class="cognitive-matrix-card">
            <h4><i class="fas fa-table"></i> Matriks Performa Kognitif</h4>
            <p style="font-size:0.82rem;color:#9ca3af;margin-bottom:14px;">Format sel: <strong style="color:#059669;">Benar</strong> / <strong style="color:#dc2626;">Salah</strong></p>
            <div class="matrix-table-wrap">
                <table class="matrix-table">
                    <thead>
                        <tr>
                            <th>Bab / Materi</th>
                            <th>Level 1<br><span style="font-weight:400;font-size:0.75rem;">Pengetahuan</span></th>
                            <th>Level 2<br><span style="font-weight:400;font-size:0.75rem;">Aplikasi</span></th>
                            <th>Level 3<br><span style="font-weight:400;font-size:0.75rem;">Penalaran</span></th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    }

    container.innerHTML = `
        <!-- Ringkasan -->
        <div class="ai-summary-card">
            <h3><i class="fas fa-info-circle"></i> Ringkasan Evaluasi</h3>
            <p>${data.summary || 'Tidak ada ringkasan tersedia.'}</p>
        </div>

        <!-- Kekuatan & Kelemahan -->
        <div class="ai-details-grid">
            <div class="detail-card strengths">
                <h4><i class="fas fa-check-circle"></i> Kekuatan</h4>
                <ul>
                    ${(data.strengths || []).length > 0
                        ? (data.strengths).map(s => `<li>${s}</li>`).join('')
                        : '<li style="color:#9ca3af;">Data belum tersedia.</li>'}
                </ul>
            </div>
            <div class="detail-card weaknesses">
                <h4><i class="fas fa-exclamation-circle"></i> Area Perbaikan</h4>
                <ul>
                    ${(data.weaknesses || []).length > 0
                        ? (data.weaknesses).map(w => `<li>${w}</li>`).join('')
                        : '<li style="color:#9ca3af;">Data belum tersedia.</li>'}
                </ul>
            </div>
        </div>

        <!-- Matriks Kognitif -->
        ${matrixHtml}

        <!-- Saran Pembelajaran -->
        <div class="ai-suggestion-card">
            <h4><i class="fas fa-lightbulb"></i> Saran Pembelajaran Personal</h4>
            ${(data.learningSuggestions || []).length > 0
                ? (data.learningSuggestions).map(ls => `
                    <div class="suggestion-item">
                        <i class="fas fa-arrow-right"></i>
                        <span>${ls}</span>
                    </div>`).join('')
                : '<div class="suggestion-item"><i class="fas fa-info-circle"></i><span style="color:#9ca3af;">Saran belum tersedia.</span></div>'
            }
        </div>
    `;

    document.getElementById('aiAnalysisContent').style.display = 'block';
    setStatus('Analisis selesai', 'done');
}

// ────────────────────────────────────────────────
// Fungsi utama: jalankan analisis AI
// ────────────────────────────────────────────────
async function triggerAIAnalysis(sessionId, userId) {
    try {
        setStatus('Mengambil data ujian…', 'loading');
        setLoadingDetail('Menghubungkan ke database dan memuat jawaban siswa…');

        // 1. Ambil soal yang dikerjakan
        const { data: answersData, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .eq('exam_session_id', sessionId);

        if (answersError) throw new Error('Gagal memuat jawaban: ' + answersError.message);
        if (!answersData || answersData.length === 0) {
            showError('Tidak Ada Data Jawaban', 'Tidak ditemukan jawaban untuk sesi ujian ini. Pastikan ujian sudah diselesaikan.');
            return;
        }

        // ── Dedup jawaban per question_id (ambil entri pertama per soal) ──
        // Ini mencegah double-count jika ada baris duplikat di exam_answers
        const dedupAnswersMap = new Map();
        answersData.forEach(ans => {
            const qid = ans.question_id;
            if (qid && !dedupAnswersMap.has(qid)) {
                dedupAnswersMap.set(qid, ans);
            }
        });
        const uniqueAnswersData = Array.from(dedupAnswersMap.values());
        console.log(`[AI Viewer] Total jawaban: ${answersData.length}, setelah dedup: ${uniqueAnswersData.length}`);

        const questionIds = [...new Set(uniqueAnswersData.map(a => a.question_id).filter(Boolean))];
        setLoadingDetail(`Memuat ${questionIds.length} soal…`);

        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .in('id', questionIds);

        if (questionsError) throw new Error('Gagal memuat soal: ' + questionsError.message);

        const questionsMap = new Map((questionsData || []).map(q => [q.id, q]));

        // 2. Bangun payload untuk AI (gunakan uniqueAnswersData yang sudah terdedup)
        const payload = uniqueAnswersData.map(ans => {
            const q = questionsMap.get(ans.question_id);
            if (!q) return null;
            return {
                answer: {
                    answer_value: ans.selected_answer || ans.user_answer,
                    is_correct: checkAnswerCorrectness(q, ans.selected_answer || ans.user_answer)
                },
                question: q
            };
        }).filter(Boolean);

        if (payload.length === 0) {
            showError('Data Tidak Lengkap', 'Tidak dapat memproses jawaban karena data soal tidak ditemukan.');
            return;
        }

        // 3. Hitung matriks kognitif (bab × level kognitif)
        const levelKognitif = {};
        const CHAPTER_MAP = {
            'bilangan': 'Bilangan',
            'aljabar': 'Aljabar',
            'geometri': 'Geometri & Pengukuran',
            'pengukuran': 'Geometri & Pengukuran',
            'geometri & pengukuran': 'Geometri & Pengukuran',
            'data': 'Data dan Peluang',
            'peluang': 'Data dan Peluang',
            'data dan peluang': 'Data dan Peluang'
        };

        payload.forEach(({ answer, question }) => {
            const rawChapter = (question.bab || question.chapter || '').toLowerCase().trim();
            let chapter = 'Lainnya';
            for (const [key, label] of Object.entries(CHAPTER_MAP)) {
                if (rawChapter.includes(key)) { chapter = label; break; }
            }

            const difficulty = (question.difficulty || '').toLowerCase();
            let levelKey = 'Level 2';
            if (difficulty === 'mudah' || difficulty === 'easy' || difficulty === 'l1') levelKey = 'Level 1';
            else if (difficulty === 'sulit' || difficulty === 'hard' || difficulty === 'l3') levelKey = 'Level 3';

            if (!levelKognitif[chapter]) levelKognitif[chapter] = {};
            if (!levelKognitif[chapter][levelKey]) levelKognitif[chapter][levelKey] = { benar: 0, salah: 0 };

            if (answer.is_correct) levelKognitif[chapter][levelKey].benar++;
            else levelKognitif[chapter][levelKey].salah++;
        });

        setLoadingDetail('Menghubungi model AI Gemini…');
        setStatus('Memanggil AI…', 'loading');

        // 4. Cek cache di database
        let analysisResult = null;
        const { data: existingBatch } = await supabase
            .from('gemini_analyses')
            .select('analysis_data')
            .eq('answer_id', sessionId)
            .maybeSingle();

        if (existingBatch?.analysis_data) {
            analysisResult = existingBatch.analysis_data;
            setLoadingDetail('Memuat dari cache database…');
            console.log('[AI Viewer] Mengambil dari cache');
        } else {
            setLoadingDetail('Memproses dengan AI Gemini (mungkin memerlukan beberapa saat)…');
            analysisResult = await geminiAnalytics.analyzeBatchAnswers(payload);
            // Simpan ke cache
            try {
                await geminiAnalytics.storeBatchResult(sessionId, analysisResult);
            } catch (e) {
                console.warn('[AI Viewer] Gagal menyimpan cache:', e);
            }
        }

        if (!analysisResult) {
            showError('Analisis Tidak Tersedia', 'Model AI tidak menghasilkan respons. Silakan coba lagi nanti.');
            return;
        }

        // 5. Render ke UI
        document.getElementById('aiLoadingCard').style.display = 'none';
        renderGlobalAiAnalysis(analysisResult, { levelKognitif });

    } catch (err) {
        console.error('[AI Viewer] Error:', err);
        showError('Gagal Memuat Analisis', err.message || 'Terjadi kesalahan yang tidak diketahui.');
    }
}

// ────────────────────────────────────────────────
// Entry point — jalankan saat DOM siap
// ────────────────────────────────────────────────
let _sessionId = null;
let _userId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    _sessionId = params.get('session');
    _userId = params.get('user');

    // Update status bar
    const statusSession = document.getElementById('statusSession');
    if (statusSession) {
        statusSession.textContent = _sessionId ? _sessionId.slice(0, 12) + '…' : 'Tidak ada';
    }

    // Update header subtitle
    const subtitle = document.getElementById('headerSubtitle');
    if (subtitle) {
        subtitle.textContent = _sessionId
            ? `Sesi ujian: ${_sessionId.slice(0, 8)}…`
            : 'Parameter tidak valid';
    }

    // Validasi parameter
    if (!_sessionId || _sessionId === 'null' || _sessionId === 'undefined') {
        showError(
            'Parameter URL Tidak Valid',
            'ID sesi ujian tidak ditemukan di URL. Silakan kembali ke halaman hasil ujian dan klik tombol "Lihat Analisis AI Mendalam" lagi.'
        );
        return;
    }

    // Jalankan analisis
    await triggerAIAnalysis(_sessionId, _userId);
});

// Retry dari tombol error
window.retryAnalysis = async function() {
    document.getElementById('aiErrorCard').style.display = 'none';
    document.getElementById('aiLoadingCard').style.display = 'block';
    document.getElementById('aiAnalysisContent').style.display = 'none';
    document.getElementById('aiAnalysisContent').innerHTML = '';
    setStatus('Mencoba ulang…', 'loading');
    await triggerAIAnalysis(_sessionId, _userId);
};
