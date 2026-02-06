// habisujian.js - Exam completion page with results and answer review
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { geminiAnalytics } from './gemini_analytics.js';

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

        // Get questions for this exam
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('subject', 'Matematika')
            .eq('is_active', true)
            .order('created_at');

        if (questionsError) {
            throw new Error('Gagal memuat soal ujian');
        }

        questions = questionsData || [];

        // Get user answers for this session
        const { data: answersData, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .eq('exam_session_id', examSessionId)
            .order('question_id');

        if (answersError) {
            console.warn('Could not load answers:', answersError);
        }

        // Build answers array
        answers = new Array(questions.length).fill(null);
        if (answersData) {
            answersData.forEach(answerRecord => {
                const questionIndex = questions.findIndex(q => q.id === answerRecord.question_id);
                if (questionIndex !== -1) {
                    answers[questionIndex] = answerRecord.selected_answer;
                }
            });
        }

        console.log('Loaded questions:', questions.length);
        console.log('Loaded answers:', answers);

        // Display results
        displayExamResults(session);

        // Trigger AI analysis for this exam session
        await triggerAIAnalysis(session);

    } catch (error) {
        console.error('Error loading exam results:', error);
        alert('Terjadi kesalahan saat memuat hasil ujian: ' + error.message);
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
        const isPassed = session.is_passed || (session.total_score >= 70);
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
            if (question.question_type === 'PGK MCMA') {
                const selectedAnswers = (userAnswer || '').split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
            } else if (question.question_type === 'PGK Kategori') {
                const selectedAnswers = typeof userAnswer === 'string' ? JSON.parse(userAnswer) : userAnswer;
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
                isCorrect = userAnswer === question.correct_answer;
            }

            if (isCorrect) correctCount++;
        });

        correctAnswersElement.textContent = correctCount;
    }

    // Show answer review
    showAnswerReview(questions, answers);
}

// Function to retake exam
function retakeExam() {
    if (confirm('Apakah Anda yakin ingin mengerjakan ulang ujian? Progress sebelumnya akan hilang.')) {
        window.location.href = 'ujian.html';
    }
}

// Trigger AI analysis for the completed exam
async function triggerAIAnalysis(session) {
    try {
        console.log('Starting AI analysis for exam session:', examSessionId);

        // Get all answers for this session that haven't been analyzed yet
        const { data: answersData, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .eq('exam_session_id', examSessionId);

        if (answersError) {
            console.warn('Could not load answers for AI analysis:', answersError);
            return;
        }

        if (!answersData || answersData.length === 0) {
            console.log('No answers to analyze');
            return;
        }

        // Check which answers haven't been analyzed yet
        const { data: existingAnalyses, error: analysesError } = await supabase
            .from('gemini_analyses')
            .select('answer_id')
            .in('answer_id', answersData.map(a => a.id));

        const analyzedAnswerIds = new Set(
            (existingAnalyses || []).map(a => a.answer_id)
        );

        const answersToAnalyze = answersData.filter(answer => !analyzedAnswerIds.has(answer.id));

        if (answersToAnalyze.length === 0) {
            console.log('All answers have already been analyzed');
            return;
        }

        console.log(`Analyzing ${answersToAnalyze.length} new answers with AI...`);

        // Create questions map for quick lookup
        const questionsMap = new Map();
        questions.forEach(q => questionsMap.set(q.id, q));

        // Analyze answers in batches to avoid rate limits
        const batchSize = 1; // Process one at a time to be safe
        let completedAnalyses = 0;

        for (let i = 0; i < answersToAnalyze.length; i += batchSize) {
            const batch = answersToAnalyze.slice(i, i + batchSize);
            console.log(`Processing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(answersToAnalyze.length/batchSize)}`);

            try {
                // Analyze each answer in the batch
                for (const answer of batch) {
                    const question = questionsMap.get(answer.question_id);
                    if (question) {
                        await geminiAnalytics.analyzeStudentAnswer(answer, question);
                        completedAnalyses++;
                        console.log(`Analyzed answer ${completedAnalyses}/${answersToAnalyze.length}`);
                    }
                }

                // Small delay between batches
                if (i + batchSize < answersToAnalyze.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error('Error analyzing batch:', error);
                // Continue with next batch even if one fails
            }
        }

        console.log(`AI analysis completed: ${completedAnalyses} answers analyzed`);

        // Show notification to user that AI analysis is ready
        if (completedAnalyses > 0) {
            showAIAnalysisNotification(completedAnalyses);
        }

    } catch (error) {
        console.error('Error triggering AI analysis:', error);
        // Don't show error to user as this is background processing
    }
}

// Show notification that AI analysis is ready
function showAIAnalysisNotification(analysisCount) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'ai-analysis-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-brain"></i>
            <div class="notification-text">
                <strong>AI Analysis Selesai!</strong>
                <p>${analysisCount} jawaban telah dianalisis oleh AI. Lihat analisis detail di dashboard admin.</p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Add to page
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