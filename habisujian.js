// habisujian.js - Exam completion page with results and answer review
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';
import { geminiAnalytics } from './gemini_analytics.js';
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

        // Display results FIRST - don't block on AI analysis
        // AI analysis runs in background (fire-and-forget)
        triggerAIAnalysis(session).catch(err => {
            console.warn('[AI Background] Analysis error (non-blocking):', err);
        });

    } catch (error) {
        console.error('Error loading exam results:', error);
        alert('Terjadi kesalahan saat memuat hasil ujian: ' + error.message);
    }
}

// Helper: cek jawaban PGK Kategori
// category_mapping key = teks pernyataan, jawaban siswa key = index angka
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
            if (question.question_type === 'PGK MCMA') {
                const selectedAnswers = (userAnswer || '').split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
            } else if (question.question_type === 'PGK Kategori') {
                isCorrect = checkKategoriHabisUjian(userAnswer, question);
            } else {
                isCorrect = userAnswer === question.correct_answer;
            }

            if (isCorrect) correctCount++;
        });

        correctAnswersElement.textContent = correctCount;
    }

    // Calculate and display IRT ability estimate (θ)
    const theta = estimateAbility(questions, answers);
    displayIRTResults(theta);

    // Show answer review
    showAnswerReview(questions, answers);
}

// ==========================================
// IRT ABILITY ESTIMATION FUNCTIONS
// ==========================================

/**
 * Estimate student ability (θ) using Maximum Likelihood Estimation
 * @param {Array} questions - Array of question objects with IRT parameters
 * @param {Array} answers - Array of student answers
 * @returns {number} - Estimated ability (θ) value between -3 and 3
 */
function estimateAbility(questions, answers) {
    let theta = 0; // Initial ability estimate (average)
    let iteration = 0;
    const maxIterations = 50;
    const tolerance = 0.001;
    
    // Filter questions that have answers
    const answeredQuestions = questions.filter((q, i) => {
        const answer = answers[i];
        return answer !== null && answer !== undefined;
    });
    
    if (answeredQuestions.length === 0) {
        console.log('No answers to estimate ability');
        return 0;
    }
    
    console.log('Starting IRT ability estimation...');
    
    while (iteration < maxIterations) {
        let sumNumerator = 0;
        let sumDenominator = 0;
        
        questions.forEach((q, i) => {
            const answer = answers[i];
            if (answer === null || answer === undefined) return;
            
            // Get IRT parameters for this question
            const params = getItemParameters(q.id);
            let a, b, c;
            
            if (params) {
                a = params.a || 1.0;
                b = params.b || 0.0;
                c = params.c || 0.25;
            } else {
                // Use default values if no IRT parameters exist
                a = q.irt_a_parameter || 1.0;
                b = q.irt_b_parameter || 0.0;
                c = q.irt_c_parameter || 0.25;
            }
            
            // Check if answer is correct
            const isCorrect = checkAnswerCorrectness(q, answer);
            
            // Calculate probability using 3PL IRT model
            // P(θ) = c + (1 - c) / (1 + e^(-a(θ - b)))
            const expTerm = Math.exp(-a * (theta - b));
            const P = c + (1 - c) / (1 + expTerm);
            const Q = 1 - P;
            
            // Calculate derivatives for Newton-Raphson
            // First derivative: a * (P - c) / (1 - c) * (X - P)
            // Second derivative (for weighting): a² * P * Q * ((P - c) / (1 - c))²
            const pCorrection = (P - c) / (1 - c);
            const W = a * a * P * Q * pCorrection * pCorrection;
            
            sumNumerator += a * pCorrection * (isCorrect ? (1 - P) : -P);
            sumDenominator += W;
        });
        
        if (Math.abs(sumDenominator) < 0.0001) {
            console.log('Denominator too small, stopping iteration');
            break;
        }
        
        const deltaTheta = sumNumerator / sumDenominator;
        theta += deltaTheta;
        
        // Clamp theta to reasonable range
        theta = Math.max(-3, Math.min(3, theta));
        
        if (Math.abs(deltaTheta) < tolerance) {
            console.log(`Converged after ${iteration + 1} iterations`);
            break;
        }
        
        iteration++;
    }
    
    console.log(`Final θ estimate: ${theta.toFixed(3)} (after ${iteration} iterations)`);
    return theta;
}

/**
 * Check if an answer is correct for a given question
 * @param {Object} question - Question object
 * @param {*} answer - Student's answer
 * @returns {boolean} - Whether the answer is correct
 */
