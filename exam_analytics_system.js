// exam_analytics_system.js - Sistem Analytics Lengkap untuk Ujian TKA
// File ini berisi semua fungsi untuk menyimpan jawaban ujian dan mengirim ke analytics admin

import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';

// Import adaptive learning components
import {
    learningPathEngine,
    updatePathBasedOnPerformance,
    getStudentTracker,
    generatePersonalizedPath
} from './adaptive_learning_engine.js';

import {
    conceptProgressTracker,
    trackConceptProgress,
    identifySkillGaps
} from './progress_tracking.js';

import {
    realtimeAssessmentEngine,
    startAssessmentSession,
    assessUnderstanding,
    provideImmediateFeedback,
    calculateEngagementScore,
    endAssessmentSession
} from './realtime_assessment.js';

// ==========================================
// BAGIAN 1: FUNGSI UNTUK UJIAN (ujian.js)
// ==========================================

// Update student analytics setelah ujian selesai
export async function updateStudentAnalyticsAfterExam(questions, answers, examSessionId) {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            console.warn('Cannot update analytics: user not authenticated');
            return;
        }

        const userId = result.user.id;

        // Hitung performa dari ujian saat ini
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

            // Track performa per bab
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

        // Siapkan data skill radar
        const skillRadarData = Object.keys(chapterPerformance).map(chapter => ({
            skill: chapter,
            level: Math.round((chapterPerformance[chapter].correct / chapterPerformance[chapter].total) * 100)
        }));

        // Update atau insert record analytics
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

        // Track concept progress for adaptive learning
        await trackExamConceptsProgress(userId, questions, answers, examSessionId);

        // Update learning path based on exam performance
        await updateLearningPathFromExam(userId, chapterPerformance, masteryLevel);

        console.log('Student analytics updated after exam completion');

    } catch (error) {
        console.error('Error updating student analytics after exam:', error);
    }
}

// Track concept progress from exam answers
async function trackExamConceptsProgress(userId, questions, answers, examSessionId) {
    try {
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = answers[i];

            if (!answer || !question.concept_id) continue;

            // Determine if answer is correct
            let isCorrect = false;
            if (question.question_type === 'PGK MCMA') {
                const selectedAnswers = answer.split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
            } else {
                isCorrect = answer === question.correct_answer;
            }

            // Calculate performance score
            const performanceScore = isCorrect ? 1.0 : 0.0;

            // Estimate time spent (simplified - could be enhanced with actual timing)
            const timeSpent = question.estimated_time || 60; // Default 1 minute per question

            // Track concept progress
            await trackConceptProgress(userId, question.concept_id, {
                performanceScore: performanceScore,
                timeSpentSeconds: timeSpent,
                difficultyLevel: question.scoring_weight || 1,
                sessionId: examSessionId,
                metadata: {
                    questionType: question.question_type,
                    chapter: question.chapter,
                    subChapter: question.sub_chapter,
                    examSessionId: examSessionId
                }
            });
        }

        console.log('Concept progress tracked from exam answers');

    } catch (error) {
        console.error('Error tracking exam concepts progress:', error);
    }
}

// Update learning path based on exam performance
async function updateLearningPathFromExam(userId, chapterPerformance, overallMastery) {
    try {
        // Update path for each concept/chapter performed in exam
        for (const [chapter, performance] of Object.entries(chapterPerformance)) {
            const conceptPerformance = performance.correct / performance.total;

            // Map chapter to concept ID (simplified mapping)
            const conceptId = chapter.toLowerCase().replace(/\s+/g, '_');

            // Update learning path based on performance
            await updatePathBasedOnPerformance(userId, conceptId, conceptPerformance);
        }

        // Update overall performance
        await updatePathBasedOnPerformance(userId, 'overall_performance', overallMastery);

        console.log('Learning path updated from exam performance');

    } catch (error) {
        console.error('Error updating learning path from exam:', error);
    }
}

// ==========================================
// BAGIAN 2: FUNGSI UNTUK ADMIN ANALYTICS (admin.js)
// ==========================================

