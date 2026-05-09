// habisujian.js - Exam completion page with results and answer review
// REFACTORED: AI analysis dipindah ke sisi admin (tidak lagi dipanggil di sini)
// ENHANCED: Peta Kompetensi dengan Stacked Bar Chart per level kognitif
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';

// Global variables
let examSessionId = null;
let questions = [];
let answers = [];

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if user is logged in
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            window.location.href = 'index.html';
            return;
        }

        // Get exam session ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        examSessionId = urlParams.get('session');

        if (!examSessionId || examSessionId === 'null' || examSessionId === 'undefined') {
            console.error('Invalid or missing exam session ID:', examSessionId);
            alert('Session ujian tidak valid atau tidak ditemukan. Kembali ke halaman utama.');
            window.location.href = 'halamanpertama.html';
            return;
        }

        console.log('Loading exam results for session:', examSessionId);

        // Load exam results
        await loadExamResults();

    } catch (error) {
        console.error('Error initializing exam completion page:', error);
        alert('Terjadi kesalahan saat memuat hasil ujian.');
        window.location.href = 'halamanpertama.html';
    }
});

// Load exam results from database
async function loadExamResults() {
    try {
        // Get exam session details
        const { data: session, error: sessionError } = await supabase
            .from('exam_sessions')
            .select('*')
            .eq('id', examSessionId)
            .single();

        if (sessionError || !session) {
            throw new Error('Session ujian tidak ditemukan');
        }

        console.log('Exam session:', session);

        // Langkah 1: Ambil hanya jawaban siswa untuk sesi ini
        const { data: answersData, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .eq('exam_session_id', examSessionId);

        if (answersError) {
            console.warn('Could not load answers:', answersError);
        }

        console.log('Raw answers from DB:', answersData ? answersData.length : 0, 'records');

        if (!answersData || answersData.length === 0) {
            console.warn('Tidak ada jawaban ditemukan di exam_answers untuk session ini:', examSessionId);
            questions = [];
            answers = [];
        } else {
            // Langkah 2: Ambil HANYA soal yang question_id-nya ada di jawaban siswa
            const answeredQuestionIds = [...new Set(answersData.map(a => a.question_id).filter(Boolean))];
            console.log(`Siswa mengerjakan ${answeredQuestionIds.length} soal unik`);

            const { data: questionsData, error: questionsError } = await supabase
                .from('questions')
                .select('*')
                .in('id', answeredQuestionIds);

            if (questionsError) {
                throw new Error('Gagal memuat soal ujian');
            }

            questions = questionsData || [];

            // Langkah 3: Susun jawaban sesuai urutan soal yang ditemukan
            answers = new Array(questions.length).fill(null);
            let matched = 0;
            answersData.forEach(answerRecord => {
                const questionIndex = questions.findIndex(q => q.id === answerRecord.question_id);
                if (questionIndex !== -1) {
                    answers[questionIndex] = answerRecord.selected_answer ?? answerRecord.user_answer ?? null;
                    matched++;
                }
            });
            console.log(`Matched ${matched} dari ${answersData.length} jawaban ke ${questions.length} soal`);
        }

        console.log('Loaded questions:', questions.length);
        console.log('Loaded answers:', answers);

        // Display results
        displayExamResults(session);

        // Simpan session & user ID untuk keperluan navigasi
        window._examSessionId = examSessionId;
        window._examUserId = session.user_id || null;

        // REFACTORED: AI TIDAK dipanggil di sini.
        showAIPendingBanner();

    } catch (error) {
        console.error('Error loading exam results:', error);
        alert('Terjadi kesalahan saat memuat hasil ujian: ' + error.message);
    }
}

/**
 * Menampilkan banner informasi bahwa analisis AI akan diproses oleh admin.
 */
function showAIPendingBanner() {
    const aiPrompt = document.getElementById('aiDeepAnalysisPrompt');
    if (!aiPrompt) return;

    aiPrompt.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 1.5px solid #93c5fd;
            border-radius: 14px;
            padding: 20px 24px;
            display: flex;
            align-items: flex-start;
            gap: 16px;
            margin-top: 20px;
        ">
            <div style="font-size: 2rem; flex-shrink: 0;">⏳</div>
            <div>
                <h4 style="margin: 0 0 6px 0; color: #1d4ed8; font-size: 1rem;">
                    Analisis AI Sedang Diproses
                </h4>
                <p style="margin: 0 0 12px 0; color: #1e40af; font-size: 0.88rem; line-height: 1.6;">
                    Hasil analisis AI mendalam untuk ujian ini akan diproses oleh guru/admin 
                    dan tersedia dalam waktu dekat. Kamu bisa mengeceknya kembali melalui 
                    menu <strong>Riwayat Ujian</strong> di halaman utama.
                </p>
                <button
                    onclick="window.location.href='halamanpertama.html'"
                    style="
                        background: #2563eb;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        padding: 9px 20px;
                        font-size: 0.88rem;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    "
                >
                    <i class="fas fa-home"></i> Ke Halaman Utama
                </button>
            </div>
        </div>
    `;
    aiPrompt.style.display = 'block';
}

// Helper: cek jawaban PGK Kategori
function checkKategoriHabisUjian(answer, question) {
    try {
        if (!answer) return false;
        const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
        if (!selectedAnswers || Object.keys(selectedAnswers).length === 0) return false;

        let statements = question.category_options || question.category_statements || [];
        if (!Array.isArray(statements)) {
            statements = typeof statements === 'string' ? JSON.parse(statements) : [];
        }

        let correctMapping = question.category_mapping || {};
        if (typeof correctMapping === 'string') correctMapping = JSON.parse(correctMapping);
        if (!correctMapping || Object.keys(correctMapping).length === 0) return false;

        const indexCorrectMap = {};
        statements.forEach((stmt, idx) => {
            const t = typeof stmt === 'string' ? stmt.trim() : stmt;
            if (correctMapping.hasOwnProperty(t)) {
                indexCorrectMap[idx] = correctMapping[t];
            } else if (correctMapping.hasOwnProperty(String(idx))) {
                indexCorrectMap[idx] = correctMapping[String(idx)];
            }
        });

        for (let idx = 0; idx < statements.length; idx++) {
            const correct = indexCorrectMap[idx];
            if (correct === undefined) continue;
            if (selectedAnswers[idx] !== correct) return false;
        }
        return true;
    } catch (e) {
        console.error('checkKategoriHabisUjian error:', e);
        return false;
    }
}

// Display exam results
function displayExamResults(session) {
    const finalScoreElement = document.getElementById('finalScore');
    if (finalScoreElement) finalScoreElement.textContent = session.total_score || 0;

    const passStatusElement = document.getElementById('passStatus');
    if (passStatusElement) {
        const isPassed = session.is_passed || (session.total_score >= 50);
        passStatusElement.textContent = isPassed ? '🎉 LULUS' : '❌ TIDAK LULUS';
        passStatusElement.className = `pass-status ${isPassed ? 'pass' : 'fail'}`;
    }

    const examDurationElement = document.getElementById('examDuration');
    if (examDurationElement && session.total_time_seconds) {
        const minutes = Math.floor(session.total_time_seconds / 60);
        const seconds = session.total_time_seconds % 60;
        examDurationElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} menit`;
    }

    const totalQuestionsElement = document.getElementById('totalQuestions');
    if (totalQuestionsElement) totalQuestionsElement.textContent = questions.length;

    const correctAnswersElement = document.getElementById('correctAnswers');
    if (correctAnswersElement) {
        let correctCount = 0;
        questions.forEach((question, index) => {
            const userAnswer = answers[index];
            if (!userAnswer) return;
            let isCorrect = false;
            if (question.question_type === 'PGK Kategori') {
                isCorrect = checkKategoriHabisUjian(userAnswer, question);
            } else if (question.question_type === 'PGK MCMA') {
                const selectedAnswers = (userAnswer || '').split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
            } else {
                isCorrect = userAnswer === question.correct_answer;
            }
            if (isCorrect) correctCount++;
        });
        correctAnswersElement.textContent = correctCount;
    }

    const reviewContainer = document.getElementById('answerReview');
    if (reviewContainer && questions.length > 0) {
        if (typeof window.showAnswerReview === 'function') {
            window.showAnswerReview(questions, answers);
        } else {
            console.warn('Fungsi window.showAnswerReview tidak ditemukan di HTML.');
        }
    }

    // Render Peta Kompetensi
    renderPetaKompetensi(questions, answers);
}

