// ujian.js - Exam interface with 4 question types (A, B, C, D) and randomization
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';

// GATEKEEPER DIHAPUS: Siswa boleh mengerjakan ujian berkali-kali
async function checkEligibility(userId) {
    return true;
}

// Exam state
let currentQuestionIndex = 0;
let questions = [];
let answers = [];
let doubtfulQuestions = []; 
let examSessionId = null;
let timeRemaining = 0; 
let timerInterval = null;
let examStartTime = null;
let assignedQuestionType = null; 

// DOM Elements
let timerDisplay, progressFill, questionNav, questionCard, questionCounter;
let prevBtn, nextBtn;

// ============================================================
// MAIN LOGIC: JALANKAN SAAT HALAMAN DIMUAT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // 1. Siapkan Elemen HTML
        initializeDOMElements();

        // 2. Cek Login
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            window.location.href = 'index.html';
            return;
        }

        console.log('User authenticated:', result.user.email);

        // 3. GATEKEEPER: CEK APAKAH SUDAH PERNAH UJIAN
        const bolehUjian = await checkEligibility(result.user.id);
        
        if (!bolehUjian) {
            console.log("User diblokir karena sudah pernah ujian.");
            return; // STOP DI SINI.
        }

        // 4. Lanjut Proses Ujian
        await assignQuestionType(result.user.id); 
        await loadExamQuestions();                
        await startExamSession();                 

    } catch (error) {
        console.error('Error initializing exam:', error);
    }
});

// Initialize DOM elements
function initializeDOMElements() {
    timerDisplay = document.getElementById('timerDisplay');
    progressFill = document.getElementById('progressFill');
    questionNav = document.getElementById('questionNav');
    questionCard = document.getElementById('questionCard');
    questionCounter = document.getElementById('questionCounter');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');

    console.log('DOM elements initialized');
}

