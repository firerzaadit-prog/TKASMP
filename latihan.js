import { supabase } from './clientSupabase.js';

// ============================================================
// LATIHAN BERTINGKAT - Student page logic
// Terpisah total dari materi.js & ujian.js. Tabel yang dipakai:
// practice_questions, practice_progress, practice_attempts
// (lihat SQL/practice_bertingkat_setup.sql)
// ============================================================

// Taksonomi chapter SAMA PERSIS dengan yang dipakai form Soal (Simulasi/Evaluasi TKA)
// dan form Materi, supaya konsisten lintas modul.
const CHAPTERS = [
    { key: 'Bilangan', icon: 'fa-hashtag' },
    { key: 'Aljabar', icon: 'fa-square-root-variable' },
    { key: 'Geometri dan pengukuran', icon: 'fa-shapes' },
    { key: 'Data dan peluang', icon: 'fa-chart-pie' }
];
const STAGES = [1, 2, 3];
const QUESTIONS_PER_STAGE = 10;
const PASSING_SCORE = 7; // >= 7 dari 10 (>=70%)

let currentUserId = null;

let progressData = {};   // progressData[chapter][stage] = { status, best_score, attempts_count, passed_at }
let activeCounts = {};   // activeCounts[chapter][stage] = jumlah soal aktif

let activeChapter = null;
let activeStage = null;
let attemptQuestions = [];   // 10 soal yang sedang dikerjakan
let attemptAnswers = {};     // { [question_id]: answer }
// PG answer: 'A'|'B'|'C'|'D'
// MCMA answer: 'A,C,D' (comma-separated)
// Kategori answer: {0: true, 1: false, ...} (object)
let attemptStartedAt = null;
let lastResult = null;       // hasil percobaan terakhir, untuk render viewResult

// ------------------------------------------------------------
// INIT
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
    await initLanding();
});