// Update student analytics dari semua data ujian
export async function updateStudentAnalyticsFromExams() {
    try {
        console.log('Updating student analytics from exam data...');

        // Ambil semua sesi ujian yang completed
        let examSessions = [];
        try {
            const { data: sessions, error: sessionsError } = await supabase
                .from('exam_sessions')
                .select('user_id, total_score, completed_at, status')
                .eq('status', 'completed')
                .order('completed_at', { ascending: false });

            if (sessionsError) {
                console.error('Error loading exam sessions:', sessionsError);
                return;
            }

            examSessions = sessions || [];
        } catch (error) {
            console.log('Exam sessions table may not exist yet');
            return;
        }

        if (!examSessions || examSessions.length === 0) {
            console.log('No completed exam sessions found');
            return;
        }

        // Kelompokkan sesi berdasarkan user dan hitung analytics
        const userAnalytics = {};

        for (const session of examSessions) {
            const userId = session.user_id;

            if (!userAnalytics[userId]) {
                userAnalytics[userId] = {
                    user_id: userId,
                    total_exams: 0,
                    total_score: 0,
                    average_score: 0,
                    chapter_performance: {}
                };
            }

            userAnalytics[userId].total_exams++;
            userAnalytics[userId].total_score += session.total_score || 0;
        }

        // Hitung rata-rata skor dan performa per bab
        for (const userId of Object.keys(userAnalytics)) {
            const analytics = userAnalytics[userId];
            analytics.average_score = analytics.total_score / analytics.total_exams;

            // Dapatkan semua session ID untuk user ini
            const userSessionIds = examSessions
                .filter(s => s.user_id === userId)
                .map(s => s.id);

            // Dapatkan performa detail per bab untuk semua sesi ujian user ini
            let userAnswers = [];
            try {
                const { data: answers, error: answersError } = await supabase
                    .from('exam_answers')
                    .select(`
                        selected_answer,
                        is_correct,
                        questions!inner (
                            chapter,
                            sub_chapter,
                            scoring_weight
                        )
                    `)
                    .in('exam_session_id', userSessionIds);

                if (!answersError && answers) {
                    userAnswers = answers;
                }
            } catch (error) {
                console.log('Exam answers table may not exist yet for user:', userId);
                userAnswers = [];
            }

            if (userAnswers && userAnswers.length > 0) {
                // Kelompokkan berdasarkan bab
                const chapterStats = {};

                userAnswers.forEach(answer => {
                    const chapter = answer.questions?.chapter;
                    if (chapter) {
                        if (!chapterStats[chapter]) {
                            chapterStats[chapter] = {
                                total_questions: 0,
                                correct_answers: 0,
                                total_score: 0
                            };
                        }

                        chapterStats[chapter].total_questions++;
                        if (answer.is_correct) {
                            chapterStats[chapter].correct_answers++;
                            chapterStats[chapter].total_score += answer.questions?.scoring_weight || 1;
                        }
                    }
                });

                // Konversi ke format analytics
                analytics.chapter_performance = Object.keys(chapterStats).map(chapter => ({
                    chapter: chapter,
                    sub_chapter: chapter, // Menggunakan chapter sebagai sub_chapter untuk kesederhanaan
                    total_questions_attempted: chapterStats[chapter].total_questions,
                    correct_answers: chapterStats[chapter].correct_answers,
                    mastery_level: chapterStats[chapter].correct_answers / chapterStats[chapter].total_questions,
                    skill_radar_data: [{
                        skill: chapter,
                        level: Math.round((chapterStats[chapter].correct_answers / chapterStats[chapter].total_questions) * 100)
                    }]
                }));
            } else {
                // No answers data available
                analytics.chapter_performance = [];
            }
        }

        // Simpan data analytics
        const analyticsData = Object.values(userAnalytics);
        console.log('Calculated analytics data:', analyticsData);

        // Upsert ke tabel student_analytics
        for (const analytics of analyticsData) {
            await supabase
                .from('student_analytics')
                .upsert({
                    user_id: analytics.user_id,
                    chapter: 'Overall', // Performa keseluruhan
                    sub_chapter: 'All Chapters',
                    total_questions_attempted: analytics.total_exams * 10, // Asumsi 10 soal per ujian
                    correct_answers: Math.round(analytics.average_score),
                    mastery_level: analytics.average_score / 100, // Konversi ke skala 0-1
                    skill_radar_data: analytics.chapter_performance?.flatMap(cp => cp.skill_radar_data) || [],
                    last_updated: new Date().toISOString()
                });
        }

        console.log('Student analytics updated from exam data');

    } catch (error) {
        console.error('Error updating student analytics from exams:', error);
    }
}

