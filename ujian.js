// ujian.js - Exam interface with countdown timer
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

// Exam state
let currentQuestionIndex = 0;
let questions = [];
let answers = [];
let doubtfulQuestions = []; // Track questions marked as doubtful
let examSessionId = null;
let timeRemaining = 0; // in seconds
let timerInterval = null;
let examStartTime = null;

// DOM Elements - will be initialized after DOM load
let timerDisplay, progressFill, questionNav, questionCard, questionCounter;
let prevBtn, nextBtn;

// Initialize exam
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize DOM elements first
        initializeDOMElements();

        // Check if user is logged in
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            window.location.href = 'index.html';
            return;
        }

        console.log('User authenticated:', result.user.email);

        // Load questions and start exam
        await loadExamQuestions();
        await startExamSession();

        // Setup navigation event listeners after DOM is ready
        setupNavigationListeners();

    } catch (error) {
        console.error('Error initializing exam:', error);
        alert('Terjadi kesalahan saat memuat ujian.');
        window.location.href = 'halamanpertama.html';
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

// Load mathematics questions for TKA
async function loadExamQuestions() {
    try {
        console.log('Loading exam questions...');

        const { data: questionsData, error } = await supabase
            .from('questions')
            .select('*')
            .eq('subject', 'Matematika')
            .eq('is_active', true)
            .order('created_at');

        if (error) {
            console.error('Error loading questions:', error);
            alert('Gagal memuat soal ujian: ' + error.message);
            return;
        }

        console.log('Questions data received:', questionsData);

        if (!questionsData || questionsData.length === 0) {
            console.log('No questions found');
            alert('Belum ada soal matematika yang tersedia. Silakan hubungi admin untuk menambahkan soal.');
            window.location.href = 'halamanpertama.html';
            return;
        }

        questions = questionsData;
        console.log(`Loaded ${questions.length} questions`);

        // Initialize answers array
        answers = new Array(questions.length).fill(null);
        doubtfulQuestions = new Array(questions.length).fill(false);

        // Set total exam time (sum of all question times or default to 30 minutes per question)
        const totalMinutes = questions.reduce((sum, q) => sum + (q.time_limit_minutes || 30), 0);
        timeRemaining = totalMinutes * 60; // convert to seconds

        console.log(`Total exam time: ${totalMinutes} minutes (${timeRemaining} seconds)`);

        // Log question types for debugging
        const questionTypes = questions.map(q => q.question_type);
        console.log('Question types:', questionTypes);

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

        // Create exam session (required - fail if cannot create)
        try {
            const { data: session, error } = await supabase
                .from('exam_sessions')
                .insert([{
                    user_id: result.user.id,
                    question_set_id: null, // Not using question sets, filtering by subject instead
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
            console.log('Exam session created:', examSessionId);

        } catch (sessionError) {
            console.error('Error creating exam session:', sessionError);
            alert('Error: ' + sessionError.message);
            window.location.href = 'halamanpertama.html';
            return;
        }

        examStartTime = Date.now();
        startTimer();
        renderQuestionNav();
        await showQuestion(0);

        console.log('Exam session started successfully');

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
            // Time's up - auto submit
            clearInterval(timerInterval);
            handleTimeUp();
            return;
        }

        updateTimerDisplay();

        // Warning when less than 5 minutes
        if (timeRemaining <= 300) { // 5 minutes
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

    // Save any unsaved answers
    await saveCurrentAnswer();

    // Complete exam
    await completeExam(true); // true = expired

    // Show expired screen
    showExamExpired();
}

// Render question navigation
function renderQuestionNav() {
    questionNav.innerHTML = '';

    questions.forEach((_, index) => {
        const navBtn = document.createElement('button');
        navBtn.className = `question-nav-btn ${index === currentQuestionIndex ? 'current' : ''} ${answers[index] ? 'answered' : ''} ${doubtfulQuestions[index] ? 'doubtful' : ''}`;
        navBtn.textContent = index + 1;
        navBtn.onclick = async () => await showQuestion(index);
        questionNav.appendChild(navBtn);
    });
}

// Show question by index
async function showQuestion(index) {
    if (index < 0 || index >= questions.length) return;

    // Save current answer before switching
    await saveCurrentAnswer();

    currentQuestionIndex = index;
    const question = questions[index];

    // Update navigation
    renderQuestionNav();

    // Update progress based on answered questions
    const answeredCount = answers.filter(answer => answer !== null && answer !== '').length;
    const progress = (answeredCount / questions.length) * 100;
    progressFill.style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;

    // Update question counter
    questionCounter.textContent = `Soal ${index + 1} dari ${questions.length}`;

    // Update navigation buttons
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === questions.length - 1 ? 'Selesai' : 'Selanjutnya';

    // Render question content (sections or legacy format)
    let questionContentHtml = '';

    if (question.question_sections && Array.isArray(question.question_sections) && question.question_sections.length > 0) {
        // Render composite question sections
        questionContentHtml = question.question_sections
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(section => {
                if (section.type === 'text') {
                    let textContent = section.content || '';
                    if (textContent && window.katex) {
                        try {
                            // Render LaTeX expressions found in the text
                            textContent = textContent.replace(/\\\(.+?\\\)/g, (match) => {
                                try {
                                    return window.katex.renderToString(match.slice(2, -2), { displayMode: false });
                                } catch (e) {
                                    return match; // Return original if LaTeX fails
                                }
                            });
                        } catch (error) {
                            console.error('LaTeX rendering error in section text:', error);
                        }
                    }
                    // Replace line breaks with <br> for proper paragraph display
                    textContent = textContent.replace(/\n/g, '<br>');
                    return `<div class="question-text-section">${textContent}</div>`;
                } else if (section.type === 'image') {
                    return `<div class="question-image"><img src="${section.content}" alt="Soal ${index + 1}" onerror="this.style.display='none'"></div>`;
                }
                return '';
            })
            .join('');
    } else {
        // Legacy format: question text and image
        const imageHtml = question.image_url
            ? `<div class="question-image"><img src="${question.image_url}" alt="Soal ${index + 1}" onerror="this.style.display='none'"></div>`
            : '';

        // Render question text with LaTeX support
        let questionTextHtml = question.question_text || '';
        if (questionTextHtml && window.katex) {
            try {
                // Render LaTeX expressions found in the text
                questionTextHtml = questionTextHtml.replace(/\\\(.+?\\\)/g, (match) => {
                    try {
                        return window.katex.renderToString(match.slice(2, -2), { displayMode: false });
                    } catch (e) {
                        return match; // Return original if LaTeX fails
                    }
                });
            } catch (error) {
                console.error('LaTeX rendering error in question text:', error);
                // Keep original text if LaTeX fails
            }
        }
        // Replace line breaks with <br> for proper paragraph display
        questionTextHtml = questionTextHtml.replace(/\n/g, '<br>');

        questionContentHtml = `<div class="question-text">${questionTextHtml}</div>${imageHtml}`;
    }

    // Render different question types
    let optionsHtml = '';

    console.log(`Rendering question ${index + 1}, type: ${question.question_type}`);

    switch (question.question_type) {
        case 'Pilihan Ganda':
            console.log('Rendering Pilihan Ganda options');

            // Parse option images if they exist
            let optionImages = {};
            if (question.option_images) {
                if (typeof question.option_images === 'string') {
                    try {
                        optionImages = JSON.parse(question.option_images);
                    } catch (e) {
                        console.error('Error parsing option_images:', e);
                        optionImages = {};
                    }
                } else {
                    optionImages = question.option_images;
                }
            }

            // Parse option LaTeX if they exist
            let optionLatex = {};
            if (question.option_latex) {
                if (typeof question.option_latex === 'string') {
                    try {
                        optionLatex = JSON.parse(question.option_latex);
                    } catch (e) {
                        console.error('Error parsing option_latex:', e);
                        optionLatex = {};
                    }
                } else {
                    optionLatex = question.option_latex;
                }
            }

            // Helper function to render option content
            const renderOptionContent = (letter) => {
                const textContent = question[`option_${letter.toLowerCase()}`] || 'N/A';
                const latexContent = optionLatex[`option_${letter.toLowerCase()}_latex`];
                const imageContent = optionImages[`option_${letter.toLowerCase()}_image`];

                let html = textContent;

                if (latexContent && window.katex) {
                    try {
                        const latexHtml = window.katex.renderToString(latexContent);
                        html += ` ${latexHtml}`;
                    } catch (e) {
                        console.error('LaTeX rendering error for option', letter, e);
                        html += ` <span style="color: red;">[LaTeX Error]</span>`;
                    }
                }

                if (imageContent) {
                    html += `<div class="option-image"><img src="${imageContent}" alt="Option ${letter}" onerror="this.style.display='none'"></div>`;
                }

                return html;
            };

            optionsHtml = `
                <div class="option ${answers[index] === 'A' ? 'selected' : ''}" onclick="selectAnswer('A')">
                    <input type="radio" name="answer" value="A" ${answers[index] === 'A' ? 'checked' : ''}>
                    <label>A. ${renderOptionContent('A')}</label>
                </div>
                <div class="option ${answers[index] === 'B' ? 'selected' : ''}" onclick="selectAnswer('B')">
                    <input type="radio" name="answer" value="B" ${answers[index] === 'B' ? 'checked' : ''}>
                    <label>B. ${renderOptionContent('B')}</label>
                </div>
                <div class="option ${answers[index] === 'C' ? 'selected' : ''}" onclick="selectAnswer('C')">
                    <input type="radio" name="answer" value="C" ${answers[index] === 'C' ? 'checked' : ''}>
                    <label>C. ${renderOptionContent('C')}</label>
                </div>
                <div class="option ${answers[index] === 'D' ? 'selected' : ''}" onclick="selectAnswer('D')">
                    <input type="radio" name="answer" value="D" ${answers[index] === 'D' ? 'checked' : ''}>
                    <label>D. ${renderOptionContent('D')}</label>
                </div>
            `;
            break;

        case 'PGK Kategori':
            console.log('Rendering PGK Kategori options');
            // For category questions, show statements with True/False radio buttons in a table
            let categoryHtml = '<div class="category-question"><table class="category-table"><thead><tr><th>Pernyataan</th><th>Benar</th><th>Salah</th></tr></thead><tbody>';

            if (question.category_options) {
                let statements = question.category_options;

                // Parse if it's a JSON string
                if (typeof statements === 'string') {
                    try {
                        statements = JSON.parse(statements);
                    } catch (e) {
                        console.error('Error parsing category_options:', e);
                        statements = [];
                    }
                }

                // Parse category_mapping to get current answers
                let categoryMapping = question.category_mapping || {};
                if (typeof categoryMapping === 'string') {
                    try {
                        categoryMapping = JSON.parse(categoryMapping);
                    } catch (e) {
                        console.error('Error parsing category_mapping:', e);
                        categoryMapping = {};
                    }
                }

                // Load existing category answers from database
                let userAnswers = {};
                try {
                    const { data: existingAnswers, error } = await supabase
                        .from('category_answers')
                        .select('statement_text, selected_answer')
                        .eq('exam_session_id', examSessionId)
                        .eq('question_id', question.id);

                    if (!error && existingAnswers) {
                        existingAnswers.forEach(answer => {
                            userAnswers[answer.statement_text] = answer.selected_answer;
                        });
                    }
                } catch (e) {
                    console.error('Error loading category answers:', e);
                }

                // Update local answers array
                answers[index] = JSON.stringify(userAnswers);

                console.log('Statements:', statements);
                console.log('Category mapping:', categoryMapping);
                console.log('User answers:', userAnswers);

                if (Array.isArray(statements)) {
                    statements.forEach((statement, stmtIndex) => {
                        const isTrue = userAnswers[statement] === true;
                        const isFalse = userAnswers[statement] === false;
                        // Escape single quotes in statement for JavaScript
                        const escapedStatement = statement.replace(/'/g, "\\'");
                        categoryHtml += `
                            <tr class="statement-row">
                                <td class="statement-text">${statement}</td>
                                <td class="radio-cell">
                                    <input type="radio"
                                           name="answer-${stmtIndex}"
                                           value="true"
                                           ${isTrue ? 'checked' : ''}
                                           onchange="selectCategoryAnswer('${escapedStatement}', 'true')">
                                </td>
                                <td class="radio-cell">
                                    <input type="radio"
                                           name="answer-${stmtIndex}"
                                           value="false"
                                           ${isFalse ? 'checked' : ''}
                                           onchange="selectCategoryAnswer('${escapedStatement}', 'false')">
                                </td>
                            </tr>
                        `;
                    });
                } else {
                    categoryHtml += '<tr><td colspan="3">Format pernyataan tidak valid</td></tr>';
                }
            } else {
                categoryHtml += '<tr><td colspan="3">Tidak ada pernyataan yang tersedia</td></tr>';
            }

            categoryHtml += '</tbody></table></div>';
            optionsHtml = categoryHtml;
            break;

        case 'PGK MCMA':
            console.log('Rendering PGK MCMA options');
            // For MCMA questions, show checkboxes
            const selectedAnswers = answers[index] ? answers[index].split(',') : [];

            // Parse option images if they exist
            let mcmaOptionImages = {};
            if (question.option_images) {
                if (typeof question.option_images === 'string') {
                    try {
                        mcmaOptionImages = JSON.parse(question.option_images);
                    } catch (e) {
                        console.error('Error parsing option_images:', e);
                        mcmaOptionImages = {};
                    }
                } else {
                    mcmaOptionImages = question.option_images;
                }
            }

            // Parse option LaTeX if they exist
            let mcmaOptionLatex = {};
            if (question.option_latex) {
                if (typeof question.option_latex === 'string') {
                    try {
                        mcmaOptionLatex = JSON.parse(question.option_latex);
                    } catch (e) {
                        console.error('Error parsing option_latex:', e);
                        mcmaOptionLatex = {};
                    }
                } else {
                    mcmaOptionLatex = question.option_latex;
                }
            }

            // Helper function to render MCMA option content
            const renderMCMAOptionContent = (letter) => {
                const textContent = question[`option_${letter.toLowerCase()}`] || 'N/A';
                const latexContent = mcmaOptionLatex[`option_${letter.toLowerCase()}_latex`];
                const imageContent = mcmaOptionImages[`option_${letter.toLowerCase()}_image`];

                let html = textContent;

                if (latexContent && window.katex) {
                    try {
                        const latexHtml = window.katex.renderToString(latexContent);
                        html += ` ${latexHtml}`;
                    } catch (e) {
                        console.error('LaTeX rendering error for MCMA option', letter, e);
                        html += ` <span style="color: red;">[LaTeX Error]</span>`;
                    }
                }

                if (imageContent) {
                    html += `<div class="option-image"><img src="${imageContent}" alt="Option ${letter}" onerror="this.style.display='none'"></div>`;
                }

                return html;
            };

            optionsHtml = `
                <div class="mcma-options">
                    <div class="option ${selectedAnswers.includes('A') ? 'selected' : ''}" onclick="toggleMCMA('A')">
                        <input type="checkbox" value="A" ${selectedAnswers.includes('A') ? 'checked' : ''}>
                        <label>A. ${renderMCMAOptionContent('A')}</label>
                    </div>
                    <div class="option ${selectedAnswers.includes('B') ? 'selected' : ''}" onclick="toggleMCMA('B')">
                        <input type="checkbox" value="B" ${selectedAnswers.includes('B') ? 'checked' : ''}>
                        <label>B. ${renderMCMAOptionContent('B')}</label>
                    </div>
                    <div class="option ${selectedAnswers.includes('C') ? 'selected' : ''}" onclick="toggleMCMA('C')">
                        <input type="checkbox" value="C" ${selectedAnswers.includes('C') ? 'checked' : ''}>
                        <label>C. ${renderMCMAOptionContent('C')}</label>
                    </div>
                    <div class="option ${selectedAnswers.includes('D') ? 'selected' : ''}" onclick="toggleMCMA('D')">
                        <input type="checkbox" value="D" ${selectedAnswers.includes('D') ? 'checked' : ''}>
                        <label>D. ${renderMCMAOptionContent('D')}</label>
                    </div>
                </div>
            `;
            break;

        default:
            console.log('Rendering default (Pilihan Ganda) options');
            // Fallback to multiple choice
            optionsHtml = `
                <div class="option ${answers[index] === 'A' ? 'selected' : ''}" onclick="selectAnswer('A')">
                    <input type="radio" name="answer" value="A" ${answers[index] === 'A' ? 'checked' : ''}>
                    <label>A. ${question.option_a || 'N/A'}</label>
                </div>
                <div class="option ${answers[index] === 'B' ? 'selected' : ''}" onclick="selectAnswer('B')">
                    <input type="radio" name="answer" value="B" ${answers[index] === 'B' ? 'checked' : ''}>
                    <label>B. ${question.option_b || 'N/A'}</label>
                </div>
                <div class="option ${answers[index] === 'C' ? 'selected' : ''}" onclick="selectAnswer('C')">
                    <input type="radio" name="answer" value="C" ${answers[index] === 'C' ? 'checked' : ''}>
                    <label>C. ${question.option_c || 'N/A'}</label>
                </div>
                <div class="option ${answers[index] === 'D' ? 'selected' : ''}" onclick="selectAnswer('D')">
                    <input type="radio" name="answer" value="D" ${answers[index] === 'D' ? 'checked' : ''}>
                    <label>D. ${question.option_d || 'N/A'}</label>
                </div>
            `;
    }

    questionCard.innerHTML = `
        <div class="question-number">Soal ${index + 1}</div>
        ${questionContentHtml}
        <div class="question-actions">
            <button class="doubt-btn ${doubtfulQuestions[index] ? 'active' : ''}" onclick="toggleDoubt()">
                <i class="fas fa-question-circle"></i> ${doubtfulQuestions[index] ? 'Hapus Ragu-ragu' : 'Tandai Ragu-ragu'}
            </button>
        </div>
        <div class="options">
            ${optionsHtml}
        </div>
    `;
}

// Select answer for multiple choice questions
function selectAnswer(answer) {
    answers[currentQuestionIndex] = answer;

    // Update UI
    const options = questionCard.querySelectorAll('.option');
    options.forEach(option => option.classList.remove('selected'));

    const selectedOption = questionCard.querySelector(`.option:nth-child(${answer.charCodeAt(0) - 64})`);
    if (selectedOption) {
        selectedOption.classList.add('selected');
    }

    // Update navigation
    renderQuestionNav();
}

// Toggle MCMA answer
function toggleMCMA(option) {
    console.log(`Toggling MCMA option: ${option}`);

    const currentAnswer = answers[currentQuestionIndex] || '';
    const selectedOptions = currentAnswer ? currentAnswer.split(',') : [];

    const optionIndex = selectedOptions.indexOf(option);
    if (optionIndex > -1) {
        // Remove option if already selected
        selectedOptions.splice(optionIndex, 1);
        console.log(`Removed option ${option}`);
    } else {
        // Add option if not selected
        selectedOptions.push(option);
        selectedOptions.sort(); // Keep in alphabetical order
        console.log(`Added option ${option}`);
    }

    answers[currentQuestionIndex] = selectedOptions.join(',');

    console.log('Updated MCMA answers:', selectedOptions);

    // Update UI - find the correct option element
    const options = questionCard.querySelectorAll('.option');
    options.forEach((optionEl, index) => {
        const letter = String.fromCharCode(65 + index); // A, B, C, D
        const isSelected = selectedOptions.includes(letter);
        optionEl.classList.toggle('selected', isSelected);

        // Update checkbox state
        const checkbox = optionEl.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = isSelected;
        }
    });

    // Update navigation
    renderQuestionNav();
}

// Select answer for category questions
async function selectCategoryAnswer(statement, value) {
    const question = questions[currentQuestionIndex];
    const isTrue = value === 'true';

    try {
        // Save to category_answers table
        await supabase
            .from('category_answers')
            .upsert([{
                exam_session_id: examSessionId,
                question_id: question.id,
                statement_text: statement,
                selected_answer: isTrue
            }]);

        // Also update local answers array for UI purposes
        if (!answers[currentQuestionIndex] || typeof answers[currentQuestionIndex] !== 'object') {
            answers[currentQuestionIndex] = {};
        }

        let currentAnswers = answers[currentQuestionIndex];
        if (typeof currentAnswers === 'string') {
            try {
                currentAnswers = JSON.parse(currentAnswers);
            } catch (error) {
                currentAnswers = {};
            }
        }

        currentAnswers[statement] = isTrue;
        answers[currentQuestionIndex] = JSON.stringify(currentAnswers);

        // Update navigation
        renderQuestionNav();

    } catch (error) {
        console.error('Error saving category answer:', error);
        alert('Gagal menyimpan jawaban. Silakan coba lagi.');
    }
}


// Save current answer to database
async function saveCurrentAnswer() {
    if (!examSessionId || answers[currentQuestionIndex] === null || answers[currentQuestionIndex] === '') return;

    try {
        const question = questions[currentQuestionIndex];
        let isCorrect = false;

        // Check correctness based on question type
        if (question.question_type === 'PGK MCMA') {
            // For MCMA, check if selected answers match correct answers
            const selectedAnswers = answers[currentQuestionIndex].split(',').sort();
            const correctAnswers = Array.isArray(question.correct_answers)
                ? question.correct_answers.sort()
                : (question.correct_answers || '').split(',').sort();
            isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
        } else if (question.question_type === 'PGK Kategori') {
            // For PGK Kategori, check if selected answers match the correct mapping
            const selectedAnswers = typeof answers[currentQuestionIndex] === 'string' ? JSON.parse(answers[currentQuestionIndex]) : answers[currentQuestionIndex];
            const correctMapping = typeof question.category_mapping === 'string'
                ? JSON.parse(question.category_mapping)
                : question.category_mapping;

            // Check if all selected answers are correct
            let allCorrect = true;
            for (const [stmt, isTrue] of Object.entries(selectedAnswers || {})) {
                if (correctMapping[stmt] !== isTrue) {
                    allCorrect = false;
                    break;
                }
            }

            // Also check that no correct statements were missed
            for (const [stmt, shouldBeTrue] of Object.entries(correctMapping || {})) {
                if (shouldBeTrue && selectedAnswers[stmt] !== true) {
                    allCorrect = false;
                    break;
                }
            }

            isCorrect = allCorrect;
        } else {
            // For regular multiple choice
            isCorrect = answers[currentQuestionIndex] === question.correct_answer;
        }

        await supabase
            .from('exam_answers')
            .upsert([{
                exam_session_id: examSessionId,
                question_id: question.id,
                selected_answer: answers[currentQuestionIndex],
                is_correct: isCorrect,
                time_taken_seconds: Math.floor((Date.now() - examStartTime) / 1000)
            }]);

    } catch (error) {
        console.error('Error saving answer:', error);
    }
}

// Setup navigation event listeners
function setupNavigationListeners() {
    if (prevBtn) {
        prevBtn.addEventListener('click', async () => {
            if (currentQuestionIndex > 0) {
                await showQuestion(currentQuestionIndex - 1);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            if (currentQuestionIndex < questions.length - 1) {
                await showQuestion(currentQuestionIndex + 1);
            } else {
                // Finish exam
                finishExam();
            }
        });
    }

    // Setup navigation toggle
    const navToggleBtn = document.getElementById('navToggleBtn');
    const questionNavSection = document.querySelector('.question-navigation-section');

    if (navToggleBtn && questionNavSection) {
        navToggleBtn.addEventListener('click', () => {
            questionNavSection.classList.toggle('show');
        });
    }

    console.log('Navigation listeners set up');
}

// Finish exam
async function finishExam() {
    // First confirmation: warn about submitting answers
    if (!confirm('PERINGATAN: Setelah menekan "Ya", jawaban Anda akan dikirim dan tidak dapat diubah lagi. Apakah Anda yakin ingin menyelesaikan ujian?')) {
        return;
    }

    const unanswered = answers.filter(answer => answer === null).length;

    if (unanswered > 0) {
        if (!confirm(`Masih ada ${unanswered} soal yang belum dijawab. Yakin ingin menyelesaikan ujian?`)) {
            return;
        }
    }

    // Save final answer
    await saveCurrentAnswer();

    // Complete exam
    await completeExam(false); // false = completed normally

    // Show completion screen
    showExamCompleted();
}

// Complete exam session
async function completeExam(isExpired = false) {
    try {
        if (examSessionId) {
            const totalTime = Math.floor((Date.now() - examStartTime) / 1000);

            // Calculate score based on question types
            let totalScore = 0;
            for (let i = 0; i < questions.length; i++) {
                const question = questions[i];
                const answer = answers[i];

                if (!answer) continue; // Skip unanswered questions

                let isCorrect = false;

                if (question.question_type === 'PGK MCMA') {
                    // For MCMA, check if all correct answers are selected
                    const selectedAnswers = answer.split(',').sort();
                    const correctAnswers = Array.isArray(question.correct_answers)
                        ? question.correct_answers.sort()
                        : (question.correct_answers || '').split(',').sort();
                    isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
                } else if (question.question_type === 'PGK Kategori') {
                    // For PGK Kategori, check if selected answers match the correct mapping
                    const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
                    const correctMapping = typeof question.category_mapping === 'string'
                        ? JSON.parse(question.category_mapping)
                        : question.category_mapping;

                    // Check if all selected answers are correct
                    let allCorrect = true;
                    for (const [stmtIndex, isTrue] of Object.entries(selectedAnswers || {})) {
                        if (correctMapping[stmtIndex] !== isTrue) {
                            allCorrect = false;
                            break;
                        }
                    }

                    // Also check that no correct statements were missed
                    for (const [stmtIndex, shouldBeTrue] of Object.entries(correctMapping || {})) {
                        if (shouldBeTrue && selectedAnswers[stmtIndex] !== true) {
                            allCorrect = false;
                            break;
                        }
                    }

                    isCorrect = allCorrect;
                } else {
                    // For regular questions
                    isCorrect = answer === question.correct_answer;
                }

                if (isCorrect) {
                    totalScore += question.scoring_weight;
                }
            }

            // Update exam session
            await supabase
                .from('exam_sessions')
                .update({
                    completed_at: new Date().toISOString(),
                    total_time_seconds: totalTime,
                    total_score: totalScore,
                    status: isExpired ? 'expired' : 'completed',
                    is_passed: totalScore >= 70 // Assuming passing score is 70
                })
                .eq('id', examSessionId);

            // Update student analytics after exam completion
            await updateStudentAnalyticsAfterExam();

            // Show final score
            finalScore.textContent = `${totalScore} poin`;
            if (expiredScore) {
                expiredScore.textContent = `${totalScore} poin`;
            }
            passStatus.textContent = totalScore >= 70 ? '🎉 LULUS' : '❌ TIDAK LULUS';
            passStatus.style.color = totalScore >= 70 ? '#059669' : '#dc2626';
        }

    } catch (error) {
        console.error('Error completing exam:', error);
    }
}

// Show exam completed screen
function showExamCompleted() {
    clearInterval(timerInterval);

    // Ensure we have a valid session ID before redirecting
    if (!examSessionId) {
        console.error('No exam session ID available for results page');
        alert('Error: Tidak dapat menampilkan hasil ujian. Session tidak valid.');
        window.location.href = 'halamanpertama.html';
        return;
    }

    // Redirect to dedicated results page
    window.location.href = `habisujian.html?session=${examSessionId}`;
}

// Show exam expired screen
function showExamExpired() {
    clearInterval(timerInterval);

    // Ensure we have a valid session ID before redirecting
    if (!examSessionId) {
        console.error('No exam session ID available for expired results page');
        alert('Error: Tidak dapat menampilkan hasil ujian. Session tidak valid.');
        window.location.href = 'halamanpertama.html';
        return;
    }

    // Redirect to dedicated results page
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

        // Calculate performance data from current exam
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
                const selectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
                const correctMapping = typeof question.category_mapping === 'string'
                    ? JSON.parse(question.category_mapping)
                    : question.category_mapping;

                let allCorrect = true;
                for (const [stmtIndex, isTrue] of Object.entries(selectedAnswers || {})) {
                    if (correctMapping[stmtIndex] !== isTrue) {
                        allCorrect = false;
                        break;
                    }
                }

                for (const [stmtIndex, shouldBeTrue] of Object.entries(correctMapping || {})) {
                    if (shouldBeTrue && selectedAnswers[stmtIndex] !== true) {
                        allCorrect = false;
                        break;
                    }
                }

                isCorrect = allCorrect;
            } else {
                isCorrect = answer === question.correct_answer;
            }

            if (isCorrect) {
                totalCorrect++;
            }

            // Track chapter performance
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

        // Prepare skill radar data
        const skillRadarData = Object.keys(chapterPerformance).map(chapter => ({
            skill: chapter,
            level: Math.round((chapterPerformance[chapter].correct / chapterPerformance[chapter].total) * 100)
        }));

        // Update or insert analytics record
        await supabase
            .from('student_analytics')
            .upsert({
                user_id: userId,
                chapter: 'Overall',
                sub_chapter: 'Recent Exam',
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
    await showQuestion(currentQuestionIndex); // Re-render to update button state
    renderQuestionNav(); // Update navigation
}

// Export functions for global access
window.selectAnswer = selectAnswer;
window.toggleMCMA = toggleMCMA;
window.selectCategoryAnswer = selectCategoryAnswer;
window.toggleDoubt = toggleDoubt;

// Add debugging function
window.debugExamState = function() {
    console.log('=== EXAM DEBUG INFO ===');
    console.log('Current question index:', currentQuestionIndex);
    console.log('Total questions:', questions.length);
    console.log('Answers array:', answers);
    console.log('Current question:', questions[currentQuestionIndex]);
    console.log('Time remaining:', timeRemaining);
    console.log('Exam session ID:', examSessionId);
    alert('Debug info logged to console');
};