async function loadUserProfile() {
    try {
        const { getCurrentUser } = await import('./auth.js');
        const result = await getCurrentUser();

        if (!result.success || !result.user) {
            const profileName = document.querySelector('.profile-name');
            if (profileName) profileName.textContent = 'Tamu';
            return;
        }

        currentUserId = result.user.id;

        let profileData = null;
        try {
            const { data } = await supabase
                .from('profiles')
                .select('nama_lengkap, avatar_url')
                .eq('id', result.user.id)
                .single();
            profileData = data;
        } catch (err) {
            console.warn('Tidak bisa memuat profil:', err);
        }

        const displayName = profileData?.nama_lengkap?.trim()
            || result.user.user_metadata?.full_name
            || result.user.user_metadata?.name
            || (result.user.email ? result.user.email.split('@')[0] : 'Siswa');

        const profileName = document.querySelector('.profile-name');
        if (profileName) profileName.textContent = displayName;

        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar) {
            if (profileData?.avatar_url) {
                profileAvatar.src = profileData.avatar_url;
            } else {
                const firstLetter = displayName.charAt(0).toUpperCase();
                profileAvatar.src = `data:image/svg+xml;base64,${btoa(`<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" fill="#4F46E5"/><text x="20" y="25" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

async function performLogout() {
    if (confirm('Apakah Anda ingin logout?')) {
        try {
            const { logout } = await import('./auth.js');
            await logout();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Logout gagal: ' + error.message);
        }
    }
}
window.logout = performLogout;

function startExam() {
    if (confirm('Apakah Anda yakin ingin memulai ujian TKA Matematika? Pastikan koneksi internet stabil dan waktu cukup.')) {
        window.location.href = 'preexam.html';
    }
}
window.startExam = startExam;

// ------------------------------------------------------------
// LANDING - daftar chapter + status 3 tahap
// ------------------------------------------------------------
async function initLanding() {
    const grid = document.getElementById('chaptersGrid');

    if (!currentUserId) {
        const { data } = await supabase.auth.getUser();
        currentUserId = data?.user?.id || null;
    }
    if (!currentUserId) {
        grid.innerHTML = '<div class="latihan-loading">Silakan login terlebih dahulu untuk mengakses Latihan Bertingkat.</div>';
        return;
    }

    grid.innerHTML = '<div class="latihan-loading"><i class="fas fa-spinner fa-spin"></i> Memuat topik latihan...</div>';

    try {
        await Promise.all([loadProgress(), loadActiveCounts()]);
        renderChaptersGrid();
    } catch (error) {
        console.error('Gagal memuat data latihan:', error);
        grid.innerHTML = '<div class="latihan-loading">Gagal memuat data. Silakan refresh halaman.</div>';
    }
}

async function loadProgress() {
    const { data, error } = await supabase
        .from('practice_progress')
        .select('chapter, stage, status, best_score, attempts_count, passed_at')
        .eq('user_id', currentUserId);

    progressData = {};
    if (error) { console.error('Error loading practice_progress:', error); return; }
    (data || []).forEach(row => {
        if (!progressData[row.chapter]) progressData[row.chapter] = {};
        progressData[row.chapter][row.stage] = row;
    });
}

async function loadActiveCounts() {
    const { data, error } = await supabase
        .from('practice_questions')
        .select('chapter, stage')
        .eq('is_active', true);

    activeCounts = {};
    if (error) { console.error('Error loading practice_questions counts:', error); return; }
    (data || []).forEach(row => {
        if (!activeCounts[row.chapter]) activeCounts[row.chapter] = {};
        activeCounts[row.chapter][row.stage] = (activeCounts[row.chapter][row.stage] || 0) + 1;
    });
}

// Status tahap dihitung dari rantai kelulusan berurutan, BUKAN hanya dari
// baris practice_progress yang tersimpan (lebih tahan terhadap baris yang
// belum sempat dibuat / lazy-create). Tahap 1 selalu default 'unlocked'.
function computeStageStatus(chapter, stage) {
    const rec = progressData[chapter]?.[stage];
    if (rec?.status === 'passed') return 'passed';
    if (stage === 1) return 'unlocked';
    const prevRec = progressData[chapter]?.[stage - 1];
    if (prevRec?.status === 'passed') return 'unlocked';
    return 'locked';
}

function renderChaptersGrid() {
    const grid = document.getElementById('chaptersGrid');
    grid.innerHTML = '';

    CHAPTERS.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'chapter-card';

        let stagesHtml = '';
        STAGES.forEach(stage => {
            const status = computeStageStatus(ch.key, stage);
            const count = (activeCounts[ch.key] && activeCounts[ch.key][stage]) || 0;
            const ready = count >= QUESTIONS_PER_STAGE;
            const rec = progressData[ch.key]?.[stage];

            let boxClass = 'locked';
            let statusLabel = 'Terkunci';
            let scoreLabel = '';
            let clickable = false;

            if (status === 'locked') {
                boxClass = 'locked';
                statusLabel = 'Terkunci';
            } else if (!ready) {
                boxClass = 'not-ready';
                statusLabel = `Segera hadir (${count}/${QUESTIONS_PER_STAGE})`;
            } else if (status === 'passed') {
                boxClass = 'passed';
                statusLabel = 'Lulus';
                clickable = true;
                if (rec?.best_score != null) scoreLabel = `Skor terbaik: ${rec.best_score}/${QUESTIONS_PER_STAGE}`;
            } else {
                boxClass = 'unlocked';
                statusLabel = 'Tersedia';
                clickable = true;
                if (rec?.best_score) scoreLabel = `Terakhir: ${rec.best_score}/${QUESTIONS_PER_STAGE}`;
            }

            stagesHtml += `
                <div class="stage-box ${boxClass}" ${clickable ? `onclick="window.openPreStage('${escapeAttr(ch.key)}', ${stage})"` : ''}>
                    <span class="stage-label">${status === 'locked' ? '<i class="fas fa-lock"></i> ' : ''}Tahap ${stage}</span>
                    <span class="stage-status">${statusLabel}</span>
                    ${scoreLabel ? `<span class="stage-score">${scoreLabel}</span>` : ''}
                </div>`;
        });

        card.innerHTML = `
            <div class="chapter-card-title"><i class="fas ${ch.icon}"></i> ${escapeHtml(ch.key)}</div>
            <div class="chapter-card-sub">3 tahap &middot; 10 soal per tahap &middot; lulus &ge; 7/10</div>
            <div class="stage-row">${stagesHtml}</div>
            <div class="chapter-card-footer">
                <button class="chapter-history-link" onclick="window.openHistory('${escapeAttr(ch.key)}')">
                    <i class="fas fa-history"></i> Lihat riwayat
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ------------------------------------------------------------
// PRE-STAGE
// ------------------------------------------------------------
function openPreStage(chapter, stage) {
    activeChapter = chapter;
    activeStage = stage;

    document.getElementById('prestageTitle').textContent = `${chapter} — Tahap ${stage}`;

    const rec = progressData[chapter]?.[stage];
    const bestBox = document.getElementById('prestageBestScore');
    if (rec && rec.best_score) {
        bestBox.textContent = `Skor terbaik kamu: ${rec.best_score}/${QUESTIONS_PER_STAGE} · Sudah dicoba ${rec.attempts_count || 0}x`;
        bestBox.style.display = 'inline-block';
    } else {
        bestBox.style.display = 'none';
    }

    document.getElementById('prestageHistoryBox').innerHTML =
        `<button onclick="window.openHistory('${escapeAttr(chapter)}')">Lihat riwayat percobaan topik ini</button>`;

    const startBtn = document.getElementById('startStageBtn');
    startBtn.disabled = false;
    startBtn.innerHTML = '<i class="fas fa-play"></i> Mulai Mengerjakan';

    showView('viewPreStage');
}
window.openPreStage = openPreStage;

async function beginStageAttempt() {
    const btn = document.getElementById('startStageBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat soal...';

    try {
        const { data, error } = await supabase
            .from('practice_questions')
            .select('id, question_text, question_type, option_a, option_b, option_c, option_d, correct_answer, correct_answers, category_options, category_mapping, explanation, image_url')
            .eq('chapter', activeChapter)
            .eq('stage', activeStage)
            .eq('is_active', true);

        if (error) throw error;

        if (!data || data.length < QUESTIONS_PER_STAGE) {
            alert('Soal untuk tahap ini belum lengkap. Coba lagi nanti.');
            backToLanding();
            return;
        }

        attemptQuestions = shuffleArray(data).slice(0, QUESTIONS_PER_STAGE);
        attemptAnswers = {};
        attemptStartedAt = new Date().toISOString();

        renderQuiz();
        showView('viewQuiz');
    } catch (err) {
        console.error('Gagal memuat soal:', err);
        alert('Gagal memuat soal latihan. Silakan coba lagi.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> Mulai Mengerjakan';
    }
}
window.beginStageAttempt = beginStageAttempt;

// ------------------------------------------------------------
// QUIZ - render questions based on type
// ------------------------------------------------------------
function renderQuiz() {
    document.getElementById('quizTitle').textContent = `${activeChapter} — Tahap ${activeStage}`;

    const list = document.getElementById('quizQuestionsList');
    list.innerHTML = '';

    attemptQuestions.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'quiz-question-card';
        card.id = `qcard-${q.id}`;

        const questionType = q.question_type || 'PG';

        let optionsHtml = '';
        if (questionType === 'PGK MCMA') {
            optionsHtml = renderMCMAQuizOptions(q, idx);
        } else if (questionType === 'PGK Kategori') {
            optionsHtml = renderKategoriQuizOptions(q, idx);
        } else {
            optionsHtml = renderPGQuizOptions(q, idx);
        }

        card.innerHTML = `
            <span class="quiz-question-number">Soal ${idx + 1} / ${QUESTIONS_PER_STAGE}${questionType !== 'PG' ? ` <span class="quiz-type-tag quiz-type-tag-${questionType === 'PGK MCMA' ? 'mcma' : 'kategori'}">${questionType === 'PGK MCMA' ? 'Jawaban Ganda' : 'Benar/Salah'}</span>` : ''}</span>
            <div class="quiz-question-text">${formatRichText(q.question_text)}</div>
            ${q.image_url ? `<img src="${q.image_url}" class="quiz-question-image" alt="Gambar soal">` : ''}
            ${optionsHtml}
        `;
        list.appendChild(card);
    });

    updateQuizProgress();
}

// --- PG (Pilihan Ganda biasa) ---
function renderPGQuizOptions(q, idx) {
    const options = [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]];
    return `<div class="quiz-options">
        ${options.map(([letter, text]) => `
            <label class="quiz-option" data-question="${q.id}" data-letter="${letter}">
                <input type="radio" name="q-${q.id}" value="${letter}" onchange="window.selectAnswer('${q.id}', '${letter}')">
                <span><span class="quiz-option-letter">${letter}.</span> ${formatRichText(text)}</span>
            </label>
        `).join('')}
    </div>`;
}

// --- PGK MCMA ---
function renderMCMAQuizOptions(q, idx) {
    const options = [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]].filter(([_, t]) => t);
    const currentAnswer = attemptAnswers[q.id];
    const selectedArr = currentAnswer ? currentAnswer.split(',') : [];

    return `
        <div class="quiz-mcma-instruction"><i class="fas fa-info-circle"></i> Pilih satu atau lebih jawaban yang benar</div>
        <div class="quiz-options quiz-options-mcma">
            ${options.map(([letter, text]) => {
                const isSelected = selectedArr.includes(letter);
                return `
                <label class="quiz-option quiz-option-mcma ${isSelected ? 'selected' : ''}" data-question="${q.id}" data-letter="${letter}">
                    <input type="checkbox" name="qm-${q.id}" value="${letter}" ${isSelected ? 'checked' : ''}
                           onchange="window.toggleMCMAAnswer('${q.id}', '${letter}')">
                    <span>
                        <span class="quiz-mcma-check ${isSelected ? 'checked' : ''}"><i class="fas fa-check"></i></span>
                        <span class="quiz-option-letter">${letter}.</span> ${formatRichText(text)}
                    </span>
                </label>`;
            }).join('')}
        </div>`;
}

// --- PGK Kategori ---
function renderKategoriQuizOptions(q, idx) {
    let statements = [];
    try {
        statements = q.category_options || [];
        if (typeof statements === 'string') statements = JSON.parse(statements);
    } catch { statements = []; }

    if (!statements || statements.length === 0) {
        return '<div style="color:#ef4444; padding:1rem;">Data pernyataan tidak tersedia.</div>';
    }

    const currentAnswer = attemptAnswers[q.id];
    let selectedAnswers = {};
    try {
        selectedAnswers = currentAnswer ? (typeof currentAnswer === 'string' ? JSON.parse(currentAnswer) : currentAnswer) : {};
    } catch { selectedAnswers = {}; }

    const answeredCount = Object.keys(selectedAnswers).length;

    return `
        <div class="quiz-kategori-wrapper">
            <div class="quiz-kategori-header">
                <div><i class="fas fa-table"></i> <strong>Benar/Salah</strong></div>
                <div class="quiz-kategori-progress">${answeredCount}/${statements.length} dijawab</div>
            </div>
            <p class="quiz-kategori-instruction">
                <i class="fas fa-info-circle"></i>
                Tentukan nilai kebenaran setiap pernyataan berikut.
            </p>
            <table class="quiz-kategori-table">
                <thead>
                    <tr>
                        <th style="width:42px;">No</th>
                        <th>Pernyataan</th>
                        <th style="width:80px; text-align:center;">Benar</th>
                        <th style="width:80px; text-align:center;">Salah</th>
                    </tr>
                </thead>
                <tbody>
                    ${statements.map((stmt, sIdx) => {
                        const isTrue = selectedAnswers[sIdx] === true;
                        const isFalse = selectedAnswers[sIdx] === false;
                        const rowClass = isTrue ? 'quiz-kat-row-benar' : (isFalse ? 'quiz-kat-row-salah' : '');
                        return `
                        <tr class="quiz-kat-row ${rowClass}" id="qkat-${q.id}-${sIdx}">
                            <td style="text-align:center;"><span class="quiz-kat-no">${sIdx + 1}</span></td>
                            <td class="quiz-kat-stmt">${formatRichText(typeof stmt === 'string' ? stmt : String(stmt || ''))}</td>
                            <td style="text-align:center;">
                                <button type="button" class="quiz-kat-btn quiz-kat-btn-benar ${isTrue ? 'active' : ''}"
                                        onclick="window.selectKategoriAnswer('${q.id}', ${sIdx}, true)">
                                    <i class="fas fa-check"></i>
                                </button>
                            </td>
                            <td style="text-align:center;">
                                <button type="button" class="quiz-kat-btn quiz-kat-btn-salah ${isFalse ? 'active' : ''}"
                                        onclick="window.selectKategoriAnswer('${q.id}', ${sIdx}, false)">
                                    <i class="fas fa-times"></i>
                                </button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ------------------------------------------------------------
// ANSWER HANDLERS
// ------------------------------------------------------------

// PG answer
function selectAnswer(questionId, letter) {
    attemptAnswers[questionId] = letter;
    const card = document.getElementById(`qcard-${questionId}`);
    if (card) {
        card.classList.add('answered');
        card.querySelectorAll('.quiz-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.letter === letter);
        });
    }
    updateQuizProgress();
}
window.selectAnswer = selectAnswer;

// MCMA answer toggle
function toggleMCMAAnswer(questionId, letter) {
    const currentAnswer = attemptAnswers[questionId];
    let selected = currentAnswer ? currentAnswer.split(',') : [];

    if (selected.includes(letter)) {
        selected = selected.filter(l => l !== letter);
    } else {
        selected.push(letter);
    }

    attemptAnswers[questionId] = selected.length > 0 ? selected.sort().join(',') : undefined;

    // Update UI
    const card = document.getElementById(`qcard-${questionId}`);
    if (card) {
        if (selected.length > 0) card.classList.add('answered');
        else card.classList.remove('answered');

        card.querySelectorAll('.quiz-option-mcma').forEach(opt => {
            const isSelected = selected.includes(opt.dataset.letter);
            opt.classList.toggle('selected', isSelected);
            const check = opt.querySelector('.quiz-mcma-check');
            if (check) check.classList.toggle('checked', isSelected);
            const cb = opt.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = isSelected;
        });
    }
    updateQuizProgress();
}
window.toggleMCMAAnswer = toggleMCMAAnswer;

// Kategori answer
function selectKategoriAnswer(questionId, statementIdx, value) {
    let currentAnswer = attemptAnswers[questionId];
    let answers = {};
    try {
        answers = currentAnswer ? (typeof currentAnswer === 'string' ? JSON.parse(currentAnswer) : { ...currentAnswer }) : {};
    } catch { answers = {}; }

    answers[statementIdx] = value;
    attemptAnswers[questionId] = answers;

    // Update row UI
    const row = document.getElementById(`qkat-${questionId}-${statementIdx}`);
    if (row) {
        row.className = `quiz-kat-row ${value === true ? 'quiz-kat-row-benar' : 'quiz-kat-row-salah'}`;
        const btnBenar = row.querySelector('.quiz-kat-btn-benar');
        const btnSalah = row.querySelector('.quiz-kat-btn-salah');
        if (btnBenar) btnBenar.classList.toggle('active', value === true);
        if (btnSalah) btnSalah.classList.toggle('active', value === false);
    }

    // Update progress counter in the kategori header
    const card = document.getElementById(`qcard-${questionId}`);
    if (card) {
        const progressEl = card.querySelector('.quiz-kategori-progress');
        if (progressEl) {
            progressEl.textContent = `${Object.keys(answers).length}/${card.querySelectorAll('.quiz-kat-row').length} dijawab`;
        }

        // Mark card as answered if all statements answered
        const q = attemptQuestions.find(q => q.id === questionId);
        if (q) {
            let stmts = q.category_options || [];
            if (typeof stmts === 'string') try { stmts = JSON.parse(stmts); } catch { stmts = []; }
            if (Object.keys(answers).length >= stmts.length) {
                card.classList.add('answered');
            }
        }
    }

    updateQuizProgress();
}
window.selectKategoriAnswer = selectKategoriAnswer;

// ------------------------------------------------------------
// PROGRESS
// ------------------------------------------------------------
function isQuestionAnswered(q) {
    const answer = attemptAnswers[q.id];
    if (answer == null || answer === undefined) return false;

    const questionType = q.question_type || 'PG';
    if (questionType === 'PGK Kategori') {
        // All statements must be answered
        let stmts = q.category_options || [];
        if (typeof stmts === 'string') try { stmts = JSON.parse(stmts); } catch { stmts = []; }
        const ansObj = typeof answer === 'string' ? JSON.parse(answer) : answer;
        return Object.keys(ansObj).length >= stmts.length;
    }
    if (questionType === 'PGK MCMA') {
        return typeof answer === 'string' && answer.length > 0;
    }
    // PG
    return !!answer;
}

function updateQuizProgress() {
    const answeredCount = attemptQuestions.filter(q => isQuestionAnswered(q)).length;
    document.getElementById('quizProgressLabel').textContent = `${answeredCount} / ${QUESTIONS_PER_STAGE} terjawab`;
    document.getElementById('quizProgressFill').style.width = `${(answeredCount / QUESTIONS_PER_STAGE) * 100}%`;

    const allAnswered = answeredCount >= QUESTIONS_PER_STAGE;
    const submitBtn = document.getElementById('submitQuizBtn');
    submitBtn.disabled = !allAnswered;

    document.getElementById('quizFooterHint').textContent = allAnswered
        ? 'Semua soal sudah dijawab. Klik untuk mengumpulkan.'
        : `Jawab semua soal untuk mengumpulkan (${QUESTIONS_PER_STAGE - answeredCount} tersisa).`;
}

// ------------------------------------------------------------
// GRADING
// ------------------------------------------------------------
function gradeQuestion(q) {
    const answer = attemptAnswers[q.id];
    const questionType = q.question_type || 'PG';

    if (questionType === 'PGK MCMA') {
        // Compare sorted arrays
        const selected = answer ? answer.split(',').sort() : [];
        const correct = (q.correct_answers || []).slice().sort();
        return selected.length === correct.length && selected.every((v, i) => v === correct[i]);
    }

    if (questionType === 'PGK Kategori') {
        try {
            const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : (answer || {});
            let mapping = q.category_mapping || {};
            if (typeof mapping === 'string') mapping = JSON.parse(mapping);

            for (const [idxStr, correctVal] of Object.entries(mapping)) {
                if (selectedAnswers[parseInt(idxStr)] !== correctVal) return false;
            }
            return true;
        } catch { return false; }
    }

    // PG
    return answer === q.correct_answer;
}

// ------------------------------------------------------------
// SUBMIT
// ------------------------------------------------------------
async function submitStageAttempt() {
    const answeredCount = attemptQuestions.filter(q => isQuestionAnswered(q)).length;
    if (answeredCount < QUESTIONS_PER_STAGE) return;

    const btn = document.getElementById('submitQuizBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    const detailedAnswers = attemptQuestions.map(q => {
        const questionType = q.question_type || 'PG';
        const answer = attemptAnswers[q.id];
        const isCorrect = gradeQuestion(q);

        const detail = {
            question_id: q.id,
            question_type: questionType,
            question_text: q.question_text,
            selected_answer: answer,
            is_correct: isCorrect,
            explanation: q.explanation || null
        };

        if (questionType === 'PG') {
            detail.option_a = q.option_a;
            detail.option_b = q.option_b;
            detail.option_c = q.option_c;
            detail.option_d = q.option_d;
            detail.correct_answer = q.correct_answer;
        } else if (questionType === 'PGK MCMA') {
            detail.option_a = q.option_a;
            detail.option_b = q.option_b;
            detail.option_c = q.option_c;
            detail.option_d = q.option_d;
            detail.correct_answers = q.correct_answers;
        } else if (questionType === 'PGK Kategori') {
            detail.category_options = q.category_options;
            detail.category_mapping = q.category_mapping;
        }

        return detail;
    });

    const scoreCorrect = detailedAnswers.filter(a => a.is_correct).length;
    const isPassed = scoreCorrect >= PASSING_SCORE;

    try {
        const { error: attemptError } = await supabase.from('practice_attempts').insert({
            user_id: currentUserId,
            chapter: activeChapter,
            stage: activeStage,
            score_correct: scoreCorrect,
            total_questions: QUESTIONS_PER_STAGE,
            is_passed: isPassed,
            answers: detailedAnswers,
            started_at: attemptStartedAt,
            completed_at: new Date().toISOString()
        });
        if (attemptError) throw attemptError;

        const existing = progressData[activeChapter]?.[activeStage];
        const newBest = Math.max(existing?.best_score || 0, scoreCorrect);
        const newAttempts = (existing?.attempts_count || 0) + 1;
        const newStatus = isPassed ? 'passed' : (existing?.status === 'passed' ? 'passed' : 'unlocked');
        const newPassedAt = isPassed ? (existing?.passed_at || new Date().toISOString()) : (existing?.passed_at || null);

        const { error: progressError } = await supabase.from('practice_progress').upsert({
            user_id: currentUserId,
            chapter: activeChapter,
            stage: activeStage,
            status: newStatus,
            best_score: newBest,
            attempts_count: newAttempts,
            passed_at: newPassedAt
        }, { onConflict: 'user_id,chapter,stage' });
        if (progressError) throw progressError;

        if (!progressData[activeChapter]) progressData[activeChapter] = {};
        progressData[activeChapter][activeStage] = {
            chapter: activeChapter, stage: activeStage,
            status: newStatus, best_score: newBest, attempts_count: newAttempts, passed_at: newPassedAt
        };

        // Buka tahap berikutnya jika lulus dan bukan tahap terakhir
        if (isPassed && activeStage < 3) {
            const nextStage = activeStage + 1;
            const nextRec = progressData[activeChapter]?.[nextStage];
            if (!nextRec || nextRec.status === 'locked') {
                const { error: nextError } = await supabase.from('practice_progress').upsert({
                    user_id: currentUserId,
                    chapter: activeChapter,
                    stage: nextStage,
                    status: 'unlocked',
                    best_score: nextRec?.best_score || 0,
                    attempts_count: nextRec?.attempts_count || 0
                }, { onConflict: 'user_id,chapter,stage' });
                if (!nextError) {
                    progressData[activeChapter][nextStage] = {
                        chapter: activeChapter, stage: nextStage,
                        status: 'unlocked', best_score: nextRec?.best_score || 0, attempts_count: nextRec?.attempts_count || 0
                    };
                }
            }
        }

        lastResult = { chapter: activeChapter, stage: activeStage, scoreCorrect, isPassed, detailedAnswers };
        renderResult();
        showView('viewResult');

    } catch (err) {
        console.error('Gagal menyimpan hasil latihan:', err);
        alert('Terjadi kesalahan saat menyimpan hasil. Silakan coba lagi.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Kumpulkan Jawaban';
    }
}
window.submitStageAttempt = submitStageAttempt;

// ------------------------------------------------------------
// RESULT + PEMBAHASAN
// ------------------------------------------------------------
function renderResult() {
    const { chapter, stage, scoreCorrect, isPassed, detailedAnswers } = lastResult;

    const banner = document.getElementById('resultBanner');
    banner.className = `result-banner ${isPassed ? 'pass' : 'fail'}`;
    document.getElementById('resultIcon').className = isPassed ? 'fas fa-trophy' : 'fas fa-rotate-left';
    document.getElementById('resultTitle').textContent = isPassed
        ? `Selamat, kamu lulus Tahap ${stage}!`
        : `Belum berhasil di Tahap ${stage}`;
    document.getElementById('resultScoreText').textContent =
        `${chapter} — Skor kamu: ${scoreCorrect}/${QUESTIONS_PER_STAGE} (syarat lulus: ${PASSING_SCORE}/${QUESTIONS_PER_STAGE})`;

    document.getElementById('resultNextBtn').style.display = (isPassed && stage < 3) ? 'inline-flex' : 'none';

    const reviewList = document.getElementById('reviewList');
    reviewList.innerHTML = detailedAnswers.map((a, idx) => {
        const questionType = a.question_type || 'PG';

        if (questionType === 'PGK MCMA') {
            return renderMCMAReview(a, idx);
        } else if (questionType === 'PGK Kategori') {
            return renderKategoriReview(a, idx);
        } else {
            return renderPGReview(a, idx);
        }
    }).join('');
}

// PG Review
function renderPGReview(a, idx) {
    const selectedText = a[optionKey(a.selected_answer)] || '';
    const correctText = a[optionKey(a.correct_answer)] || '';

    return `
        <div class="review-item ${a.is_correct ? 'correct' : 'incorrect'}">
            <div class="review-item-head">
                <div class="review-item-question">Soal ${idx + 1}. ${formatRichText(a.question_text)}</div>
                <span class="review-badge">${a.is_correct ? 'Benar' : 'Salah'}</span>
            </div>
            <div class="review-item-answers">
                Jawabanmu: <strong>${a.selected_answer}. ${formatRichText(selectedText)}</strong>
                ${!a.is_correct ? ` &middot; Jawaban benar: <strong>${a.correct_answer}. ${formatRichText(correctText)}</strong>` : ''}
            </div>
            ${a.explanation ? `<div class="review-item-explanation"><i class="fas fa-lightbulb"></i> ${formatRichText(a.explanation)}</div>` : ''}
        </div>
    `;
}

// MCMA Review
function renderMCMAReview(a, idx) {
    const selectedArr = a.selected_answer ? (typeof a.selected_answer === 'string' ? a.selected_answer.split(',') : a.selected_answer) : [];
    const correctArr = a.correct_answers || [];

    const selectedLabels = selectedArr.map(l => `${l}. ${formatRichText(a[optionKey(l)] || '')}`).join(', ');
    const correctLabels = correctArr.map(l => `${l}. ${formatRichText(a[optionKey(l)] || '')}`).join(', ');

    return `
        <div class="review-item ${a.is_correct ? 'correct' : 'incorrect'}">
            <div class="review-item-head">
                <div class="review-item-question">Soal ${idx + 1}. <span class="review-type-tag">MCMA</span> ${formatRichText(a.question_text)}</div>
                <span class="review-badge">${a.is_correct ? 'Benar' : 'Salah'}</span>
            </div>
            <div class="review-item-answers">
                Jawabanmu: <strong>${selectedLabels || '-'}</strong>
                ${!a.is_correct ? ` &middot; Jawaban benar: <strong>${correctLabels}</strong>` : ''}
            </div>
            ${a.explanation ? `<div class="review-item-explanation"><i class="fas fa-lightbulb"></i> ${formatRichText(a.explanation)}</div>` : ''}
        </div>
    `;
}

// Kategori Review
function renderKategoriReview(a, idx) {
    let statements = [];
    try {
        statements = a.category_options || [];
        if (typeof statements === 'string') statements = JSON.parse(statements);
    } catch { statements = []; }

    let correctMapping = {};
    try {
        correctMapping = a.category_mapping || {};
        if (typeof correctMapping === 'string') correctMapping = JSON.parse(correctMapping);
    } catch { correctMapping = {}; }

    let selectedAnswers = {};
    try {
        selectedAnswers = a.selected_answer || {};
        if (typeof selectedAnswers === 'string') selectedAnswers = JSON.parse(selectedAnswers);
    } catch { selectedAnswers = {}; }

    const statementsHtml = statements.map((stmt, sIdx) => {
        const userVal = selectedAnswers[sIdx];
        const correctVal = correctMapping[String(sIdx)];
        const isRight = userVal === correctVal;
        return `<div class="review-kat-item ${isRight ? 'correct' : 'incorrect'}">
            <span class="review-kat-no">${sIdx + 1}.</span>
            <span class="review-kat-text">${formatRichText(typeof stmt === 'string' ? stmt : String(stmt || ''))}</span>
            <span class="review-kat-answer">Kamu: <strong>${userVal === true ? 'Benar' : (userVal === false ? 'Salah' : '-')}</strong></span>
            ${!isRight ? `<span class="review-kat-correct">Jawaban: <strong>${correctVal === true ? 'Benar' : 'Salah'}</strong></span>` : ''}
        </div>`;
    }).join('');

    return `
        <div class="review-item ${a.is_correct ? 'correct' : 'incorrect'}">
            <div class="review-item-head">
                <div class="review-item-question">Soal ${idx + 1}. <span class="review-type-tag">Kategori</span> ${formatRichText(a.question_text)}</div>
                <span class="review-badge">${a.is_correct ? 'Benar' : 'Salah'}</span>
            </div>
            <div class="review-kat-details">${statementsHtml}</div>
            ${a.explanation ? `<div class="review-item-explanation"><i class="fas fa-lightbulb"></i> ${formatRichText(a.explanation)}</div>` : ''}
        </div>
    `;
}

function optionKey(letter) {
    return { A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d' }[letter] || 'option_a';
}

function retryStage() {
    openPreStage(lastResult.chapter, lastResult.stage);
}
window.retryStage = retryStage;

function goToNextStage() {
    openPreStage(lastResult.chapter, lastResult.stage + 1);
}
window.goToNextStage = goToNextStage;

function backToLanding() {
    showView('viewLanding');
    initLanding();
}
window.backToLanding = backToLanding;

// ------------------------------------------------------------
// RIWAYAT
// ------------------------------------------------------------
async function openHistory(chapter) {
    activeChapter = chapter;
    document.getElementById('historyTitle').innerHTML = `<i class="fas fa-history"></i> Riwayat Percobaan — ${escapeHtml(chapter)}`;

    const list = document.getElementById('historyList');
    list.innerHTML = '<div class="latihan-loading"><i class="fas fa-spinner fa-spin"></i> Memuat riwayat...</div>';
    showView('viewHistory');

    const { data, error } = await supabase
        .from('practice_attempts')
        .select('stage, score_correct, total_questions, is_passed, completed_at')
        .eq('user_id', currentUserId)
        .eq('chapter', chapter)
        .order('completed_at', { ascending: false });

    if (error) {
        console.error('Gagal memuat riwayat:', error);
        list.innerHTML = '<div class="history-empty">Gagal memuat riwayat. Silakan coba lagi.</div>';
        return;
    }

    if (!data || data.length === 0) {
        list.innerHTML = '<div class="history-empty">Belum ada riwayat percobaan untuk topik ini.</div>';
        return;
    }

    list.innerHTML = data.map(row => `
        <div class="history-item ${row.is_passed ? 'pass' : 'fail'}">
            <div class="history-item-left">
                <span class="history-item-stage">Tahap ${row.stage}</span>
                <span class="history-item-date">${formatDateTime(row.completed_at)}</span>
            </div>
            <span class="history-item-score">${row.score_correct}/${row.total_questions} ${row.is_passed ? '· Lulus' : '· Belum lulus'}</span>
        </div>
    `).join('');
}
window.openHistory = openHistory;

// ------------------------------------------------------------
// UTIL
// ------------------------------------------------------------
function showView(viewId) {
    ['viewLanding', 'viewPreStage', 'viewQuiz', 'viewResult', 'viewHistory'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === viewId) ? 'block' : 'none';
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return String(str).replace(/'/g, "\\'");
}

// Escape lalu render newline + LaTeX (\( \) dan \[ \]) - identik dengan
// pola yang dipakai materi.js, tapi input di sini teks polos dari textarea
// admin (bukan HTML dari rich text editor) sehingga wajib di-escape dulu.
function formatRichText(raw) {
    let escaped = escapeHtml(raw).replace(/\n/g, '<br>');
    if (!window.katex) return escaped;

    let result = escaped;
    result = result.replace(/\\\\\(([^]*?)\\\\\)/g, (match, latex) => {
        try { return window.katex.renderToString(latex, { displayMode: false, throwOnError: false }); }
        catch (e) { return match; }
    });
    result = result.replace(/\\\\\[([^]*?)\\\\\]/g, (match, latex) => {
        try { return window.katex.renderToString(latex, { displayMode: true, throwOnError: false }); }
        catch (e) { return match; }
    });
    return result;
}

function formatDateTime(iso) {
    try {
        return new Date(iso).toLocaleString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return iso;
    }
}
