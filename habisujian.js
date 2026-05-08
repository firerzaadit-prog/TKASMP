// habisujian.js - Exam completion page with results and answer review
// REFACTORED: AI analysis dipindah ke sisi admin (tidak lagi dipanggil di sini)
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';
import { getItemParameters } from './irt_analysis.js';

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

        // ─────────────────────────────────────────────────────────────
        // REFACTORED: AI TIDAK dipanggil di sini.
        // Tampilkan banner informasi bahwa analisis AI sedang diproses admin.
        // ─────────────────────────────────────────────────────────────
        showAIPendingBanner();

    } catch (error) {
        console.error('Error loading exam results:', error);
        alert('Terjadi kesalahan saat memuat hasil ujian: ' + error.message);
    }
}

/**
 * Menampilkan banner informasi bahwa analisis AI akan diproses oleh admin.
 * Siswa bisa mengecek hasilnya nanti di halamanpertama.html (Riwayat Ujian).
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
    // Display final score
    const finalScoreElement = document.getElementById('finalScore');
    if (finalScoreElement) {
        finalScoreElement.textContent = session.total_score || 0;
    }

    // Display pass status
    const passStatusElement = document.getElementById('passStatus');
    if (passStatusElement) {
        const isPassed = session.is_passed || (session.total_score >= 50);
        passStatusElement.textContent = isPassed ? '🎉 LULUS' : '❌ TIDAK LULUS';
        passStatusElement.className = `pass-status ${isPassed ? 'pass' : 'fail'}`;
    }

    // Display exam duration
    const examDurationElement = document.getElementById('examDuration');
    if (examDurationElement && session.total_time_seconds) {
        const minutes = Math.floor(session.total_time_seconds / 60);
        const seconds = session.total_time_seconds % 60;
        examDurationElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')} menit`;
    }

    // Display total questions
    const totalQuestionsElement = document.getElementById('totalQuestions');
    if (totalQuestionsElement) {
        totalQuestionsElement.textContent = questions.length;
    }

    // Calculate and display correct answers
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

    // Render answer review menggunakan fungsi global dari HTML
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

    // IRT Analysis (jika elemen tersedia)
    try {
        const itemParams = questions.map(q => getItemParameters(q));
        if (itemParams && itemParams.length > 0) {
            const theta = estimateTheta(answers, questions, itemParams);
            displayIRTResults(theta);
        }
    } catch (irtErr) {
        console.warn('IRT analysis skipped:', irtErr.message);
    }
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
    } catch (error) {
        console.error('Error checking answer correctness:', error);
        return false;
    }
}

/**
 * Display IRT results in the UI
 */