// Theta estimation (simplified EAP)
function estimateTheta(answers, questions, itemParams) {
    let theta = 0;
    const maxIterations = 20;
    const tolerance = 0.001;

    for (let iter = 0; iter < maxIterations; iter++) {
        let numerator = 0;
        let denominator = 0;

        questions.forEach((question, index) => {
            const params = itemParams[index];
            if (!params) return;
            const { a = 1, b = 0, c = 0.25 } = params;
            const userAnswer = answers[index];
            const isCorrect = isAnswerCorrect(question, userAnswer);
            const p = c + (1 - c) / (1 + Math.exp(-1.7 * a * (theta - b)));
            const q = 1 - p;
            if (p > 0 && q > 0) {
                const w = a * a * p * q;
                numerator += w * (isCorrect ? (1 - p) / p : -1);
                denominator += w;
            }
        });

        if (denominator === 0) break;
        const delta = numerator / denominator;
        theta += delta;
        theta = Math.max(-3, Math.min(3, theta));
        if (Math.abs(delta) < tolerance) break;
    }
    return theta;
}

function isAnswerCorrect(question, answer) {
    if (!answer) return false;
    try {
        if (question.question_type === 'PGK MCMA') {
            const selectedAnswers = (answer || '').split(',').sort();
            const correctAnswers = Array.isArray(question.correct_answers)
                ? question.correct_answers.sort()
                : (question.correct_answers || '').split(',').sort();
            return JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
        } else if (question.question_type === 'PGK Kategori') {
            const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
            const correctMapping = typeof question.category_mapping === 'string'
                ? JSON.parse(question.category_mapping)
                : question.category_mapping;
            if (!correctMapping || !selectedAnswers) return false;
            for (const [stmtIndex, isTrue] of Object.entries(selectedAnswers)) {
                if (correctMapping[stmtIndex] !== isTrue) return false;
            }
            for (const [stmtIndex, shouldBeTrue] of Object.entries(correctMapping)) {
                if (shouldBeTrue && selectedAnswers[stmtIndex] !== true) return false;
            }
            return true;
        } else {
            return answer === question.correct_answer;
        }
    } catch (e) {
        return false;
    }
}