function checkAnswerCorrectness(question, answer) {
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
            
            // Check if all answers match
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
 * @param {number} theta - Estimated ability value
 */
function displayIRTResults(theta) {
    const irtResultElement = document.getElementById('irtResult');
    if (!irtResultElement) {
        console.warn('IRT result element not found');
        return;
    }
    
    // Interpret ability level
    const abilityLevel = interpretAbilityLevel(theta);
    const abilityDescription = getAbilityDescription(theta);
    
    // Calculate standard error (approximate)
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

/**
 * Interpret ability level based on theta value
 * @param {number} theta - Estimated ability value
 * @returns {Object} - Object with label, class, and icon
 */
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

/**
 * Get description based on ability level
 * @param {number} theta - Estimated ability value
 * @returns {string} - Description text
 */
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

/**
 * Calculate approximate standard error for the ability estimate
 * @param {number} theta - Estimated ability value
 * @returns {number} - Standard error value
 */
function calculateStandardError(theta) {
    // Approximate standard error based on test information
    // This is a simplified calculation
    const averageInformation = 2.0; // Assumed average test information
    return 1 / Math.sqrt(averageInformation);
}

// Function to retake exam
function retakeExam() {
 alert("Kesempatan ujian hanya 1 kali. Silakan cek analisis nilai Anda.");
    window.location.href = 'halamanpertama.html';
}

// Trigger AI analysis for the completed exam
// Trigger AI analysis for the completed exam
async function triggerAIAnalysis(session) {
    const aiSection = document.getElementById('aiAnalysisSection');
    const aiLoading = document.getElementById('aiAnalysisLoading');
    const aiContent = document.getElementById('aiAnalysisContent');

    try {
        if (aiSection) aiSection.style.display = 'block';
        console.log('[AI Background] Starting batch analysis for session:', examSessionId);

        // 1. Siapkan data untuk dikirim ke AI
        const answeredQuestionIds = questions.map(q => q.id);
        if (answeredQuestionIds.length === 0) return;

        const { data: answersData } = await supabase
            .from('exam_answers')
            .select('*')
            .eq('exam_session_id', examSessionId)
            .in('question_id', answeredQuestionIds);

        if (!answersData || answersData.length === 0) return;

        const questionsMap = new Map(questions.map(q => [q.id, q]));
        const payload = answersData.map(ans => ({
            answer: {
                answer_value: ans.selected_answer || ans.user_answer,
                is_correct: checkAnswerCorrectness(questionsMap.get(ans.question_id), ans.selected_answer || ans.user_answer)
            },
            question: questionsMap.get(ans.question_id)
        }));

        let analysisResult = null;

        // 2. Cek Cache atau Panggil API
        const { data: existingBatch } = await supabase
            .from('gemini_analyses')
            .select('analysis_data')
            .eq('answer_id', examSessionId)
            .maybeSingle();

        if (existingBatch) {
            analysisResult = existingBatch.analysis_data;
            console.log('[AI] Mengambil hasil dari cache database');
        } else {
            // Panggil Supabase Edge Function (melalui geminiAnalytics)
            analysisResult = await geminiAnalytics.analyzeBatchAnswers(payload);
            // Simpan ke database agar tidak panggil API terus menerus
            await geminiAnalytics.storeBatchResult(examSessionId, analysisResult);
        }

        // 3. Tampilkan Hasil ke UI (Admin Style)
        if (analysisResult) {
            renderGlobalAiAnalysis(analysisResult);
            aiLoading.style.display = 'none';
            aiContent.style.display = 'block';
        }

    } catch (error) {
        console.error('[AI Background] Error:', error);
        if (aiLoading) aiLoading.innerHTML = `<p style="color: red;"><i class="fas fa-exclamation-triangle"></i> Gagal memuat analisis AI.</p>`;
    }
}

// Fungsi helper untuk merender hasil ke HTML (Tampilan Dashboard-style)
function renderGlobalAiAnalysis(data) {
    const container = document.getElementById('aiAnalysisContent');
    if (!container) return;

    // Bersihkan kontainer
    container.innerHTML = `
        <div class="ai-summary-card" style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px;">
            <h3 style="color: #4e73df; margin-bottom: 15px;"><i class="fas fa-info-circle"></i> Ringkasan Evaluasi</h3>
            <p style="line-height: 1.6; color: #444;">${data.summary || 'Tidak ada ringkasan tersedia.'}</p>
        </div>

        <div class="ai-details-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
            <div class="detail-card" style="background: #f8fff9; border-left: 5px solid #28a745; padding: 20px; border-radius: 8px;">
                <h4 style="color: #28a745;"><i class="fas fa-check-circle"></i> Kekuatan</h4>
                <ul style="margin-top: 10px; padding-left: 20px;">
                    ${(data.strengths || []).map(s => `<li style="margin-bottom: 5px;">${s}</li>`).join('')}
                </ul>
            </div>

            <div class="detail-card" style="background: #fff8f8; border-left: 5px solid #dc3545; padding: 20px; border-radius: 8px;">
                <h4 style="color: #dc3545;"><i class="fas fa-exclamation-circle"></i> Kelemahan</h4>
                <ul style="margin-top: 10px; padding-left: 20px;">
                    ${(data.weaknesses || []).map(w => `<li style="margin-bottom: 5px;">${w}</li>`).join('')}
                </ul>
            </div>
        </div>

        <div class="ai-suggestion-card" style="margin-top: 20px; background: #f0f7ff; border-radius: 12px; padding: 25px; border: 1px dashed #4e73df;">
            <h4 style="color: #4e73df;"><i class="fas fa-lightbulb"></i> Saran Pembelajaran</h4>
            <div style="margin-top: 10px;">
                ${(data.learningSuggestions || []).map(ls => `
                    <div style="background: white; margin-bottom: 8px; padding: 10px 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                        <i class="fas fa-arrow-right" style="font-size: 0.8rem; color: #4e73df;"></i> ${ls}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Render ulang MathJax/KaTeX jika ada rumus dalam feedback AI
    if (window.renderMathInElement) {
        renderMathInElement(container, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
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