// Assign question type to user (A, B, C, or D)
async function assignQuestionType(userId) {
    try {
        console.log('Checking assigned question type for user:', userId);

        const { data: existingSession, error: sessionError } = await supabase
            .from('exam_sessions')
            .select('question_type_variant')
            .eq('user_id', userId)
            .eq('status', 'in_progress')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (existingSession && existingSession.question_type_variant) {
            assignedQuestionType = existingSession.question_type_variant;
            console.log('Retrieved existing question type:', assignedQuestionType);
            displayQuestionTypeInfo();
            return;
        }

        const { data: lastSession, error: lastError } = await supabase
            .from('exam_sessions')
            .select('question_type_variant')
            .eq('user_id', userId)
            .in('status', ['completed', 'expired'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const types = ['A', 'B', 'C', 'D'];
        const randomIndex = Math.floor(Math.random() * types.length);
        assignedQuestionType = types[randomIndex];

        console.log('Assigned new question type:', assignedQuestionType);
        displayQuestionTypeInfo();

    } catch (error) {
        console.error('Error in assignQuestionType:', error);
        assignedQuestionType = 'A';
        console.log('Defaulting to question type A due to error');
        displayQuestionTypeInfo();
    }
}

// Display question type information to user
function displayQuestionTypeInfo() {
    const examHeader = document.querySelector('.exam-header h1');
    if (examHeader) {
        const typeIndicator = document.createElement('span');
        typeIndicator.style.cssText = 'background: #3b82f6; color: white; padding: 0.25rem 0.75rem; border-radius: 0.5rem; font-size: 0.9rem; margin-left: 1rem;';
        typeIndicator.innerHTML = `<i class="fas fa-file-alt"></i> Tipe ${assignedQuestionType}`;
        examHeader.appendChild(typeIndicator);
    }
}

// Load mathematics questions for TKA based on assigned type
async function loadExamQuestions() {
    try {
        console.log('Loading exam questions for type:', assignedQuestionType);

        // First try with question_type_variant filter
        let { data: questionsData, error } = await supabase
            .from('questions')
            .select('*')
            .eq('subject', 'Matematika')
            .eq('question_type_variant', assignedQuestionType) 
            .eq('is_active', true)
            .order('created_at');

        // If no questions found with variant filter, try without it
        if (!questionsData || questionsData.length === 0) {
            console.log('No questions with variant filter, trying without it...');
            const { data: questionsData2, error: error2 } = await supabase
                .from('questions')
                .select('*')
                .eq('subject', 'Matematika')
                .eq('is_active', true)
                .order('created_at');
            
            if (error2) {
                console.error('Error loading questions:', error2);
                alert('Gagal memuat soal ujian: ' + error2.message);
                return;
            }
            questionsData = questionsData2;
        }

        if (error) {
            console.error('Error loading questions:', error);
        }

        if (!questionsData || questionsData.length === 0) {
            console.log('No questions found for type:', assignedQuestionType);
            alert(`Belum ada soal matematika yang tersedia. Silakan hubungi admin.`);
            window.location.href = 'halamanpertama.html';
            return;
        }

        questions = shuffleArray([...questionsData]);
        console.log(`Loaded and shuffled ${questions.length} questions of type ${assignedQuestionType}`);

        // Acak urutan opsi jawaban untuk soal PG dan PGK MCMA.
        // Dilakukan SEKALI di sini agar urutan tidak berubah saat render ulang.
        const SHUFFLE_TYPES = ['Pilihan Ganda', 'PG', 'PGK MCMA'];
        questions.forEach(question => {
            // Fallback ke 'Pilihan Ganda' jika question_type null/kosong
            const qType = question.question_type?.trim() || 'Pilihan Ganda';

            if (SHUFFLE_TYPES.includes(qType)) {
                // Kumpulkan hanya huruf opsi yang benar-benar terisi
                const available = ['A', 'B', 'C', 'D', 'E'].filter(opt => {
                    const val = question[`option_${opt.toLowerCase()}`];
                    return val && val.trim() !== '';
                });
                // Simpan urutan teracak ke properti baru di objek soal
                question.shuffled_options = shuffleArray([...available]);
            }
        });

        answers = new Array(questions.length).fill(null);
        doubtfulQuestions = new Array(questions.length).fill(false);

        const totalMinutes = questions.reduce((sum, q) => sum + (q.time_limit_minutes || 30), 0);
        timeRemaining = totalMinutes * 60; 

        console.log(`Total exam time: ${totalMinutes} minutes (${timeRemaining} seconds)`);

    } catch (error) {
        console.error('Error in loadExamQuestions:', error);
        alert('Terjadi kesalahan saat memuat soal: ' + error.message);
    }
}

// Start exam session
async function startExamSession() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            throw new Error('User not authenticated');
        }

        try {
            const { data: session, error } = await supabase
                .from('exam_sessions')
                .insert([{
                    user_id: result.user.id,
                    question_set_id: null,
                    question_type_variant: assignedQuestionType, 
                    total_time_seconds: timeRemaining,
                    status: 'in_progress'
                }])
                .select()
                .single();

            if (error) {
                console.error('Failed to create exam session:', error);
                throw new Error('Tidak dapat membuat sesi ujian. Pastikan database sudah dikonfigurasi dengan benar.');
            }

            if (!session) {
                throw new Error('Session ujian tidak dapat dibuat');
            }

            examSessionId = session.id;
            console.log('Exam session created:', examSessionId, 'Type:', assignedQuestionType);

        } catch (sessionError) {
            console.error('Error creating exam session:', sessionError);
            alert('Error: ' + sessionError.message);
            window.location.href = 'halamanpertama.html';
            return;
        }

        examStartTime = Date.now();
        startTimer();
        renderQuestionNav();
        setupNavigationListeners();
        await showQuestion(0);

        console.log('Exam session started successfully (Security features disabled)');

    } catch (error) {
        console.error('Error in startExamSession:', error);
        throw error;
    }
}

// Start countdown timer
function startTimer() {
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeRemaining--;

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
            return;
        }

        updateTimerDisplay();

        if (timeRemaining <= 300) { 
            timerDisplay.classList.add('timer-warning');
        }

    }, 1000);
}

// Update timer display
function updateTimerDisplay() {
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    const seconds = timeRemaining % 60;

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    timerDisplay.textContent = timeString;
}

// Handle time up - auto submit
async function handleTimeUp() {
    alert('Waktu ujian telah habis! Jawaban Anda akan disimpan secara otomatis.');
    await saveCurrentAnswer();
    await completeExam(true); 
    showExamExpired();
}

// Render question navigation
function renderQuestionNav() {
    questionNav.innerHTML = '';

    questions.forEach((_, index) => {
        const navBtn = document.createElement('button');
        navBtn.className = `question-nav-btn ${index === currentQuestionIndex ? 'current' : ''} ${answers[index] ? 'answered' : ''} ${doubtfulQuestions[index] ? 'doubtful' : ''}`;
        navBtn.textContent = index + 1;
        // Allow clicking on any question number to navigate (no restrictions)
        navBtn.onclick = async () => {
            console.log('Navigating to question:', index);
            await showQuestion(index);
        };
        questionNav.appendChild(navBtn);
    });
}