function interpretAbilityLevel(theta) {
    if (theta >= 2.0) return { label: 'Sangat Tinggi', class: 'ability-very-high', icon: '🌟' };
    else if (theta >= 1.0) return { label: 'Tinggi', class: 'ability-high', icon: '⭐' };
    else if (theta >= 0.0) return { label: 'Sedang', class: 'ability-medium', icon: '📊' };
    else if (theta >= -1.0) return { label: 'Rendah', class: 'ability-low', icon: '📈' };
    else return { label: 'Perlu Bimbingan', class: 'ability-very-low', icon: '💪' };
}

function getAbilityDescription(theta) {
    if (theta >= 2.0) return 'Siswa memiliki kemampuan sangat tinggi dalam matematika. Mampu mengerjakan soal dengan tingkat kesulitan tinggi dengan baik.';
    else if (theta >= 1.0) return 'Siswa memiliki kemampuan di atas rata-rata. Mampu mengerjakan soal dengan tingkat kesulitan sedang hingga sulit.';
    else if (theta >= 0.0) return 'Siswa memiliki kemampuan rata-rata. Mampu mengerjakan soal dengan tingkat kesulitan sedang dengan cukup baik.';
    else if (theta >= -1.0) return 'Siswa memiliki kemampuan di bawah rata-rata. Perlu latihan lebih banyak untuk soal dengan tingkat kesulitan sedang.';
    else return 'Siswa memerlukan bimbingan intensif. Disarankan untuk mempelajari kembali materi dasar dan berlatih soal-soal mudah terlebih dahulu.';
}

function calculateStandardError(theta) {
    return 1 / Math.sqrt(2.0);
}

/**
 * Normalisasi nilai level kognitif dari berbagai format DB.
 */
function normalizeLevel(rawLevel) {
    if (!rawLevel) return 'Tanpa Level';
    const s = String(rawLevel).trim();
    if (!s) return 'Tanpa Level';
    if (/level\s*1|^1$|^l1$/i.test(s)) return 'Level 1';
    if (/level\s*2|^2$|^l2$/i.test(s)) return 'Level 2';
    if (/level\s*3|^3$|^l3$/i.test(s)) return 'Level 3';
    const m = s.match(/^Level\s+(\d+)/i);
    if (m) return `Level ${m[1]}`;
    return 'Tanpa Level';
}

