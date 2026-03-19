// ujian.js - Exam interface with 4 question types (A, B, C, D) and randomization
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';

// ============================================================
// FITUR: CEK APAKAH SUDAH PERNAH UJIAN (GATEKEEPER)
// ============================================================
async function checkEligibility(userId) {
    try {
        console.log("Memeriksa riwayat ujian user:", userId);

        // 1. Cek ke tabel 'exam_sessions'
        const { data, error } = await supabase
            .from('exam_sessions') 
            .select('id, total_score, created_at, status') 
            .eq('user_id', userId)
            .eq('status', 'completed') 
            .limit(1);

        if (error) throw error;

        // 2. JIKA DATA DITEMUKAN (Artinya sudah pernah mengerjakan)
        if (data && data.length > 0) {
            
            const lastScore = data[0].total_score; 
            const examDate = new Date(data[0].created_at).toLocaleDateString('id-ID');

            // 3. Tampilkan Layar Blokir
            document.body.innerHTML = `
                <div style="
                    display: flex; 
                    flex-direction: column;
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                    color: white;
                    font-family: 'Poppins', sans-serif;
                    text-align: center;
                    padding: 20px;
                ">
                    <i class="fas fa-check-circle" style="font-size: 5rem; color: #10b981; margin-bottom: 20px;"></i>
                    <h1 style="font-size: 2rem; margin-bottom: 10px;">Ujian Telah Selesai</h1>
                    <p style="font-size: 1.1rem; color: #9ca3af; max-width: 500px; line-height: 1.6;">
                        Anda sudah menyelesaikan ujian ini sebelumnya.<br>
                        Kesempatan mengerjakan hanya diberikan 1 kali.
                    </p>
                    
                    <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 15px; border: 1px solid rgba(255,255,255,0.1); min-width: 250px;">
                        <p style="margin:0; font-size: 0.9rem; color: #9ca3af;">Nilai Anda</p>
                        <p style="margin:5px 0 15px 0; font-size: 2.5rem; font-weight: 700; color: #f59e0b;">${lastScore}</p>
                        <div style="height: 1px; background: rgba(255,255,255,0.1); margin-bottom: 15px;"></div>
                        <p style="margin:0; font-size: 0.8rem; color: #6b7280;">Tanggal: ${examDate}</p>
                    </div>

                    <div style="margin-top: 40px;">
                        <a href="halamanpertama.html" style="
                            padding: 15px 40px;
                            background: #4f46e5;
                            color: white;
                            text-decoration: none;
                            border-radius: 50px;
                            font-weight: 600;
                            font-size: 1rem;
                            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);
                            transition: transform 0.2s;
                            display: inline-block;
                        ">
                            <i class="fas fa-home"></i> Kembali ke Menu Utama
                        </a>
                    </div>
                </div>
            `;
            
            return false; // Stop ujian
        }

        return true; // Boleh lanjut ujian

    } catch (error) {
        console.error("Gagal cek eligibility:", error);
        return false;
    }
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
        
        // Debug: Show question types in loaded questions
        const questionTypes = {};
        questions.forEach(q => {
            const type = q.question_type || 'unknown';
            questionTypes[type] = (questionTypes[type] || 0) + 1;
        });
        console.log('Question types loaded:', questionTypes);
        
        // Debug: Show sample question fields for first question
        if (questions.length > 0) {
            console.log('Sample question fields:', Object.keys(questions[0]));
            console.log('First question type:', questions[0].question_type);
            console.log('First question category_statements:', questions[0].category_statements);
        }

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

        // Initialize security features
        initializeSecurityFeatures();

        console.log('Exam session started successfully');

    } catch (error) {
        console.error('Error in startExamSession:', error);
        throw error;
    }
}

// ============================================================
// FITUR KEAMANAN UJIAN
// ============================================================

// Tab switch detection variables
let tabSwitchCount = 0;
const maxTabSwitches = 3;
let tabSwitchWarningShown = false;

/**
 * Initialize all security features for the exam
 */