// ==========================================
// BAGIAN 3: CONTOH PENGGUNAAN
// ==========================================

/*
// CONTOH PENGGUNAAN DI UJIAN.JS:

// Setelah ujian selesai, panggil:
await updateStudentAnalyticsAfterExam(questions, answers, examSessionId);

// CONTOH PENGGUNAAN DI ADMIN.JS:

// Saat memuat analytics, panggil:
await updateStudentAnalyticsFromExams();

// Kemudian load data analytics:
const { data: analytics } = await supabase
    .from('student_analytics')
    .select('*')
    .order('last_updated', { ascending: false });
*/

// ==========================================
// BAGIAN 4: FUNGSI PEMBANTU
// ==========================================

// Hitung skor berdasarkan jenis soal
export function calculateScore(questions, answers) {
    let totalScore = 0;

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const answer = answers[i];

        if (!answer) continue;

        let isCorrect = false;

        switch (question.question_type) {
            case 'PGK MCMA':
                const mcmaSelectedAnswers = answer.split(',').sort();
                const correctAnswers = Array.isArray(question.correct_answers)
                    ? question.correct_answers.sort()
                    : (question.correct_answers || '').split(',').sort();
                isCorrect = JSON.stringify(mcmaSelectedAnswers) === JSON.stringify(correctAnswers);
                break;

            case 'PGK Kategori':
                const categorySelectedAnswers = typeof answer === 'string' ? JSON.parse(answer) : answer;
                const correctMapping = typeof question.category_mapping === 'string'
                    ? JSON.parse(question.category_mapping)
                    : question.category_mapping;

                let allCorrect = true;
                for (const [stmtIndex, isTrue] of Object.entries(categorySelectedAnswers || {})) {
                    if (correctMapping[stmtIndex] !== isTrue) {
                        allCorrect = false;
                        break;
                    }
                }

                for (const [stmtIndex, shouldBeTrue] of Object.entries(correctMapping || {})) {
                    if (shouldBeTrue && categorySelectedAnswers[stmtIndex] !== true) {
                        allCorrect = false;
                        break;
                    }
                }

                isCorrect = allCorrect;
                break;

            default:
                isCorrect = answer === question.correct_answer;
        }

        if (isCorrect) {
            totalScore += question.scoring_weight || 1;
        }
    }

    return totalScore;
}

// Generate rekomendasi AI berdasarkan performa
export function generateAIRecommendations(analyticsData) {
    let recommendations = [];

    if (analyticsData.length === 0) {
        recommendations.push("Belum ada data siswa untuk dianalisis.");
    } else {
        const avgMastery = analyticsData.reduce((sum, a) => sum + (a.mastery_level || 0), 0) / analyticsData.length;

        if (avgMastery < 0.5) {
            recommendations.push("📚 Siswa perlu latihan intensif di semua bab matematika.");
            recommendations.push("🎯 Fokus pada konsep dasar sebelum lanjut ke materi kompleks.");
        } else if (avgMastery < 0.7) {
            recommendations.push("🔄 Siswa perlu latihan tambahan di bab yang masih lemah.");
            recommendations.push("📈 Tingkatkan pemahaman konsep melalui latihan soal.");
        } else {
            recommendations.push("✅ Pertahankan performa yang baik!");
            recommendations.push("🚀 Tantang siswa dengan soal-soal yang lebih kompleks.");
        }

        // Tambahkan rekomendasi spesifik berdasarkan area lemah
        const weakAreas = analyticsData.filter(a => (a.mastery_level || 0) < 0.6);
        if (weakAreas.length > 0) {
            recommendations.push(`🎯 Perhatian khusus diperlukan untuk ${weakAreas.length} siswa yang membutuhkan bantuan tambahan.`);
        }
    }

    return recommendations;
}