// ─────────────────────────────────────────────────────────────────────────────
// STACKED BAR CHART HELPER
// Menghasilkan HTML stacked bar: segmen hijau (benar) + merah (salah) + abu (kosong)
// ─────────────────────────────────────────────────────────────────────────────
function renderStackedBar(benar, salah, kosong, total, compact = false) {
    if (total === 0) return '';
    const pBenar  = (benar  / total) * 100;
    const pSalah  = (salah  / total) * 100;
    const pKosong = (kosong / total) * 100;
    const height  = compact ? '10px' : '14px';

    const segments = [];
    if (benar > 0)  segments.push(`<div title="${benar} Benar (${Math.round(pBenar)}%)"  style="width:${pBenar}%;height:${height};background:#10b981;transition:width 0.5s ease;"></div>`);
    if (salah > 0)  segments.push(`<div title="${salah} Salah (${Math.round(pSalah)}%)"  style="width:${pSalah}%;height:${height};background:#ef4444;transition:width 0.5s ease;"></div>`);
    if (kosong > 0) segments.push(`<div title="${kosong} Kosong (${Math.round(pKosong)}%)" style="width:${pKosong}%;height:${height};background:#d1d5db;transition:width 0.5s ease;"></div>`);

    return `<div style="display:flex;background:#f3f4f6;border-radius:999px;overflow:hidden;gap:1px;">${segments.join('')}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER PETA KOMPETENSI (HABISUJIAN) — ENHANCED
// ─────────────────────────────────────────────────────────────────────────────
function renderPetaKompetensi(questions, answers) {
    const section = document.getElementById('petaKompetensiSection');
    const body    = document.getElementById('petaKompetensiBody');
    if (!section || !body) return;
    if (!questions || questions.length === 0) return;

    // ── Kumpulkan data per bab & level ────────────────────────────
    const babMap = {};

    questions.forEach((q, idx) => {
        const bab   = (q.bab || q.chapter || 'Lainnya').trim();
        const level = normalizeLevel(q.level || q.cognitive_level);

        if (!babMap[bab]) babMap[bab] = { total: 0, benar: 0, salah: 0, kosong: 0, levels: {} };
        if (!babMap[bab].levels[level]) babMap[bab].levels[level] = { benar: 0, salah: 0, kosong: 0, soal: [] };

        const answer = answers[idx];
        const nomorSoal = q.nomor_soal || q.question_number || (idx + 1);
        babMap[bab].total++;

        if (!answer || answer === null || answer === '') {
            babMap[bab].kosong++;
            babMap[bab].levels[level].kosong++;
            babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'kosong' });
            return;
        }

        let isCorrect = false;
        try {
            if (q.question_type === 'PGK MCMA') {
                const sel = (answer || '').split(',').sort();
                const cor = Array.isArray(q.correct_answers)
                    ? q.correct_answers.sort()
                    : (q.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(sel) === JSON.stringify(cor);
            } else if (q.question_type === 'PGK Kategori') {
                const sel = typeof answer === 'string' ? JSON.parse(answer) : answer;
                const map = typeof q.category_mapping === 'string'
                    ? JSON.parse(q.category_mapping) : q.category_mapping;
                if (!map || !sel) { isCorrect = false; }
                else {
                    let ok = true;
                    for (const [k, v] of Object.entries(sel)) { if (map[k] !== v) { ok = false; break; } }
                    for (const [k, v] of Object.entries(map)) { if (v && sel[k] !== true) { ok = false; break; } }
                    isCorrect = ok;
                }
            } else {
                isCorrect = answer === q.correct_answer;
            }
        } catch(e) { isCorrect = false; }

        if (isCorrect) {
            babMap[bab].benar++;
            babMap[bab].levels[level].benar++;
            babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'benar' });
        } else {
            babMap[bab].salah++;
            babMap[bab].levels[level].salah++;
            babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'salah' });
        }
    });

    const babs = Object.keys(babMap).sort();
    if (babs.length === 0) return;

    // ── Helper: render pills nomor soal ───────────────────────────
    function renderSoalPills(soalArr) {
        return [...soalArr].sort((a, b) => Number(a.no) - Number(b.no)).map(s => {
            if (s.status === 'benar') {
                return `<span title="Soal No. ${s.no} — Benar" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#d1fae5;color:#065f46;
                    border:1.5px solid #6ee7b7;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}✓</span>`;
            } else if (s.status === 'salah') {
                return `<span title="Soal No. ${s.no} — Salah" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#fee2e2;color:#991b1b;
                    border:1.5px solid #fca5a5;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}✗</span>`;
            } else {
                return `<span title="Soal No. ${s.no} — Tidak Dijawab" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#f3f4f6;color:#9ca3af;
                    border:1.5px solid #e5e7eb;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}—</span>`;
            }
        }).join(' ');
    }

    // ── Helper: label singkat level ────────────────────────────────
    function lvSubLabel(lv) {
        if (lv === 'Level 1') return 'Pengetahuan';
        if (lv === 'Level 2') return 'Aplikasi';
        if (lv === 'Level 3') return 'Penalaran';
        return '';
    }

    const levelOrder = ['Level 1','Level 2','Level 3'];

    // ── Render setiap bab ─────────────────────────────────────────
    const rows = babs.map(bab => {
        const d = babMap[bab];
        const pct = d.total > 0 ? Math.round((d.benar / d.total) * 100) : 0;
        const barColor   = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
        const bgLabel    = pct >= 70 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
        const labelColor = pct >= 70 ? '#065f46' : pct >= 50 ? '#92400e' : '#991b1b';
        const emoji      = pct >= 70 ? '✅' : pct >= 50 ? '⚠️' : '❌';
        const label      = pct >= 70 ? 'Baik' : pct >= 50 ? 'Cukup' : 'Perlu Latihan';

        // Urutkan level
        const levels = Object.keys(d.levels).sort((a, b) => {
            const ia = levelOrder.indexOf(a), ib = levelOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1; if (ib !== -1) return 1;
            return a.localeCompare(b);
        });

        // ── Stacked Bar Chart ringkasan (semua level digabung, per-segmen) ──
        const mainStackedBar = renderStackedBar(d.benar, d.salah, d.kosong, d.total);

        // ── Render detail tiap level ───────────────────────────────
        const levelRows = levels.map(lv => {
            const lvd    = d.levels[lv];
            const lvBenar  = lvd.benar;
            const lvSalah  = lvd.salah;
            const lvKosong = lvd.kosong;
            const lvTotal  = lvBenar + lvSalah + lvKosong;
            const lvPct    = lvTotal > 0 ? Math.round((lvBenar / lvTotal) * 100) : 0;
            const lvSub    = lvSubLabel(lv);

            // Warna label performa per level
            const lvBg    = lvPct >= 70 ? '#d1fae5' : lvPct >= 50 ? '#fef3c7' : '#fee2e2';
            const lvFg    = lvPct >= 70 ? '#065f46' : lvPct >= 50 ? '#92400e' : '#991b1b';

            // Stacked bar per level
            const lvStackedBar = renderStackedBar(lvBenar, lvSalah, lvKosong, lvTotal, true);

            return `
            <div style="margin-top:10px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <!-- Header level -->
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:0.78rem;font-weight:700;color:#4f46e5;background:#ede9fe;padding:2px 9px;border-radius:20px;">
                            ${lv}${lvSub ? ' · ' + lvSub : ''}
                        </span>
                        <span style="font-size:0.75rem;color:#059669;font-weight:600;">✔ ${lvBenar}</span>
                        <span style="font-size:0.75rem;color:#dc2626;font-weight:600;">✘ ${lvSalah}</span>
                        ${lvKosong > 0 ? `<span style="font-size:0.75rem;color:#9ca3af;font-weight:600;">— ${lvKosong}</span>` : ''}
                    </div>
                    <span style="font-size:0.72rem;font-weight:700;color:${lvFg};background:${lvBg};padding:2px 9px;border-radius:20px;">
                        ${lvPct}%
                    </span>
                </div>

                <!-- Stacked bar per level -->
                <div style="margin-bottom:8px;">
                    ${lvStackedBar}
                    <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:#9ca3af;margin-top:3px;">
                        <span style="color:#10b981;font-weight:600;">${lvBenar} benar</span>
                        <span style="color:#6b7280;">${lvTotal} soal</span>
                        <span style="color:#ef4444;font-weight:600;">${lvSalah} salah</span>
                    </div>
                </div>

                <!-- Pills nomor soal -->
                <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">
                    ${renderSoalPills(lvd.soal)}
                </div>
            </div>`;
        }).join('');

        return `
        <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
            <!-- Header bab -->
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.1rem;">${emoji}</span>
                    <span style="font-weight:700;color:#1f2937;font-size:0.92rem;">${bab}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="color:#059669;font-size:0.8rem;font-weight:600;">✔ ${d.benar} Benar</span>
                    <span style="color:#dc2626;font-size:0.8rem;font-weight:600;">✘ ${d.salah} Salah</span>
                    ${d.kosong > 0 ? `<span style="color:#9ca3af;font-size:0.8rem;font-weight:600;">— ${d.kosong} Kosong</span>` : ''}
                    <span style="background:${bgLabel};color:${labelColor};padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">${label}</span>
                </div>
            </div>

            <!-- Stacked bar utama (semua level gabungan) -->
            <div style="margin-bottom:4px;">
                ${mainStackedBar}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#9ca3af;margin-bottom:2px;">
                <span style="color:#10b981;font-weight:600;">${d.benar} benar</span>
                <span style="color:#6b7280;">${pct}% dari ${d.total} soal</span>
                <span style="color:#ef4444;font-weight:600;">${d.salah} salah</span>
            </div>

            <!-- Detail per level kognitif -->
            ${levelRows}
        </div>`;
    }).join('');

    body.innerHTML = `
        <div style="display:grid;gap:4px;">
            ${rows}
        </div>

        <!-- Legenda -->
        <div style="margin-top:16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
            <div style="font-size:0.78rem;font-weight:700;color:#374151;margin-bottom:10px;">📊 Keterangan Stacked Bar & Nomor Soal:</div>

            <!-- Legenda bar -->
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.77rem;color:#065f46;">
                    <span style="display:inline-block;width:24px;height:12px;background:#10b981;border-radius:3px;"></span>
                    Benar
                </span>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.77rem;color:#991b1b;">
                    <span style="display:inline-block;width:24px;height:12px;background:#ef4444;border-radius:3px;"></span>
                    Salah
                </span>
                <span style="display:inline-flex;align-items:center;gap:6px;font-size:0.77rem;color:#6b7280;">
                    <span style="display:inline-block;width:24px;height:12px;background:#d1d5db;border-radius:3px;"></span>
                    Tidak Dijawab
                </span>
            </div>

            <!-- Legenda pill -->
            <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding-top:10px;border-top:1px solid #e2e8f0;">
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#065f46;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7;border-radius:6px;font-size:0.7rem;font-weight:700;">7✓</span> Benar
                </span>
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#991b1b;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#fee2e2;color:#991b1b;border:1.5px solid #fca5a5;border-radius:6px;font-size:0.7rem;font-weight:700;">3✗</span> Salah
                </span>
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#6b7280;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#f3f4f6;color:#9ca3af;border:1.5px solid #e5e7eb;border-radius:6px;font-size:0.7rem;font-weight:700;">5—</span> Tidak Dijawab
                </span>
                <span style="font-size:0.75rem;color:#6b7280;">| Angka = nomor soal</span>
            </div>

            <!-- Legenda kategori -->
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;">
                <span style="font-size:0.77rem;color:#166534;"><span style="color:#059669;font-weight:700;">✅ ≥70%</span> Baik — pertahankan!</span>
                <span style="font-size:0.77rem;color:#92400e;"><span style="color:#d97706;font-weight:700;">⚠️ 50–69%</span> Cukup — perlu ulang materi</span>
                <span style="font-size:0.77rem;color:#991b1b;"><span style="color:#dc2626;font-weight:700;">❌ &lt;50%</span> Perlu latihan intensif</span>
            </div>
        </div>
    `;

    section.style.display = 'block';
}

// Function to retake exam
function retakeExam() {
    alert("Kesempatan ujian hanya 1 kali. Silakan cek analisis nilai Anda di Riwayat Ujian.");
    window.location.href = 'halamanpertama.html';
}

function goToAIViewer() {
    const sessionId = window._examSessionId || examSessionId;
    const userId = window._examUserId;

    if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
        alert('Session ID tidak ditemukan.');
        return;
    }

    let url = `ai_viewer.html?session=${encodeURIComponent(sessionId)}`;
    if (userId) url += `&user=${encodeURIComponent(userId)}`;
    window.location.href = url;
}

function showAIAnalysisNotification(analysisCount) {
    const notification = document.createElement('div');
    notification.className = 'ai-analysis-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-brain"></i>
            <div class="notification-text">
                <strong>AI Analysis Selesai!</strong>
                <p>${analysisCount} jawaban telah dianalisis oleh AI. Lihat analisis detail melalui menu <strong>Riwayat Ujian</strong> di halaman utama.</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => { if (notification.parentElement) notification.remove(); }, 10000);
}

// Export functions for global access
window.retakeExam = retakeExam;
window.goToAIViewer = goToAIViewer;
window.showAIAnalysisNotification = showAIAnalysisNotification;