function initializeSecurityFeatures() {
    // 1. Tab Switch Detection
    setupTabSwitchDetection();
    
    // 2. Right-click Disable
    disableRightClick();
    
    // 3. Browser Back Button Warning
    setupBackButtonWarning();
    
    // 4. Disable keyboard shortcuts
    disableKeyboardShortcuts();
    
    // 5. Prevent copy-paste
    preventCopyPaste();
    
    console.log('Security features initialized');
}

/**
 * 1. Tab Switch Detection
 * Detects when student switches to another tab or window
 */
function setupTabSwitchDetection() {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    
    console.log('Tab switch detection enabled');
}

function handleVisibilityChange() {
    if (document.hidden) {
        tabSwitchCount++;
        console.log('Tab switch detected. Count:', tabSwitchCount);
        
        // Show warning
        showTabSwitchWarning();
        
        // If exceeded max switches, auto-submit exam
        if (tabSwitchCount >= maxTabSwitches) {
            handleExamViolation('Tab switch limit exceeded');
        }
    }
}

function handleWindowBlur() {
    tabSwitchCount++;
    console.log('Window blur detected. Count:', tabSwitchCount);
    
    showTabSwitchWarning();
    
    if (tabSwitchCount >= maxTabSwitches) {
        handleExamViolation('Window switch limit exceeded');
    }
}

function showTabSwitchWarning() {
    if (tabSwitchWarningShown) return;
    
    const remainingSwitches = maxTabSwitches - tabSwitchCount;
    
    if (remainingSwitches > 0) {
        // Create warning modal
        const warningModal = document.createElement('div');
        warningModal.id = 'tabSwitchWarningModal';
        warningModal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            font-family: 'Poppins', sans-serif;
        `;
        
        warningModal.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
                padding: 40px;
                border-radius: 20px;
                text-align: center;
                max-width: 500px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
            ">
                <i class="fas fa-exclamation-triangle" style="font-size: 4rem; color: #fbbf24; margin-bottom: 20px;"></i>
                <h2 style="color: white; margin-bottom: 15px; font-size: 1.5rem;">⚠️ PERINGATAN!</h2>
                <p style="color: #fecaca; font-size: 1rem; line-height: 1.6; margin-bottom: 20px;">
                    Terdeteksi Anda berpindah tab/window!<br>
                    <strong>Sisa kesempatan: ${remainingSwitches} kali</strong>
                </p>
                <p style="color: #fbbf24; font-size: 0.9rem;">
                    Jika berpindah tab ${remainingSwitches} kali lagi, ujian akan diakhiri otomatis.
                </p>
                <button onclick="document.getElementById('tabSwitchWarningModal').remove()" style="
                    margin-top: 25px;
                    padding: 12px 40px;
                    background: white;
                    color: #dc2626;
                    border: none;
                    border-radius: 50px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                ">
                    Mengerti, Lanjutkan Ujian
                </button>
            </div>
        `;
        
        document.body.appendChild(warningModal);
        tabSwitchWarningShown = true;
        
        // Auto-close after 5 seconds
        setTimeout(() => {
            const modal = document.getElementById('tabSwitchWarningModal');
            if (modal) modal.remove();
            tabSwitchWarningShown = false;
        }, 5000);
    }
}

/**
 * 2. Disable Right-Click Context Menu
 */
function disableRightClick() {
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        showSecurityNotification('Klik kanan dinonaktifkan selama ujian');
        return false;
    });
    
    console.log('Right-click disabled');
}

/**
 * 3. Browser Back Button Warning
 */
function setupBackButtonWarning() {
    // Push a state to history
    history.pushState({ exam: 'in_progress' }, '', location.href);
    
    // Listen for popstate event (back button)
    window.addEventListener('popstate', function(e) {
        e.preventDefault();
        
        // Show confirmation
        const confirmLeave = confirm(
            '⚠️ PERINGATAN!\n\n' +
            'Jika Anda kembali, ujian akan diakhiri dan jawaban tidak akan disimpan.\n\n' +
            'Apakah Anda yakin ingin keluar dari ujian?'
        );
        
        if (confirmLeave) {
            // End exam and redirect
            completeExam();
            window.location.href = 'halamanpertama.html';
        } else {
            // Stay on page, push state again
            history.pushState({ exam: 'in_progress' }, '', location.href);
        }
    });
    
    console.log('Back button warning enabled');
}