// ==========================================
// BAGIAN 5: ANALYTICS PER SISWA DETAIL
// ==========================================

// Dapatkan analytics detail untuk satu siswa
export async function getDetailedStudentAnalytics(userId) {
    try {
        console.log('Getting detailed analytics for user:', userId);

        // Ambil data profil siswa
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.warn('Profile not found for user:', userId);
        }

        // Ambil semua sesi ujian siswa
        let examSessions = [];
        try {
            const { data: sessions, error: sessionsError } = await supabase
                .from('exam_sessions')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'completed')
                .order('completed_at', { ascending: false });

            if (sessionsError) {
                console.error('Error loading exam sessions:', sessionsError);
                // Return empty data if table doesn't exist
                return {
                    student: profile || { id: userId, nama_lengkap: 'Unknown' },
                    exams: [],
                    summary: {
                        totalExams: 0,
                        averageScore: 0,
                        highestScore: 0,
                        lowestScore: 0,
                        totalTimeSpent: 0,
                        passRate: 0
                    },
                    chapterPerformance: [],
                    questionDetails: []
                };
            }

            examSessions = sessions || [];
        } catch (error) {
            console.log('Exam sessions table may not exist yet');
            return {
                student: profile || { id: userId, nama_lengkap: 'Unknown' },
                exams: [],
                summary: {
                    totalExams: 0,
                    averageScore: 0,
                    highestScore: 0,
                    lowestScore: 0,
                    totalTimeSpent: 0,
                    passRate: 0
                },
                chapterPerformance: [],
                questionDetails: []
            };
        }

        if (!examSessions || examSessions.length === 0) {
            return {
                student: profile || { id: userId, nama_lengkap: 'Unknown' },
                exams: [],
                summary: {
                    totalExams: 0,
                    averageScore: 0,
                    highestScore: 0,
                    lowestScore: 0,
                    totalTimeSpent: 0,
                    passRate: 0
                },
                chapterPerformance: [],
                questionDetails: []
            };
        }

        // Ambil detail jawaban untuk setiap sesi
        const detailedExams = [];
        const allQuestionDetails = [];

        for (const session of examSessions) {
            try {
                const { data: answers, error: answersError } = await supabase
                    .from('exam_answers')
                    .select(`
                        selected_answer,
                        is_correct,
                        time_taken_seconds,
                        questions!inner (
                            id,
                            question_text,
                            question_type,
                            chapter,
                            sub_chapter,
                            correct_answer,
                            scoring_weight
                        )
                    `)
                    .eq('exam_session_id', session.id)
                    .order('questions.id');

                if (answersError) {
                    console.error('Error loading answers for session:', session.id, answersError);
                    continue;
                }

                // Process answers...
                const sessionStats = {
                    sessionId: session.id,
                    date: session.completed_at,
                    totalQuestions: answers?.length || 0,
                    correctAnswers: answers?.filter(a => a.is_correct).length || 0,
                    totalScore: session.total_score || 0,
                    timeSpent: session.total_time_seconds || 0,
                    isPassed: session.is_passed || false
                };

                const questionDetails = answers?.map(answer => ({
                    questionId: answer.questions?.id,
                    questionText: answer.questions?.question_text?.substring(0, 100) + '...',
                    questionType: answer.questions?.question_type,
                    chapter: answer.questions?.chapter,
                    subChapter: answer.questions?.sub_chapter,
                    selectedAnswer: answer.selected_answer,
                    correctAnswer: answer.questions?.correct_answer,
                    isCorrect: answer.is_correct,
                    timeTaken: answer.time_taken_seconds,
                    score: answer.is_correct ? (answer.questions?.scoring_weight || 1) : 0
                })) || [];

                detailedExams.push(sessionStats);
                allQuestionDetails.push(...questionDetails);
            } catch (error) {
                console.error('Error processing answers for session:', session.id, error);
                continue;
            }

            // Hitung statistik per sesi
            const sessionStats = {
                sessionId: session.id,
                date: session.completed_at,
                totalQuestions: answers?.length || 0,
                correctAnswers: answers?.filter(a => a.is_correct).length || 0,
                totalScore: session.total_score || 0,
                timeSpent: session.total_time_seconds || 0,
                isPassed: session.is_passed || false
            };

            // Detail per soal
            const questionDetails = answers?.map(answer => ({
                questionId: answer.questions?.id,
                questionText: answer.questions?.question_text?.substring(0, 100) + '...',
                questionType: answer.questions?.question_type,
                chapter: answer.questions?.chapter,
                subChapter: answer.questions?.sub_chapter,
                selectedAnswer: answer.selected_answer,
                correctAnswer: answer.questions?.correct_answer,
                isCorrect: answer.is_correct,
                timeTaken: answer.time_taken_seconds,
                score: answer.is_correct ? (answer.questions?.scoring_weight || 1) : 0
            })) || [];

            detailedExams.push(sessionStats);
            allQuestionDetails.push(...questionDetails);
        }

        // Hitung performa per bab
        const chapterStats = {};
        allQuestionDetails.forEach(q => {
            const chapter = q.chapter;
            if (chapter) {
                if (!chapterStats[chapter]) {
                    chapterStats[chapter] = {
                        chapter,
                        totalQuestions: 0,
                        correctAnswers: 0,
                        totalScore: 0,
                        averageTime: 0,
                        totalTime: 0
                    };
                }
                chapterStats[chapter].totalQuestions++;
                chapterStats[chapter].totalTime += q.timeTaken || 0;
                if (q.isCorrect) {
                    chapterStats[chapter].correctAnswers++;
                    chapterStats[chapter].totalScore += q.score;
                }
            }
        });

        // Hitung rata-rata dan persentase
        Object.values(chapterStats).forEach(stats => {
            stats.averageTime = stats.totalTime / stats.totalQuestions;
            stats.accuracy = (stats.correctAnswers / stats.totalQuestions) * 100;
        });

        // Hitung summary keseluruhan
        const totalExams = detailedExams.length;
        const totalScore = detailedExams.reduce((sum, exam) => sum + exam.totalScore, 0);
        const averageScore = totalExams > 0 ? totalScore / totalExams : 0;
        const scores = detailedExams.map(exam => exam.totalScore);
        const highestScore = Math.max(...scores);
        const lowestScore = Math.min(...scores);
        const totalTimeSpent = detailedExams.reduce((sum, exam) => sum + exam.timeSpent, 0);
        const passedExams = detailedExams.filter(exam => exam.isPassed).length;
        const passRate = totalExams > 0 ? (passedExams / totalExams) * 100 : 0;

        return {
            student: profile || { id: userId, nama_lengkap: 'Unknown' },
            exams: detailedExams,
            summary: {
                totalExams,
                averageScore: Math.round(averageScore),
                highestScore,
                lowestScore,
                totalTimeSpent,
                passRate: Math.round(passRate)
            },
            chapterPerformance: Object.values(chapterStats),
            questionDetails: allQuestionDetails
        };

    } catch (error) {
        console.error('Error getting detailed student analytics:', error);
        return null;
    }
}