function displayIRTResults(theta) {
    const irtResultElement = document.getElementById('irtResult');
    if (!irtResultElement) {
        console.warn('IRT result element not found');
        return;
    }
    
    const abilityLevel = interpretAbilityLevel(theta);
    const abilityDescription = getAbilityDescription(theta);
    const standardError = calculateStandardError(theta);
    
    irtResultElement.innerHTML = `
        <div class="irt-analysis-card">
            <h3 class="irt-title">
                <i class="fas fa-chart-line"></i> Analisis Kemampuan (IRT)
            </h3>
            <div class="irt-content">
                <div class="irt-main-score">
                    <div class="theta-value">
                        <span class="theta-number">${theta >= 0 ? '+' : ''}${theta.toFixed(2)}</span>
                        <span class="theta-label">θ (Theta)</span>
                    </div>
                    <div class="ability-badge ${abilityLevel.class}">
                        ${abilityLevel.icon} ${abilityLevel.label}
                    </div>
                </div>
                <div class="irt-details">
                    <div class="irt-detail-item">
                        <span class="detail-label">Standar Error:</span>
                        <span class="detail-value">±${standardError.toFixed(2)}</span>
                    </div>
                    <div class="irt-detail-item">
                        <span class="detail-label">Rentang Kemampuan:</span>
                        <span class="detail-value">${(theta - standardError).toFixed(2)} s/d ${(theta + standardError).toFixed(2)}</span>
                    </div>
                </div>
                <div class="irt-description">
                    <p>${abilityDescription}</p>
                </div>
                <div class="irt-scale">
                    <div class="scale-bar">
                        <div class="scale-marker" style="left: ${((theta + 3) / 6) * 100}%"></div>
                    </div>
                    <div class="scale-labels">
                        <span>Rendah</span>
                        <span>Sedang</span>
                        <span>Tinggi</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    irtResultElement.style.display = 'block';
}

function interpretAbilityLevel(theta) {
    if (theta >= 2.0) {
        return { label: 'Sangat Tinggi', class: 'ability-very-high', icon: '🌟' };
    } else if (theta >= 1.0) {
        return { label: 'Tinggi', class: 'ability-high', icon: '⭐' };
    } else if (theta >= 0.0) {
        return { label: 'Sedang', class: 'ability-medium', icon: '📊' };
    } else if (theta >= -1.0) {
        return { label: 'Rendah', class: 'ability-low', icon: '📈' };
    } else {
        return { label: 'Perlu Bimbingan', class: 'ability-very-low', icon: '💪' };
    }
}

function getAbilityDescription(theta) {
    if (theta >= 2.0) {
        return 'Siswa memiliki kemampuan sangat tinggi dalam matematika. Mampu mengerjakan soal dengan tingkat kesulitan tinggi dengan baik.';
    } else if (theta >= 1.0) {
        return 'Siswa memiliki kemampuan di atas rata-rata. Mampu mengerjakan soal dengan tingkat kesulitan sedang hingga sulit.';
    } else if (theta >= 0.0) {
        return 'Siswa memiliki kemampuan rata-rata. Mampu mengerjakan soal dengan tingkat kesulitan sedang dengan cukup baik.';
    } else if (theta >= -1.0) {
        return 'Siswa memiliki kemampuan di bawah rata-rata. Perlu latihan lebih banyak untuk soal dengan tingkat kesulitan sedang.';
    } else {
        return 'Siswa memerlukan bimbingan intensif. Disarankan untuk mempelajari kembali materi dasar dan berlatih soal-soal mudah terlebih dahulu.';
    }
}

function calculateStandardError(theta) {
    const averageInformation = 2.0;
    return 1 / Math.sqrt(averageInformation);
}

/**
 * Render Peta Kompetensi per bab di halaman hasil ujian siswa.
 * Menampilkan jumlah benar / salah / tidak dijawab per bab beserta progress bar.
 */
function renderPetaKompetensi(questions, answers) {
    const section = document.getElementById('petaKompetensiSection');
    const body    = document.getElementById('petaKompetensiBody');
    if (!section || !body) return;
    if (!questions || questions.length === 0) return;

    // ── Kumpulkan data per bab ─────────────────────────────────────
    const babMap = {};

    questions.forEach((q, idx) => {
        const bab = (q.bab || q.chapter || 'Lainnya').trim();
        if (!babMap[bab]) {
            babMap[bab] = { total: 0, benar: 0, salah: 0, kosong: 0 };
        }

        const answer = answers[idx];
        babMap[bab].total++;

        if (!answer || answer === null || answer === '') {
            babMap[bab].kosong++;
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
                    for (const [k, v] of Object.entries(sel)) {
                        if (map[k] !== v) { ok = false; break; }
                    }
                    for (const [k, v] of Object.entries(map)) {
                        if (v && sel[k] !== true) { ok = false; break; }
                    }
                    isCorrect = ok;
                }
            } else {
                isCorrect = answer === q.correct_answer;
            }
        } catch(e) { isCorrect = false; }

        if (isCorrect) babMap[bab].benar++;
        else babMap[bab].salah++;
    });

    const babs = Object.keys(babMap).sort();
    if (babs.length === 0) return;

    // ── Render ─────────────────────────────────────────────────────
    body.innerHTML = `
        <div style="display:grid;gap:14px;">
            ${babs.map(bab => {
                const d = babMap[bab];
                const pct = Math.round((d.benar / d.total) * 100);
                const barColor = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
                const bgBar   = pct >= 70 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
                const emoji   = pct >= 70 ? '✅' : pct >= 50 ? '⚠️' : '❌';
                const label   = pct >= 70 ? 'Baik' : pct >= 50 ? 'Cukup' : 'Perlu Latihan';
                const labelColor = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';

                return `<div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:1.1rem;">${emoji}</span>
                            <span style="font-weight:700;color:#1f2937;font-size:0.92rem;">${bab}</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <span style="color:#059669;font-size:0.8rem;font-weight:600;">✔ ${d.benar} Benar</span>
                            <span style="color:#dc2626;font-size:0.8rem;font-weight:600;">✘ ${d.salah} Salah</span>
                            ${d.kosong > 0 ? `<span style="color:#9ca3af;font-size:0.8rem;font-weight:600;">— ${d.kosong} Kosong</span>` : ''}
                            <span style="background:${bgBar};color:${labelColor};padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">${label}</span>
                        </div>
                    </div>
                    <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                        <div style="width:${pct}%;height:100%;background:${barColor};border-radius:999px;transition:width 0.6s ease;"></div>
                    </div>
                    <div style="text-align:right;font-size:0.72rem;color:#6b7280;margin-top:4px;">${pct}% benar dari ${d.total} soal</div>
                </div>`;
            }).join('')}
        </div>

        <!-- Legenda ringkas -->
        <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;display:flex;gap:20px;flex-wrap:wrap;">
            <span style="font-size:0.78rem;color:#166534;"><span style="color:#059669;font-weight:700;">✅ ≥70%</span> Baik — pertahankan!</span>
            <span style="font-size:0.78rem;color:#92400e;"><span style="color:#d97706;font-weight:700;">⚠️ 50–69%</span> Cukup — perlu ulang materi</span>
            <span style="font-size:0.78rem;color:#991b1b;"><span style="color:#dc2626;font-weight:700;">❌ &lt;50%</span> Perlu latihan intensif</span>
        </div>
    `;

    section.style.display = 'block';
}

// Function to retake exam
function retakeExam() {
    alert("Kesempatan ujian hanya 1 kali. Silakan cek analisis nilai Anda di Riwayat Ujian.");
    window.location.href = 'halamanpertama.html';
}

/**
 * goToAIViewer: Arahkan ke halaman AI Viewer dengan parameter session.
 * Tetap dipertahankan untuk kasus admin men-share link langsung,
 * tapi tombol utama siswa seharusnya ada di halamanpertama (Riwayat Ujian).
 */
function goToAIViewer() {
    const sessionId = window._examSessionId || examSessionId;
    const userId = window._examUserId;

    if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
        alert('Session ID tidak ditemukan.');
        return;
    }

    let url = `ai_viewer.html?session=${encodeURIComponent(sessionId)}`;
    if (userId) {
        url += `&user=${encodeURIComponent(userId)}`;
    }

    window.location.href = url;
}

/**
 * showAIAnalysisNotification — dipertahankan dari versi lama.
 * Menampilkan toast notification bahwa analisis AI sudah tersedia.
 * Bisa dipanggil dari luar (misal: setelah admin selesai generate).
 * @param {number} analysisCount - jumlah jawaban yang dianalisis
 */
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

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 10000);
}

// Export functions for global access
window.retakeExam = retakeExam;
window.goToAIViewer = goToAIViewer;
window.showAIAnalysisNotification = showAIAnalysisNotification;