/**
 * 4. Disable Keyboard Shortcuts
 */
function disableKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Disable F12 (Developer Tools)
        if (e.key === 'F12') {
            e.preventDefault();
            showSecurityNotification('F12 dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+Shift+I (Developer Tools)
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            showSecurityNotification('Developer Tools dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+Shift+J (Console)
        if (e.ctrlKey && e.shiftKey && e.key === 'J') {
            e.preventDefault();
            showSecurityNotification('Console dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+Shift+C (Inspect Element)
        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            showSecurityNotification('Inspect Element dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+U (View Source)
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            showSecurityNotification('View Source dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+S (Save)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            showSecurityNotification('Save dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Ctrl+P (Print)
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            showSecurityNotification('Print dinonaktifkan selama ujian');
            return false;
        }
        
        // Disable Alt+Tab (show warning only, can't prevent)
        if (e.altKey && e.key === 'Tab') {
            showSecurityNotification('Alt+Tab terdeteksi! Ini akan dihitung sebagai pelanggaran.');
        }
    });
    
    console.log('Keyboard shortcuts disabled');
}

/**
 * 5. Prevent Copy-Paste
 */
function preventCopyPaste() {
    // Disable copy
    document.addEventListener('copy', function(e) {
        e.preventDefault();
        showSecurityNotification('Copy dinonaktifkan selama ujian');
        return false;
    });
    
    // Disable paste
    document.addEventListener('paste', function(e) {
        e.preventDefault();
        showSecurityNotification('Paste dinonaktifkan selama ujian');
        return false;
    });
    
    // Disable cut
    document.addEventListener('cut', function(e) {
        e.preventDefault();
        showSecurityNotification('Cut dinonaktifkan selama ujian');
        return false;
    });
    
    // Disable select on specific elements
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    
    console.log('Copy-paste prevention enabled');
}

/**
 * Show security notification toast
 */
function showSecurityNotification(message) {
    // Remove existing notification if any
    const existing = document.getElementById('securityNotification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'securityNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        color: white;
        padding: 15px 30px;
        border-radius: 50px;
        font-family: 'Poppins', sans-serif;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 10px 30px rgba(220, 38, 38, 0.4);
        z-index: 10001;
        animation: slideDown 0.3s ease;
    `;
    notification.innerHTML = `<i class="fas fa-shield-alt"></i> ${message}`;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * Handle exam violation - auto submit
 */
async function handleExamViolation(reason) {
    console.log('Exam violation detected:', reason);
    
    // Show violation modal
    const violationModal = document.createElement('div');
    violationModal.id = 'violationModal';
    violationModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10002;
        font-family: 'Poppins', sans-serif;
    `;
    
    violationModal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%);
            padding: 50px;
            border-radius: 20px;
            text-align: center;
            max-width: 500px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        ">
            <i class="fas fa-times-circle" style="font-size: 5rem; color: #f87171; margin-bottom: 25px;"></i>
            <h2 style="color: white; margin-bottom: 15px; font-size: 1.8rem;">🚫 UJIAN DIHENTIKAN</h2>
            <p style="color: #fecaca; font-size: 1rem; line-height: 1.6; margin-bottom: 15px;">
                Ujian Anda telah diakhiri secara otomatis karena:
            </p>
            <p style="color: #fbbf24; font-size: 1.1rem; font-weight: 600; margin-bottom: 25px;">
                ${reason}
            </p>
            <p style="color: #9ca3af; font-size: 0.9rem;">
                Jawaban yang sudah disimpan akan dikumpulkan.
            </p>
        </div>
    `;
    
    document.body.appendChild(violationModal);
    
    // Complete exam
    await completeExam();
    
    // Redirect after 3 seconds
    setTimeout(() => {
        window.location.href = `habisujian.html?session=${examSessionId}`;
    }, 3000);
}

// Add CSS animations for notifications
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(-100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(styleSheet);

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

// Show question
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
        
        <div class="question-text">
            ${question.question_text}
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
            renderMathInElement(questionCard, {
                delimiters: [
                    {left: "$$", right: "$$", display: true},
                    {left: "\\[", right: "\\]", display: true},
                    {left: "$", right: "$", display: false},
                    {left: "\\(", right: "\\)", display: false}
                ],
                throwOnError: false
            });
        }, 100);
    }
}

// Render multiple choice options
function renderMultipleChoiceOptions(question, questionIndex) {
    // Filter options A-E that have content
    const options = ['A', 'B', 'C', 'D', 'E'].filter(opt => {
        const optKey = `option_${opt.toLowerCase()}`;
        return question[optKey] && question[optKey].trim() !== '';
    });
    
    if (!options || options.length === 0) {
        console.error('No options found for question:', question.id);
        return '<div class="error-message">Data opsi tidak tersedia. Silakan hubungi admin.</div>';
    }
    
    const currentAnswer = answers[questionIndex];

    let html = '<div class="options">';
    
    options.forEach(option => {
        const optionText = question[`option_${option.toLowerCase()}`];
        const isSelected = currentAnswer === option;
        
        html += `
            <div class="option ${isSelected ? 'selected' : ''}" onclick="selectAnswer('${option}')">
                <span class="option-letter">${option}</span>
                <span class="option-text">${optionText}</span>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// Render MCMA (Multiple Choice Multiple Answer) options
function renderMCMAOptions(question, questionIndex) {
    const options = ['A', 'B', 'C', 'D', 'E'].filter(opt => question[`option_${opt.toLowerCase()}`]);
    
    if (!options || options.length === 0) {
        return '<div class="error-message">Data opsi tidak tersedia. Silakan hubungi admin.</div>';
    }
    
    let selectedOptions = [];
    try {
        const currentAnswer = answers[questionIndex];
        selectedOptions = currentAnswer ? currentAnswer.split(',') : [];
    } catch (e) {
        console.error('Error parsing MCMA answer:', e);
        selectedOptions = [];
    }

    let html = '<div class="mcma-instruction"><i class="fas fa-info-circle"></i> Pilih satu atau lebih jawaban yang benar</div>';
    html += '<div class="options mcma-options">';
    
    options.forEach(option => {
        const optionText = question[`option_${option.toLowerCase()}`];
        const isSelected = selectedOptions.includes(option);
        
        html += `
            <div class="option mcma-option ${isSelected ? 'selected' : ''}" onclick="toggleMCMA('${option}')">
                <span class="mcma-checkbox ${isSelected ? 'checked' : ''}">
                    <i class="fas fa-check"></i>
                </span>
                <span class="option-letter">${option}</span>
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
        // Admin uses 'category_options' field, data may already be an array (JSONB) or a JSON string
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
        console.error('Error parsing category_options:', e);
        statements = [];
    }
    
    if (!statements || statements.length === 0) {
        console.log('Category options is empty for question:', question.id, '| category_options:', question.category_options);
        return '<div class="error-message">Data kategori tidak tersedia. Silakan hubungi admin.</div>';
    }
    
    let currentAnswer = null;
    let selectedAnswers = {};
    try {
        currentAnswer = answers[questionIndex];
        selectedAnswers = currentAnswer ? (typeof currentAnswer === 'string' ? JSON.parse(currentAnswer) : currentAnswer) : {};
    } catch (e) {
        console.error('Error parsing current answer:', e);
        selectedAnswers = {};
    }

    // Count answered
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

        // Render LaTeX if present
        let displayStatement = statement;
        if (statement && typeof statement === 'string' && statement.includes('\\(')) {
            try {
                displayStatement = statement.replace(/\\\((.+?)\\\)/g, (match, latex) => {
                    try {
                        return window.katex.renderToString(latex, { displayMode: false });
                    } catch (e) { return match; }
                });
            } catch (error) { displayStatement = statement; }
        }

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

// Helper: Check if PGK Kategori answer is correct
// Admin stores category_mapping with statement TEXT as keys,
// but student answers use numeric INDEX as keys.
// We convert by matching index to statement text via category_options.
function checkKategoriAnswer(answer, question) {
    try {
        const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
        if (!selectedAnswers || Object.keys(selectedAnswers).length === 0) return false;

        // Parse category_options (statements array)
        let statements = question.category_options || question.category_statements || [];
        if (!Array.isArray(statements)) {
            statements = typeof statements === 'string' ? JSON.parse(statements) : [];
        }

        // Parse category_mapping (key = statement text, value = boolean)
        let correctMapping = question.category_mapping || {};
        if (typeof correctMapping === 'string') {
            correctMapping = JSON.parse(correctMapping);
        }

        // If category_mapping is empty, cannot validate
        if (!correctMapping || Object.keys(correctMapping).length === 0) return false;

        // Build index-based correct map by matching statement text
        const indexCorrectMap = {};
        statements.forEach((stmt, idx) => {
            const stmtTrimmed = typeof stmt === 'string' ? stmt.trim() : stmt;
            if (correctMapping.hasOwnProperty(stmtTrimmed)) {
                indexCorrectMap[idx] = correctMapping[stmtTrimmed];
            } else {
                // Fallback: try string index key (old format)
                if (correctMapping.hasOwnProperty(String(idx))) {
                    indexCorrectMap[idx] = correctMapping[String(idx)];
                }
            }
        });

        // Compare each statement
        for (let idx = 0; idx < statements.length; idx++) {
            const selected = selectedAnswers[idx];
            const correct = indexCorrectMap[idx];
            if (correct === undefined) continue; // skip if no mapping
            if (selected !== correct) return false;
        }

        // Also check all required correct answers are present
        for (const [idxStr, shouldBeTrue] of Object.entries(indexCorrectMap)) {
            if (shouldBeTrue && selectedAnswers[parseInt(idxStr)] !== true) return false;
        }

        return true;
    } catch (e) {
        console.error('Error in checkKategoriAnswer:', e);
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

    // --- Smart DOM update (no full re-render) ---
    const row = document.getElementById(`pgk-row-${statementIndex}`);
    if (row) {
        // Update row highlight class
        row.className = value ? 'pgk-row pgk-row-benar' : 'pgk-row pgk-row-salah';

        // Update Benar button
        const btnBenar = row.querySelector('.pgk-btn-benar');
        const ringBenar = btnBenar?.querySelector('.pgk-radio-ring');
        if (btnBenar) { btnBenar.classList.toggle('active', value === true); }
        if (ringBenar) { ringBenar.classList.toggle('filled', value === true); }

        // Update Salah button
        const btnSalah = row.querySelector('.pgk-btn-salah');
        const ringSalah = btnSalah?.querySelector('.pgk-radio-ring');
        if (btnSalah) { btnSalah.classList.toggle('active', value === false); }
        if (ringSalah) { ringSalah.classList.toggle('filled', value === false); }
    }

    // Update answered counter pill
    const counterEl = document.getElementById('pgk-answered-count');
    if (counterEl) {
        counterEl.textContent = Object.keys(selectedAnswers).length;
    }

    // Update overall progress bar & nav (lightweight)
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
        if (answer === null) return; 

        const question = questions[currentQuestionIndex];
        
        let answerValue = answer;
        if (question.question_type === 'PGK Kategori') {
            answerValue = JSON.stringify(answer);
        }

        // Calculate time taken for this question
        const timeTaken = window.questionStartTime ? 
            Math.floor((Date.now() - window.questionStartTime) / 1000) : 0;

        // Check if answer is correct
        let isCorrect = false;
        if (question.question_type === 'PGK MCMA') {
            const selectedAnswers = answerValue.split(',').sort();
            const correctAnswers = Array.isArray(question.correct_answers)
                ? question.correct_answers.sort()
                : (question.correct_answers || '').split(',').sort();
            isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
        } else if (question.question_type === 'PGK Kategori') {
            const selectedAnswers = typeof answerValue === 'string' ? JSON.parse(answerValue) : answerValue;
            const correctMapping = typeof question.category_mapping === 'string'
                ? JSON.parse(question.category_mapping)
                : question.category_mapping;
            isCorrect = true;
            for (const [stmtIndex, isTrue] of Object.entries(selectedAnswers || {})) {
                if (correctMapping[stmtIndex] !== isTrue) {
                    isCorrect = false;
                    break;
                }
            }
        } else {
            isCorrect = answerValue === question.correct_answer;
        }

        const { error } = await supabase
            .from('exam_answers')
            .upsert({
                exam_session_id: examSessionId,
                question_id: question.id,
                selected_answer: answerValue,
                user_answer: answerValue,
                is_correct: isCorrect,
                time_taken_seconds: timeTaken,
                is_doubtful: doubtfulQuestions[currentQuestionIndex],
                answered_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error saving answer:', error);
        } else {
            console.log('Answer saved successfully for real-time monitoring');
        }

        // Reset question start time for next question
        window.questionStartTime = Date.now();

    } catch (error) {
        console.error('Error in saveCurrentAnswer:', error);
    }
}

// Setup navigation listeners
function setupNavigationListeners() {
    prevBtn.onclick = async () => {
        // Always allow going to previous question (no restrictions)
        if (currentQuestionIndex > 0) {
            console.log('Going to previous question:', currentQuestionIndex - 1);
            await showQuestion(currentQuestionIndex - 1);
        }
    };

    nextBtn.onclick = async () => {
        // Allow going to next question
        if (currentQuestionIndex < questions.length - 1) {
            console.log('Going to next question:', currentQuestionIndex + 1);
            await showQuestion(currentQuestionIndex + 1);
        } else {
            // Last question - confirm submit
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
// Sistem penilaian fleksibel: selalu menghasilkan nilai 0-100 terlepas dari jumlah soal
async function completeExam(isExpired = false) {
    try {
        clearInterval(timerInterval);

        const totalTime = Math.floor((Date.now() - examStartTime) / 1000);

        // Hitung jumlah jawaban benar (bukan total weight)
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

                if (isCorrect) {
                    correctCount++;
                }
            }
        }

        // Hitung nilai dalam skala 0-100 (fleksibel, tidak tergantung jumlah soal)
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

        console.log('Exam completed. Correct:', correctCount, '/', questions.length, 'Score:', totalScore, 'Type:', assignedQuestionType);

    } catch (error) {
        console.error('Error completing exam:', error);
    }
}

// Show exam completed screen
function showExamCompleted() {
    clearInterval(timerInterval);

    if (!examSessionId) {
        console.error('No exam session ID available for results page');
        alert('Error: Tidak dapat menampilkan hasil ujian. Session tidak valid.');
        window.location.href = 'halamanpertama.html';
        return;
    }

    window.location.href = `habisujian.html?session=${examSessionId}`;
}

// Show exam expired screen
function showExamExpired() {
    clearInterval(timerInterval);

    if (!examSessionId) {
        console.error('No exam session ID available for expired results page');
        alert('Error: Tidak dapat menampilkan hasil ujian. Session tidak valid.');
        window.location.href = 'halamanpertama.html';
        return;
    }

    window.location.href = `habisujian.html?session=${examSessionId}`;
}

// Update student analytics after exam completion
async function updateStudentAnalyticsAfterExam() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            console.warn('Cannot update analytics: user not authenticated');
            return;
        }

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

            if (isCorrect) {
                totalCorrect++;
            }

            const chapter = question.chapter;
            if (chapter) {
                if (!chapterPerformance[chapter]) {
                    chapterPerformance[chapter] = {
                        total: 0,
                        correct: 0
                    };
                }
                chapterPerformance[chapter].total++;
                if (isCorrect) {
                    chapterPerformance[chapter].correct++;
                }
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

        console.log('Student analytics updated after exam completion');

    } catch (error) {
        console.error('Error updating student analytics after exam:', error);
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