// Export data analytics ke Excel
export function exportStudentAnalyticsToExcel(studentAnalytics) {
    try {
        // Siapkan data untuk Excel
        const excelData = [];

        // Header informasi siswa
        excelData.push(['INFORMASI SISWA']);
        excelData.push(['Nama', studentAnalytics.student.nama_lengkap || 'Unknown']);
        excelData.push(['Email', studentAnalytics.student.email || 'N/A']);
        excelData.push(['Sekolah', studentAnalytics.student.school || 'N/A']);
        excelData.push(['']);

        // Summary statistik
        excelData.push(['RINGKASAN STATISTIK']);
        excelData.push(['Total Ujian', studentAnalytics.summary.totalExams]);
        excelData.push(['Rata-rata Skor', studentAnalytics.summary.averageScore]);
        excelData.push(['Skor Tertinggi', studentAnalytics.summary.highestScore]);
        excelData.push(['Skor Terendah', studentAnalytics.summary.lowestScore]);
        excelData.push(['Total Waktu (detik)', studentAnalytics.summary.totalTimeSpent]);
        excelData.push(['Tingkat Kelulusan (%)', studentAnalytics.summary.passRate]);
        excelData.push(['']);

        // Detail ujian
        excelData.push(['DETAIL UJIAN']);
        excelData.push(['Tanggal', 'Total Soal', 'Jawaban Benar', 'Skor', 'Waktu (detik)', 'Status']);
        studentAnalytics.exams.forEach(exam => {
            excelData.push([
                new Date(exam.date).toLocaleDateString('id-ID'),
                exam.totalQuestions,
                exam.correctAnswers,
                exam.totalScore,
                exam.timeSpent,
                exam.isPassed ? 'LULUS' : 'TIDAK LULUS'
            ]);
        });
        excelData.push(['']);

        // Performa per bab
        excelData.push(['PERFORMA PER BAB']);
        excelData.push(['Bab', 'Total Soal', 'Jawaban Benar', 'Akurasi (%)', 'Rata-rata Waktu (detik)']);
        studentAnalytics.chapterPerformance.forEach(chapter => {
            excelData.push([
                chapter.chapter,
                chapter.totalQuestions,
                chapter.correctAnswers,
                Math.round(chapter.accuracy),
                Math.round(chapter.averageTime)
            ]);
        });
        excelData.push(['']);

        // Detail soal (jika diperlukan)
        if (studentAnalytics.questionDetails.length > 0) {
            excelData.push(['DETAIL SOAL PER UJIAN']);
            excelData.push(['Bab', 'Sub Bab', 'Tipe Soal', 'Jawaban Dipilih', 'Jawaban Benar', 'Benar/Salah', 'Waktu (detik)', 'Skor']);
            studentAnalytics.questionDetails.forEach(question => {
                excelData.push([
                    question.chapter,
                    question.subChapter,
                    question.questionType,
                    question.selectedAnswer,
                    question.correctAnswer,
                    question.isCorrect ? 'BENAR' : 'SALAH',
                    question.timeTaken,
                    question.score
                ]);
            });
        }

        // Convert ke CSV format (karena JavaScript tidak punya Excel export native)
        const csvContent = excelData.map(row =>
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');

        // Download sebagai file CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `analytics_${studentAnalytics.student.nama_lengkap || 'siswa'}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('Analytics exported to Excel (CSV format)');
        return true;

    } catch (error) {
        console.error('Error exporting analytics to Excel:', error);
        return false;
    }
}

// Dapatkan daftar semua siswa dengan analytics
export async function getAllStudentsAnalytics() {
    try {
        // Ambil semua user yang sudah mengerjakan ujian
        let examSessions = [];
        try {
            const { data: sessions, error } = await supabase
                .from('exam_sessions')
                .select('user_id')
                .eq('status', 'completed');

            if (error) {
                console.error('Error loading exam sessions:', error);
                return [];
            }

            examSessions = sessions || [];
        } catch (error) {
            console.log('Exam sessions table may not exist yet');
            return [];
        }

        // Dapatkan unique user IDs
        const uniqueUserIds = [...new Set(examSessions.map(s => s.user_id))];

        // Ambil profil siswa
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, nama_lengkap, email, school')
            .in('id', uniqueUserIds);

        if (profilesError) {
            console.warn('Error loading profiles:', profilesError);
        }

        // Untuk setiap siswa, ambil summary analytics
        const studentsAnalytics = [];

        for (const userId of uniqueUserIds) {
            const profile = profiles?.find(p => p.id === userId) || { id: userId, nama_lengkap: 'Unknown' };

            // Hitung summary cepat
            const userSessions = examSessions.filter(s => s.user_id === userId);
            const totalExams = userSessions.length;

            // Ambil skor rata-rata dari student_analytics jika ada
            const { data: analytics } = await supabase
                .from('student_analytics')
                .select('mastery_level')
                .eq('user_id', userId)
                .eq('chapter', 'Overall')
                .order('last_updated', { ascending: false })
                .limit(1);

            const averageMastery = analytics?.[0]?.mastery_level || 0;

            studentsAnalytics.push({
                id: userId,
                nama_lengkap: profile.nama_lengkap,
                email: profile.email,
                school: profile.school,
                totalExams,
                averageMastery: Math.round(averageMastery * 100)
            });
        }

        return studentsAnalytics.sort((a, b) => b.averageMastery - a.averageMastery);

    } catch (error) {
        console.error('Error getting all students analytics:', error);
        return [];
    }
}

// ==========================================
// REAL-TIME ASSESSMENT INTEGRATION
// ==========================================

// Start real-time assessment session for exam
export async function startExamAssessmentSession(userId, examSessionId, conceptId = 'exam_assessment') {
    try {
        const sessionId = await startAssessmentSession(userId, conceptId);
        if (sessionId) {
            // Link assessment session to exam session
            await supabase
                .from('assessment_sessions')
                .update({ exam_session_id: examSessionId })
                .eq('id', sessionId);

            console.log('Real-time assessment session started for exam:', sessionId);
            return sessionId;
        }
        return null;
    } catch (error) {
        console.error('Error starting exam assessment session:', error);
        return null;
    }
}

// Track real-time understanding during exam
export async function trackExamUnderstanding(userId, questionId, response, timeSpent, assessmentSessionId) {
    try {
        // Assess understanding using real-time assessment engine
        const assessmentResult = await assessUnderstanding(userId, 'exam_assessment', {
            questionId: questionId,
            selectedAnswer: response,
            timeSpent: timeSpent
        });

        if (assessmentResult) {
            // Provide immediate feedback if needed
            const feedback = provideImmediateFeedback(userId, questionId, response);

            return {
                assessment: assessmentResult,
                feedback: feedback,
                knowledgeState: assessmentResult.knowledgeState,
                performance: assessmentResult.performance
            };
        }

        return null;
    } catch (error) {
        console.error('Error tracking exam understanding:', error);
        return null;
    }
}

// End exam assessment session
export async function endExamAssessmentSession(assessmentSessionId) {
    try {
        const result = await endAssessmentSession(assessmentSessionId);
        console.log('Exam assessment session ended:', result);
        return result;
    } catch (error) {
        console.error('Error ending exam assessment session:', error);
        return null;
    }
}

// Get exam engagement metrics
export async function getExamEngagementMetrics(userId, examSessionId) {
    try {
        const engagement = calculateEngagementScore(userId);
        return engagement;
    } catch (error) {
        console.error('Error getting exam engagement metrics:', error);
        return { score: 0, metrics: {} };
    }
}

// ==========================================
// ADAPTIVE EXAM FUNCTIONS
// ==========================================

// Generate adaptive question sequence for exam
export async function generateAdaptiveExamQuestions(userId, availableQuestions, targetDifficulty = 'adaptive') {
    try {
        // Start assessment session for exam
        const assessmentSessionId = await startAssessmentSession(userId, 'exam_adaptive');

        if (!assessmentSessionId) {
            // Fallback to standard question selection
            return availableQuestions.slice(0, 10);
        }

        const selectedQuestions = [];
        const askedQuestions = [];

        // Select questions adaptively
        for (let i = 0; i < Math.min(10, availableQuestions.length); i++) {
            const nextQuestion = await getNextAdaptiveQuestion(userId, 'exam_adaptive');

            if (nextQuestion && nextQuestion.questionId) {
                // Find matching question from available questions
                const question = availableQuestions.find(q => q.id === nextQuestion.questionId);
                if (question && !askedQuestions.includes(question.id)) {
                    selectedQuestions.push(question);
                    askedQuestions.push(question.id);
                } else {
                    // Fallback to random selection if adaptive selection fails
                    const remaining = availableQuestions.filter(q => !askedQuestions.includes(q.id));
                    if (remaining.length > 0) {
                        const randomQuestion = remaining[Math.floor(Math.random() * remaining.length)];
                        selectedQuestions.push(randomQuestion);
                        askedQuestions.push(randomQuestion.id);
                    }
                }
            } else {
                // Fallback to random selection
                const remaining = availableQuestions.filter(q => !askedQuestions.includes(q.id));
                if (remaining.length > 0) {
                    const randomQuestion = remaining[Math.floor(Math.random() * remaining.length)];
                    selectedQuestions.push(randomQuestion);
                    askedQuestions.push(randomQuestion.id);
                }
            }
        }

        return selectedQuestions;

    } catch (error) {
        console.error('Error generating adaptive exam questions:', error);
        // Fallback to random selection
        return availableQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    }
}

// Update exam difficulty based on performance
export async function updateExamDifficulty(userId, currentPerformance, assessmentSessionId) {
    try {
        // Assess current understanding
        const assessment = await assessUnderstanding(userId, 'exam_adaptive', {
            questionId: 'performance_check',
            selectedAnswer: currentPerformance.toString(),
            timeSpent: 0
        });

        if (assessment) {
            // Adjust difficulty based on knowledge state
            const knowledgeLevel = assessment.knowledgeState;
            let newDifficulty = 'medium'; // Default

            if (knowledgeLevel > 0.8) {
                newDifficulty = 'hard';
            } else if (knowledgeLevel < 0.4) {
                newDifficulty = 'easy';
            }

            return {
                newDifficulty: newDifficulty,
                knowledgeLevel: knowledgeLevel,
                recommendation: knowledgeLevel > 0.8 ? 'Increase challenge' :
                               knowledgeLevel < 0.4 ? 'Provide easier questions' :
                               'Maintain current difficulty'
            };
        }

        return { newDifficulty: 'medium', knowledgeLevel: 0.5, recommendation: 'Continue with current difficulty' };

    } catch (error) {
        console.error('Error updating exam difficulty:', error);
        return { newDifficulty: 'medium', knowledgeLevel: 0.5, recommendation: 'Continue with current difficulty' };
    }
}

// ==========================================
// INTEGRATION UTILITIES
// ==========================================

// Get mastery levels for a student (local implementation)
async function getStudentMasteryLevels(userId) {
    try {
        const tracker = getStudentTracker(userId);
        const mastered = tracker.getMasteredConcepts();
        const weak = tracker.getWeakConcepts();

        return {
            masteredConcepts: Array.from(mastered),
            weakConcepts: weak,
            overallMastery: tracker.getMastery('overall_performance') || 0
        };
    } catch (error) {
        console.error('Error getting student mastery levels:', error);
        return { masteredConcepts: [], weakConcepts: [], overallMastery: 0 };
    }
}

// Get realtime assessment data (local implementation)
async function getRealtimeAssessmentData(userId, limit = 5) {
    try {
        const { data, error } = await supabase
            .from('assessment_sessions')
            .select('*')
            .eq('user_id', userId)
            .order('end_time', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting realtime assessment data:', error);
        return [];
    }
}

// Enhanced exam analytics with adaptive learning data
export async function getEnhancedExamAnalytics(userId, examSessionId) {
    try {
        // Get basic exam analytics
        const basicAnalytics = await getDetailedStudentAnalytics(userId);

        // Add adaptive learning metrics
        const masteryLevels = await getStudentMasteryLevels(userId);
        const skillGaps = await identifySkillGaps(userId);
        const learningPath = await generatePersonalizedPath(userId);

        // Get assessment session data
        const assessmentData = await getRealtimeAssessmentData(userId, 5);

        return {
            ...basicAnalytics,
            adaptiveMetrics: {
                masteryLevels: masteryLevels,
                skillGaps: skillGaps,
                learningPath: learningPath,
                assessmentSessions: assessmentData
            }
        };

    } catch (error) {
        console.error('Error getting enhanced exam analytics:', error);
        return await getDetailedStudentAnalytics(userId);
    }
}

// All functions are exported as named exports above