// Helper: render LaTeX \(...\) dan \[...\] pada string
function renderLatexString(content) {
    if (!content || !window.katex) return content;
    let result = content;

    // Inline \(...\)
    result = result.replace(/\\\(([^]*?)\\\)/g, (match, latex) => {
        try {
            return window.katex.renderToString(latex, { displayMode: false, throwOnError: false });
        } catch (e) { return match; }
    });

    // Display mode \[...\]
    result = result.replace(/\\\[([^]*?)\\\]/g, (match, latex) => {
        try {
            return window.katex.renderToString(latex, { displayMode: true, throwOnError: false });
        } catch (e) { return match; }
    });

    return result;
}

async function showQuestion(index) {
    if (currentQuestionIndex !== index) {
        await saveCurrentAnswer();
    }

    currentQuestionIndex = index;
    const question = questions[index];
    
    // Track question start time for real-time monitoring
    window.questionStartTime = Date.now();

    questionCounter.textContent = `Soal ${index + 1} dari ${questions.length}`;

    const answeredCount = answers.filter(a => a !== null).length;
    const progress = (answeredCount / questions.length) * 100;
    progressFill.style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;

    // Pre-process: newline → <br>, LaTeX → KaTeX HTML
    const processedQuestionText = renderLatexString(
        (question.question_text || '').replace(/\n/g, '<br>')
    );

    let questionHTML = `
        <div class="question-header">
            <div class="question-number">
                <i class="fas fa-question-circle"></i>
                Soal ${index + 1}
            </div>
            <div class="question-type-badge">
                <i class="fas fa-file-alt"></i> Tipe ${assignedQuestionType}
            </div>
        </div>

        <div class="question-info-table">
            <table>
                <tr>
                    <td class="info-label">Elemen</td>
                    <td class="info-sep">:</td>
                    <td class="info-value">${question.chapter || '-'}</td>
                </tr>
                <tr>
                    <td class="info-label">Sub-elemen</td>
                    <td class="info-sep">:</td>
                    <td class="info-value">${question.sub_chapter || '-'}</td>
                </tr>
                <tr>
                    <td class="info-label">Level Kognitif</td>
                    <td class="info-sep">:</td>
                    <td class="info-value">${question.level_kognitif || '-'}</td>
                </tr>
                <tr>
                    <td class="info-label">Proses Berpikir</td>
                    <td class="info-sep">:</td>
                    <td class="info-value">${question.proses_berpikir || '-'}</td>
                </tr>
                ${question.competence ? `
                <tr>
                    <td class="info-label">Kompetensi Dasar</td>
                    <td class="info-sep">:</td>
                    <td class="info-value">${question.competence}</td>
                </tr>` : ''}
            </table>
        </div>
        
        <div class="question-text">
            ${processedQuestionText}
        </div>
    `;

    if (question.image_url) {
        questionHTML += `
            <div class="question-image">
                <img src="${question.image_url}" alt="Question Image" style="max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0;">
            </div>
        `;
    }

    // Render options based on question type
    const questionType = question.question_type || 'Pilihan Ganda';
    console.log('Rendering question type:', questionType);
    
    switch (questionType) {
        case 'PGK MCMA':
            questionHTML += renderMCMAOptions(question, index);
            break;
            
        case 'PGK Kategori':
            questionHTML += renderCategoryOptions(question, index);
            break;
            
        case 'PG':
        case 'Pilihan Ganda':
        default:
            questionHTML += renderMultipleChoiceOptions(question, index);
            break;
    }

    const isDoubtful = doubtfulQuestions[index];
    questionHTML += `
        <div class="question-actions">
            <button onclick="toggleDoubt()" class="doubt-btn ${isDoubtful ? 'active' : ''}">
                <i class="fas fa-flag"></i>
                ${isDoubtful ? 'Tandai Ragu' : 'Ragu-ragu'}
            </button>
        </div>
    `;

    questionCard.innerHTML = questionHTML;

    // Enable both navigation buttons - allow free navigation
    prevBtn.disabled = false;
    nextBtn.disabled = false;

    if (index === questions.length - 1) {
        nextBtn.innerHTML = '<i class="fas fa-check-circle"></i> Selesai';
        nextBtn.onclick = async () => await confirmSubmit();
    } else {
        nextBtn.innerHTML = 'Selanjutnya <i class="fas fa-chevron-right"></i>';
        nextBtn.onclick = async () => await showQuestion(index + 1);
    }

    renderQuestionNav();

    if (window.renderMathInElement) {
        setTimeout(() => {
            try {
                renderMathInElement(questionCard, {
                    delimiters: [
                        {left: "$$", right: "$$", display: true},
                        {left: "\\[", right: "\\]", display: true},
                        {left: "$", right: "$", display: false}
                    ],
                    throwOnError: false,
                    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'span']
                });
            } catch(e) { /* ignore */ }
        }, 50);
    }
}

// ============================================================
// RIPPLE EFFECT — adds a subtle click animation on option cards
// ============================================================
function addRipple(event, element) {
    const existing = element.querySelector('.option-ripple');
    if (existing) existing.remove();

    const ripple = document.createElement('span');
    ripple.className = 'option-ripple';

    const rect = element.getBoundingClientRect();
    const size = 60;
    // Use clientX/Y from mouse events; for keyboard fall back to element center
    const x = (event.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (event.clientY || rect.top + rect.height / 2) - rect.top - size / 2;

    ripple.style.left = `${x}px`;
    ripple.style.top  = `${y}px`;
    element.appendChild(ripple);

    ripple.addEventListener('animationend', () => ripple.remove());
}

// Render multiple choice options (Single Choice / Radio)
function renderMultipleChoiceOptions(question, questionIndex) {
    // Gunakan shuffled_options jika sudah digenerate di loadExamQuestions,
    // fallback ke urutan default jika tidak ada (keamanan).
    const options = question.shuffled_options || ['A', 'B', 'C', 'D', 'E'].filter(opt => {
        const optKey = `option_${opt.toLowerCase()}`;
        return question[optKey] && question[optKey].trim() !== '';
    });

    if (!options || options.length === 0) {
        return '<div class="error-message">Data opsi tidak tersedia. Silakan hubungi admin.</div>';
    }

    const currentAnswer = answers[questionIndex];
    let html = '<div class="options">';

    // Label visual selalu A, B, C, D, E berurutan (standar CBT)
    // variabel 'option' tetap berisi huruf asli untuk sistem penilaian
    const displayLabels = ['A', 'B', 'C', 'D', 'E'];

    options.forEach((option, index) => {
        const displayLabel = displayLabels[index];
        const rawOptionText = question[`option_${option.toLowerCase()}`] || '';
        const optionText = renderLatexString(rawOptionText.replace(/\n/g, '<br>'));
        const isSelected = currentAnswer === option;

        html += `
            <div class="option ${isSelected ? 'selected' : ''}"
                 role="radio"
                 aria-checked="${isSelected}"
                 tabindex="0"
                 onclick="selectAnswer('${option}'); addRipple(event, this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){selectAnswer('${option}');addRipple(event,this);}">
                <span class="option-letter">${displayLabel}</span>
                <span class="option-text">${optionText}</span>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

// Render MCMA (Multiple Choice Multiple Answer) options
function renderMCMAOptions(question, questionIndex) {
    // Gunakan shuffled_options jika sudah digenerate di loadExamQuestions,
    // fallback ke urutan default jika tidak ada (keamanan).
    const options = question.shuffled_options || ['A', 'B', 'C', 'D', 'E'].filter(opt => question[`option_${opt.toLowerCase()}`]);

    if (!options || options.length === 0) {
        return '<div class="error-message">Data opsi tidak tersedia. Silakan hubungi admin.</div>';
    }

    let selectedOptions = [];
    try {
        const currentAnswer = answers[questionIndex];
        selectedOptions = currentAnswer ? currentAnswer.split(',') : [];
    } catch (e) {
        selectedOptions = [];
    }

    let html = '<div class="mcma-instruction"><i class="fas fa-info-circle"></i> Pilih satu atau lebih jawaban yang benar</div>';
    html += '<div class="options mcma-options">';

    // Label visual selalu A, B, C, D, E berurutan (standar CBT)
    // variabel 'option' tetap berisi huruf asli untuk sistem penilaian
    const displayLabels = ['A', 'B', 'C', 'D', 'E'];

    options.forEach((option, index) => {
        const displayLabel = displayLabels[index];
        const rawOptionText = question[`option_${option.toLowerCase()}`] || '';
        const optionText = renderLatexString(rawOptionText.replace(/\n/g, '<br>'));
        const isSelected = selectedOptions.includes(option);

        html += `
            <div class="option mcma-option ${isSelected ? 'selected' : ''}"
                 role="checkbox"
                 aria-checked="${isSelected}"
                 tabindex="0"
                 onclick="toggleMCMA('${option}'); addRipple(event, this)"
                 onkeydown="if(event.key==='Enter'||event.key===' '){toggleMCMA('${option}');addRipple(event,this);}">
                <span class="mcma-checkbox ${isSelected ? 'checked' : ''}">
                    <i class="fas fa-check"></i>
                </span>
                <span class="option-letter">${displayLabel}</span>
                <span class="option-text">${optionText}</span>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

// Render category options
function renderCategoryOptions(question, questionIndex) {
    let statements = [];
    try {
        const rawOptions = question.category_options || question.category_statements;
        if (!rawOptions) {
            statements = [];
        } else if (Array.isArray(rawOptions)) {
            statements = rawOptions;
        } else if (typeof rawOptions === 'string') {
            statements = JSON.parse(rawOptions);
        } else {
            statements = [];
        }
    } catch (e) {
        statements = [];
    }
    
    if (!statements || statements.length === 0) {
        return '<div class="error-message">Data kategori tidak tersedia. Silakan hubungi admin.</div>';
    }
    
    let currentAnswer = null;
    let selectedAnswers = {};
    try {
        currentAnswer = answers[questionIndex];
        selectedAnswers = currentAnswer ? (typeof currentAnswer === 'string' ? JSON.parse(currentAnswer) : currentAnswer) : {};
    } catch (e) {
        selectedAnswers = {};
    }

    const answeredCount = Object.keys(selectedAnswers).length;
    const totalCount = statements.length;

    let html = `
        <div class="pgk-kategori-wrapper">
            <div class="pgk-kategori-header">
                <div class="pgk-header-left">
                    <i class="fas fa-table"></i>
                    <span>Soal PGK Kategori</span>
                </div>
                <div class="pgk-header-right">
                    <div class="pgk-progress-pill">
                        <span id="pgk-answered-count">${answeredCount}</span>/<span>${totalCount}</span> dijawab
                    </div>
                </div>
            </div>
            <p class="pgk-instruction">
                <i class="fas fa-info-circle"></i>
                Tentukan nilai kebenaran setiap pernyataan berikut dengan memilih <strong>Benar</strong> atau <strong>Salah</strong>.
            </p>
            <div class="pgk-table-container">
                <table class="pgk-table">
                    <thead>
                        <tr>
                            <th class="pgk-th-no">No.</th>
                            <th class="pgk-th-statement">Pernyataan</th>
                            <th class="pgk-th-benar">Benar</th>
                            <th class="pgk-th-salah">Salah</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    statements.forEach((statement, idx) => {
        const isTrue  = selectedAnswers[idx] === true;
        const isFalse = selectedAnswers[idx] === false;
        const isAnswered = isTrue || isFalse;

        const displayStatement = renderLatexString(
            typeof statement === 'string' ? statement.replace(/\n/g, '<br>') : String(statement || '')
        );

        const rowClass = isAnswered
            ? (isTrue ? 'pgk-row pgk-row-benar' : 'pgk-row pgk-row-salah')
            : 'pgk-row';

        html += `
            <tr class="${rowClass}" id="pgk-row-${idx}">
                <td class="pgk-td-no">
                    <span class="pgk-no-badge">${idx + 1}</span>
                </td>
                <td class="pgk-td-statement">${displayStatement}</td>
                <td class="pgk-td-choice">
                    <button 
                        class="pgk-choice-btn pgk-btn-benar ${isTrue ? 'active' : ''}"
                        onclick="selectCategoryAnswer(${idx}, true)"
                        title="Benar"
                    >
                        <span class="pgk-radio-ring ${isTrue ? 'filled' : ''}"></span>
                        <i class="fas fa-check"></i>
                        <span class="pgk-btn-label">Benar</span>
                    </button>
                </td>
                <td class="pgk-td-choice">
                    <button 
                        class="pgk-choice-btn pgk-btn-salah ${isFalse ? 'active' : ''}"
                        onclick="selectCategoryAnswer(${idx}, false)"
                        title="Salah"
                    >
                        <span class="pgk-radio-ring ${isFalse ? 'filled' : ''}"></span>
                        <i class="fas fa-times"></i>
                        <span class="pgk-btn-label">Salah</span>
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    return html;
}

function checkKategoriAnswer(answer, question) {
    try {
        const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
        if (!selectedAnswers || Object.keys(selectedAnswers).length === 0) return false;

        let statements = question.category_options || question.category_statements || [];
        if (!Array.isArray(statements)) {
            statements = typeof statements === 'string' ? JSON.parse(statements) : [];
        }

        let correctMapping = question.category_mapping || {};
        if (typeof correctMapping === 'string') {
            correctMapping = JSON.parse(correctMapping);
        }

        if (!correctMapping || Object.keys(correctMapping).length === 0) return false;

        const indexCorrectMap = {};
        statements.forEach((stmt, idx) => {
            const stmtTrimmed = typeof stmt === 'string' ? stmt.trim() : stmt;
            if (correctMapping.hasOwnProperty(stmtTrimmed)) {
                indexCorrectMap[idx] = correctMapping[stmtTrimmed];
            } else {
                if (correctMapping.hasOwnProperty(String(idx))) {
                    indexCorrectMap[idx] = correctMapping[String(idx)];
                }
            }
        });

        for (let idx = 0; idx < statements.length; idx++) {
            const selected = selectedAnswers[idx];
            const correct = indexCorrectMap[idx];
            if (correct === undefined) continue; 
            if (selected !== correct) return false;
        }

        for (const [idxStr, shouldBeTrue] of Object.entries(indexCorrectMap)) {
            if (shouldBeTrue && selectedAnswers[parseInt(idxStr)] !== true) return false;
        }

        return true;
    } catch (e) {
        return false;
    }
}

// Select answer for regular multiple choice
function selectAnswer(option) {
    answers[currentQuestionIndex] = option;
    showQuestion(currentQuestionIndex); 
}

// Toggle MCMA option
function toggleMCMA(option) {
    const currentAnswer = answers[currentQuestionIndex];
    let selectedOptions = currentAnswer ? currentAnswer.split(',') : [];
    
    if (selectedOptions.includes(option)) {
        selectedOptions = selectedOptions.filter(opt => opt !== option);
    } else {
        selectedOptions.push(option);
    }
    
    answers[currentQuestionIndex] = selectedOptions.length > 0 ? selectedOptions.join(',') : null;
    showQuestion(currentQuestionIndex); 
}

// Select category answer
function selectCategoryAnswer(statementIndex, value) {
    const currentAnswer = answers[currentQuestionIndex];
    const selectedAnswers = currentAnswer
        ? (typeof currentAnswer === 'string' ? JSON.parse(currentAnswer) : { ...currentAnswer })
        : {};

    selectedAnswers[statementIndex] = value;
    answers[currentQuestionIndex] = selectedAnswers;

    const row = document.getElementById(`pgk-row-${statementIndex}`);
    if (row) {
        row.className = value ? 'pgk-row pgk-row-benar' : 'pgk-row pgk-row-salah';

        const btnBenar = row.querySelector('.pgk-btn-benar');
        const ringBenar = btnBenar?.querySelector('.pgk-radio-ring');
        if (btnBenar) { btnBenar.classList.toggle('active', value === true); }
        if (ringBenar) { ringBenar.classList.toggle('filled', value === true); }

        const btnSalah = row.querySelector('.pgk-btn-salah');
        const ringSalah = btnSalah?.querySelector('.pgk-radio-ring');
        if (btnSalah) { btnSalah.classList.toggle('active', value === false); }
        if (ringSalah) { ringSalah.classList.toggle('filled', value === false); }
    }

    const counterEl = document.getElementById('pgk-answered-count');
    if (counterEl) {
        counterEl.textContent = Object.keys(selectedAnswers).length;
    }

    const answeredCount = answers.filter(a => a !== null).length;
    const progress = (answeredCount / questions.length) * 100;
    if (progressFill) progressFill.style.width = `${progress}%`;
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = `${Math.round(progress)}%`;

    renderQuestionNav();
}

// Save current answer to database
async function saveCurrentAnswer() {
    try {
        const answer = answers[currentQuestionIndex];
        if (answer === null || answer === undefined) return;
        const question = questions[currentQuestionIndex];
        if (!question || !question.id) return;
        await saveOneAnswer(currentQuestionIndex, question, answer);
        window.questionStartTime = Date.now();
    } catch (error) {
        console.error('Error in saveCurrentAnswer:', error);
    }
}

// Simpan satu jawaban
async function saveOneAnswer(index, question, answer) {
    try {
        let answerValue = answer;
        if (question.question_type === 'PGK Kategori') {
            answerValue = typeof answer === 'object' ? JSON.stringify(answer) : answer;
        }
        const timeTaken = window.questionStartTime
            ? Math.floor((Date.now() - window.questionStartTime) / 1000) : 0;

        let isCorrect = false;
        if (question.question_type === 'PGK MCMA') {
            const sel = (answerValue || '').split(',').sort();
            const cor = Array.isArray(question.correct_answers)
                ? [...question.correct_answers].sort()
                : (question.correct_answers || '').split(',').sort();
            isCorrect = JSON.stringify(sel) === JSON.stringify(cor);
        } else if (question.question_type === 'PGK Kategori') {
            isCorrect = checkKategoriAnswer(answer, question);
        } else {
            isCorrect = answerValue === question.correct_answer;
        }

        const payload = {
            exam_session_id: examSessionId,
            question_id: question.id,
            selected_answer: answerValue,
            user_answer: answerValue,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken,
            is_doubtful: doubtfulQuestions[index] || false,
            answered_at: new Date().toISOString()
        };

        const { data: existing, error: selectError } = await supabase
            .from('exam_answers')
            .select('id')
            .eq('exam_session_id', examSessionId)
            .eq('question_id', question.id)
            .maybeSingle();

        if (existing && existing.id) {
            await supabase.from('exam_answers').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('exam_answers').insert([payload]);
        }
    } catch (error) {
        console.error('[saveOneAnswer] Exception soal ' + (index+1) + ':', error);
    }
}

// Simpan SEMUA jawaban ke database (dipanggil saat ujian selesai)
async function saveAllAnswers() {
    console.log('[saveAllAnswers] Mulai menyimpan semua jawaban...');

    if (!examSessionId) return;

    const payload = [];
    for (let i = 0; i < questions.length; i++) {
        const answer = answers[i];
        if (answer === null || answer === undefined) continue;
        const question = questions[i];
        if (!question || !question.id) continue;

        let answerValue = answer;
        if (question.question_type === 'PGK Kategori') {
            answerValue = typeof answer === 'object' ? JSON.stringify(answer) : answer;
        }

        let isCorrect = false;
        if (question.question_type === 'PGK MCMA') {
            const sel = (answerValue || '').split(',').sort();
            const cor = Array.isArray(question.correct_answers)
                ? [...question.correct_answers].sort()
                : (question.correct_answers || '').split(',').sort();
            isCorrect = JSON.stringify(sel) === JSON.stringify(cor);
        } else if (question.question_type === 'PGK Kategori') {
            isCorrect = checkKategoriAnswer(answer, question);
        } else {
            isCorrect = answerValue === question.correct_answer;
        }

        payload.push({
            exam_session_id: examSessionId,
            question_id: question.id,
            selected_answer: answerValue,
            user_answer: answerValue,
            is_correct: isCorrect,
            time_taken_seconds: 0,
            is_doubtful: doubtfulQuestions[i] || false,
            answered_at: new Date().toISOString()
        });
    }

    if (payload.length === 0) return;

    const testRecord = payload[0];
    const { error: testError } = await supabase.from('exam_answers').insert([testRecord]).select('id');

    if (testError) {
        alert('Gagal menyimpan jawaban: ' + testError.message);
        return;
    }

    const remaining = payload.slice(1);
    const chunkSize = 50;

    for (let i = 0; i < remaining.length; i += chunkSize) {
        const chunk = remaining.slice(i, i + chunkSize);
        await supabase.from('exam_answers').insert(chunk);
    }
}

// Setup navigation listeners
function setupNavigationListeners() {
    prevBtn.onclick = async () => {
        if (currentQuestionIndex > 0) {
            await showQuestion(currentQuestionIndex - 1);
        }
    };

    nextBtn.onclick = async () => {
        if (currentQuestionIndex < questions.length - 1) {
            await showQuestion(currentQuestionIndex + 1);
        } else {
            await confirmSubmit();
        }
    };

    const navToggleBtn = document.getElementById('navToggleBtn');
    if (navToggleBtn) {
        navToggleBtn.onclick = () => {
            document.querySelector('.question-navigation-section').classList.toggle('show');
        };
    }
}

// Confirm submit
async function confirmSubmit() {
    const answeredCount = answers.filter(a => a !== null).length;
    const unansweredCount = questions.length - answeredCount;
    
    let message = `Anda akan menyelesaikan ujian.\n\n`;
    message += `Soal dijawab: ${answeredCount}/${questions.length}\n`;
    
    if (unansweredCount > 0) {
        message += `Soal belum dijawab: ${unansweredCount}\n\n`;
        message += `Anda yakin ingin menyelesaikan ujian?`;
    } else {
        message += `\nSemua soal sudah dijawab. Lanjutkan submit?`;
    }

    if (confirm(message)) {
        await saveCurrentAnswer();
        await completeExam(false);
        showExamCompleted();
    }
}

// Complete exam and calculate score
async function completeExam(isExpired = false) {
    try {
        clearInterval(timerInterval);
        await saveAllAnswers();

        const totalTime = Math.floor((Date.now() - examStartTime) / 1000);
        let correctCount = 0;
        
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = answers[i];

            if (answer !== null) {
                let isCorrect = false;

                if (question.question_type === 'PGK MCMA') {
                    const selectedAnswers = answer.split(',').sort();
                    const correctAnswers = Array.isArray(question.correct_answers)
                        ? question.correct_answers.sort()
                        : (question.correct_answers || '').split(',').sort();
                    isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
                } else if (question.question_type === 'PGK Kategori') {
                    isCorrect = checkKategoriAnswer(answer, question);
                } else {
                    isCorrect = answer === question.correct_answer;
                }

                if (isCorrect) correctCount++;
            }
        }

        const totalScore = Math.round((correctCount / questions.length) * 100);

        await supabase
            .from('exam_sessions')
            .update({
                completed_at: new Date().toISOString(),
                total_time_seconds: totalTime,
                total_score: totalScore,
                status: isExpired ? 'expired' : 'completed',
                is_passed: totalScore >= 70
            })
            .eq('id', examSessionId);

        await updateStudentAnalyticsAfterExam();

    } catch (error) {
        console.error('Error completing exam:', error);
    }
}

// Show exam completed screen
function showExamCompleted() {
    clearInterval(timerInterval);
    if (!examSessionId) {
        window.location.href = 'halamanpertama.html';
        return;
    }
    window.location.href = `habisujian.html?session=${examSessionId}`;
}

// Show exam expired screen
function showExamExpired() {
    clearInterval(timerInterval);
    if (!examSessionId) {
        window.location.href = 'halamanpertama.html';
        return;
    }
    window.location.href = `habisujian.html?session=${examSessionId}`;
}

// Update student analytics after exam completion
async function updateStudentAnalyticsAfterExam() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) return;

        const userId = result.user.id;
        let totalCorrect = 0;
        const chapterPerformance = {};

        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = answers[i];

            if (!answer) continue;

            let isCorrect = false;

            if (question.question_type === 'PGK MCMA') {
                const selectedAnswers = answer.split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
            } else if (question.question_type === 'PGK Kategori') {
                isCorrect = checkKategoriAnswer(answer, question);
            } else {
                isCorrect = answer === question.correct_answer;
            }

            if (isCorrect) totalCorrect++;

            const chapter = question.chapter;
            if (chapter) {
                if (!chapterPerformance[chapter]) {
                    chapterPerformance[chapter] = { total: 0, correct: 0 };
                }
                chapterPerformance[chapter].total++;
                if (isCorrect) chapterPerformance[chapter].correct++;
            }
        }

        const masteryLevel = questions.length > 0 ? totalCorrect / questions.length : 0;

        const skillRadarData = Object.keys(chapterPerformance).map(chapter => ({
            skill: chapter,
            level: Math.round((chapterPerformance[chapter].correct / chapterPerformance[chapter].total) * 100)
        }));

        await supabase
            .from('student_analytics')
            .upsert({
                user_id: userId,
                chapter: 'Overall',
                sub_chapter: `Exam Type ${assignedQuestionType}`,
                total_questions_attempted: questions.length,
                correct_answers: totalCorrect,
                mastery_level: masteryLevel,
                skill_radar_data: skillRadarData,
                last_updated: new Date().toISOString()
            });

    } catch (error) {
        console.error('Error updating student analytics:', error);
    }
}

// Toggle doubt status for current question
async function toggleDoubt() {
    doubtfulQuestions[currentQuestionIndex] = !doubtfulQuestions[currentQuestionIndex];
    await showQuestion(currentQuestionIndex); 
    renderQuestionNav(); 
}

// Fisher-Yates Shuffle Algorithm
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Export functions for global access
window.selectAnswer = selectAnswer;
window.toggleMCMA = toggleMCMA;
window.selectCategoryAnswer = selectCategoryAnswer;
window.toggleDoubt = toggleDoubt;