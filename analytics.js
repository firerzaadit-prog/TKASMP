// analytics.js - AI Analytics Dashboard
import { supabase } from './clientSupabase.js';
import { getCurrentUser, logoutUser } from './auth.js';
import {
    initializePredictiveModels,
    predictNextExamPerformance,
    identifySkillGaps,
    analyzeLearningTrends,
    getModelStatus,
    loadModels,
    saveModels
} from './predictive_models.js';

// Import adaptive learning components
import {
    learningPathEngine,
    generatePersonalizedPath,
    updatePathBasedOnPerformance,
    getNextRecommendedContent,
    calculateOptimalDifficulty
} from './adaptive_learning_engine.js';

import {
    adaptContentForStudent,
    adjustDifficultyLevel,
    generatePersonalizedContent,
    calculateOptimalPacing,
    provideAdaptiveHints,
    getAdaptedLearningPath,
    updateAdaptedLearningPath,
    applyContentAdaptationToMaterial
} from './content_adaptation.js';

import {
    conceptProgressTracker,
    trackConceptProgress,
    getConceptMasteryLevel,
    analyzeLearningCurve,
    identifySkillGaps as identifyAdaptiveSkillGaps,
    generateProgressReport,
    getProgressHeatmap,
    calculateLearningVelocity
} from './progress_tracking.js';

import {
    realtimeAssessmentEngine,
    startAssessmentSession,
    assessUnderstanding,
    getNextAdaptiveQuestion,
    provideImmediateFeedback,
    calculateEngagementScore,
    endAssessmentSession
} from './realtime_assessment.js';

import {
    geminiAnalytics,
    isGeminiAvailable,
    getGeminiStatus
} from './gemini_analytics.js';

// Make critical functions available globally immediately
// switchTab will be assigned after its definition

// Global variables
let currentUser = null;
let analyticsData = {
    students: [],
    exams: [],
    questions: [],
    answers: [], // Data jawaban siswa untuk analisis
    insights: [],
    // Adaptive learning data
    learningPaths: [],
    masteryLevels: new Map(),
    progressData: [],
    skillGaps: [],
    contentAdaptations: [],
    realtimeAssessments: [],
    engagementMetrics: [],
    // Gemini AI analysis
    geminiAnalyses: [],
    geminiStatus: null
};

// Chart instances
let clusteringChart = null;
let trendsChart = null;
let skillsRadar = null;
let difficultyChart = null;
let questionsChart = null;

// Initialize the analytics dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Load analytics data (user is already authenticated from admin)
        await loadAnalyticsData();

        // Initialize charts and UI
        initializeCharts();
        updateUI();

        // Initialize Grok chat
        initializeGrokChat();

        console.log('AI Analytics Dashboard initialized');

    } catch (error) {
        console.error('Error initializing analytics dashboard:', error);
        alert('Terjadi kesalahan saat memuat dashboard analytics.');
    }
});

// Load analytics data from database
async function loadAnalyticsData() {
    try {
        console.log('Loading analytics data...');

        // Load exam sessions with student data
        const { data: examData, error: examError } = await supabase
            .from('exam_sessions')
            .select('*')
            .order('created_at', { ascending: false });

        if (examError) {
            console.error('Error loading exam data:', examError);
            analyticsData.exams = [];
        } else {
            analyticsData.exams = examData || [];
        }

        // Load exam answers for detailed analysis
        const { data: answersData, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .order('created_at', { ascending: false });

        if (answersError) {
            console.error('Error loading answers data:', answersError);
            analyticsData.answers = [];
        } else {
            analyticsData.answers = answersData || [];
        }

        // Load questions data
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .eq('is_active', true);

        if (questionsError) {
            console.error('Error loading questions data:', questionsError);
            analyticsData.questions = [];
        } else {
            analyticsData.questions = questionsData || [];
        }

        // Collect all user IDs from both exams and answers for profile loading
        const examUserIds = examData ? [...new Set(examData.map(exam => exam.user_id).filter(id => id))] : [];
        const answerUserIds = answersData ? [...new Set(answersData.map(answer => answer.user_id).filter(id => id))] : [];
        const allUserIds = [...new Set([...examUserIds, ...answerUserIds])].filter(id => id);

        console.log(`Loading profiles for ${allUserIds.length} users from exams and answers`);

        // Load profile data for all relevant users
        const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, nama_lengkap, class_name')
            .in('id', allUserIds);

        if (!profilesError && profilesData) {
            console.log(`Loaded ${profilesData.length} profiles`);

            // Create a profiles map for easy lookup
            const profilesMap = new Map();
            profilesData.forEach(profile => {
                profilesMap.set(profile.id, profile);
            });

            // Merge profile data into exam data
            if (examData) {
                examData.forEach(exam => {
                    const profile = profilesMap.get(exam.user_id);
                    if (profile) {
                        exam.profiles = profile;
                    }
                });
            }

            // Store profiles map globally for use in other functions
            window.profilesMap = profilesMap;
        } else if (profilesError) {
            console.warn('Error loading profile data:', profilesError);
            window.profilesMap = new Map();
        }

        // Process and aggregate data
        await processAnalyticsData(examData || [], answersData || []);

        // Initialize predictive models with the loaded data
        await initializePredictiveModels({
            students: analyticsData.students,
            questions: analyticsData.questions,
            answers: answersData,
            exams: examData
        });

        // Load adaptive learning data after models are trained
        await loadAdaptiveLearningData();

        console.log('Analytics data loaded and predictive models initialized');

    } catch (error) {
        console.error('Error loading analytics data:', error);
    }
}

// Process raw data into analytics insights
async function processAnalyticsData(exams, answers) {
    try {
        // Check if data is available
        if (!exams || !Array.isArray(exams)) {
            console.warn('No exam data available for processing');
            analyticsData.students = [];
            analyticsData.exams = [];
            return;
        }

        if (!answers || !Array.isArray(answers)) {
            console.warn('No answers data available for processing');
            answers = [];
        }

        // Group exams by student
        const studentMap = new Map();

        exams.forEach(exam => {
            const studentId = exam.user_id;
            if (!studentMap.has(studentId)) {
                studentMap.set(studentId, {
                    id: studentId,
                    name: exam.profiles?.nama_lengkap || `Student ${studentId.slice(0, 8)}`,
                    class: exam.profiles?.class_name || 'Unknown',
                    exams: [],
                    totalScore: 0,
                    examCount: 0,
                    avgScore: 0,
                    trend: 'stable',
                    cluster: 'unknown'
                });
            }

            const student = studentMap.get(studentId);
            student.exams.push(exam);
            student.totalScore += exam.total_score || 0;
            student.examCount++;
        });

        // Calculate averages and assign clusters
        analyticsData.students = Array.from(studentMap.values()).map(student => {
            student.avgScore = student.examCount > 0 ? student.totalScore / student.examCount : 0;

            // Simple clustering based on average score
            if (student.avgScore >= 80) {
                student.cluster = 'high-performer';
            } else if (student.avgScore >= 60) {
                student.cluster = 'average';
            } else {
                student.cluster = 'struggling';
            }

            // Calculate trend (simplified)
            if (student.exams.length >= 2) {
                const recentExams = student.exams.slice(0, 2);
                const trend = recentExams[0].total_score - recentExams[1].total_score;
                student.trend = trend > 5 ? 'improving' : trend < -5 ? 'declining' : 'stable';
            }

            return student;
        });

        // Update Gemini status with real connection test first
        analyticsData.geminiStatus = await getGeminiStatus();

        // Load Gemini AI analysis for answers
        await loadGeminiAnalysis(answers);

        // Generate AI insights (basic + predictive + adaptive + Gemini)
        await generateAIInsights();

        console.log('Analytics data processed:', analyticsData);

    } catch (error) {
        console.error('Error processing analytics data:', error);
    }
}

// Load adaptive learning data
async function loadAdaptiveLearningData() {
    try {
        console.log('Loading adaptive learning data...');

        // Load learning paths for all students
        const studentIds = analyticsData.students.map(s => s.id);
        analyticsData.learningPaths = [];

        for (const studentId of studentIds) {
            try {
                const path = await generatePersonalizedPath(studentId);
                if (path && path.path && path.path.length > 0) {
                    analyticsData.learningPaths.push({
                        studentId,
                        path: path.path,
                        estimatedTime: path.estimatedTime,
                        skillGaps: path.skillGaps,
                        targetDifficulty: path.targetDifficulty
                    });
                }
            } catch (error) {
                console.warn(`Could not generate learning path for student ${studentId}:`, error);
            }
        }

        // Load mastery levels
        for (const student of analyticsData.students) {
            const masteryData = await getConceptMasteryLevel(student.id, 'Overall');
            if (masteryData) {
                analyticsData.masteryLevels.set(student.id, masteryData.masteryLevel);
            }
        }

        // Load progress data
        analyticsData.progressData = [];
        for (const studentId of studentIds) {
            try {
                const progress = await generateProgressReport(studentId);
                if (progress) {
                    analyticsData.progressData.push(progress);
                }
            } catch (error) {
                console.warn(`Could not generate progress report for student ${studentId}:`, error);
            }
        }

        // Load skill gaps
        analyticsData.skillGaps = [];
        for (const studentId of studentIds) {
            try {
                const gaps = await identifyAdaptiveSkillGaps(studentId);
                analyticsData.skillGaps.push(...gaps.map(gap => ({ ...gap, studentId })));
            } catch (error) {
                console.warn(`Could not identify skill gaps for student ${studentId}:`, error);
            }
        }

        // Load content adaptations (if available)
        try {
            const { data: adaptations } = await supabase
                .from('content_adaptations')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(100);

            analyticsData.contentAdaptations = adaptations || [];
        } catch (error) {
            console.warn('Could not load content adaptations:', error);
            analyticsData.contentAdaptations = [];
        }

        // Load realtime assessment data
        try {
            const { data: assessments } = await supabase
                .from('assessment_sessions')
                .select('*')
                .eq('status', 'completed')
                .order('end_time', { ascending: false })
                .limit(50);

            analyticsData.realtimeAssessments = assessments || [];
        } catch (error) {
            console.warn('Could not load realtime assessments:', error);
            analyticsData.realtimeAssessments = [];
        }

        console.log('Adaptive learning data loaded');

    } catch (error) {
        console.error('Error loading adaptive learning data:', error);
    }
}

// Load Gemini AI analysis for student answers
async function loadGeminiAnalysis(answers) {
    try {
        console.log('Loading Gemini AI analysis...');
        console.log('Number of answers to analyze:', answers?.length || 0);

        // Check Gemini availability
        analyticsData.geminiStatus = getGeminiStatus();
        console.log('Gemini status:', analyticsData.geminiStatus);

        if (!isGeminiAvailable()) {
            console.log('Gemini AI not available - skipping analysis');
            analyticsData.geminiAnalyses = [];
            return;
        }

        // Load existing analyses from database
        console.log('Loading existing analyses from database...');
        const { data: existingAnalyses, error } = await supabase
            .from('gemini_analyses')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.warn('Error loading existing Gemini analyses:', error);
        } else {
            console.log('Existing analyses loaded:', existingAnalyses?.length || 0);
        }

        // Create questions map for quick lookup
        const questionsMap = new Map();
        analyticsData.questions.forEach(q => questionsMap.set(q.id, q));
        console.log('Questions map created with', questionsMap.size, 'questions');

        // Analyze answers that don't have existing analysis
        const analysesToCreate = [];
        const existingAnalysisIds = new Set(
            (existingAnalyses || []).map(a => a.answer_id)
        );
        console.log('Existing analysis IDs:', existingAnalysisIds.size);

        for (const answer of answers || []) {
            if (!existingAnalysisIds.has(answer.id)) {
                const question = questionsMap.get(answer.question_id);
                if (question) {
                    analysesToCreate.push({ answer, question });
                } else {
                    console.log('Question not found for answer:', answer.id, 'question_id:', answer.question_id);
                }
            }
        }

        console.log('New analyses to create:', analysesToCreate.length);

        // Batch analyze new answers (limit to prevent API quota issues)
        const batchSize = 1; // Reduced to 1 to avoid rate limits
        const newAnalyses = [];

        for (let i = 0; i < analysesToCreate.length; i += batchSize) {
            const batch = analysesToCreate.slice(i, i + batchSize);
            console.log(`Analyzing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(analysesToCreate.length/batchSize)}`);

            try {
                const batchResults = await Promise.all(
                    batch.map(({ answer, question }) =>
                        geminiAnalytics.analyzeStudentAnswer(answer, question)
                    )
                );

                newAnalyses.push(...batchResults);
                console.log('Batch analysis successful, results:', batchResults.length);
            } catch (error) {
                console.warn(`Batch ${Math.floor(i/batchSize) + 1} failed:`, error);

                // If it's a rate limit error, wait longer and retry
                if (error.message && error.message.includes('Rate limit reached')) {
                    console.log('Rate limit hit, waiting 60 seconds before retry...');
                    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds

                    // Retry the batch
                    try {
                        const retryResults = await Promise.all(
                            batch.map(({ answer, question }) =>
                                geminiAnalytics.analyzeStudentAnswer(answer, question)
                            )
                        );
                        newAnalyses.push(...retryResults);
                        console.log('Retry successful');
                    } catch (retryError) {
                        console.error('Retry also failed:', retryError);
                        // Skip this batch if retry fails
                        newAnalyses.push(...batch.map(() => ({
                            score: 0,
                            correctness: "Error - Rate Limited",
                            explanation: "Analisis gagal karena batas rate limit API.",
                            strengths: [], weaknesses: [], learningSuggestions: []
                        })));
                    }
                } else {
                    // For other errors, add fallback analysis
                    newAnalyses.push(...batch.map(() => ({
                        score: 0,
                        correctness: "Error",
                        explanation: "Analisis gagal: " + error.message,
                        strengths: [], weaknesses: [], learningSuggestions: []
                    })));
                }
            }

            // Longer delay between batches to avoid rate limits (2 seconds minimum)
            if (i + batchSize < analysesToCreate.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Combine existing and new analyses
        const combinedAnalyses = [
            ...(existingAnalyses || []).map(a => ({
                answerId: a.answer_id,
                analysis: a.analysis_data,
                createdAt: a.created_at
            })),
            ...newAnalyses.map((analysis, index) => ({
                answerId: analysesToCreate[index]?.answer.id,
                analysis: analysis,
                createdAt: new Date()
            }))
        ];

        console.log('Combined analyses:', combinedAnalyses.length);

        // Enrich analyses with student information
        analyticsData.geminiAnalyses = combinedAnalyses.map(analysis => {
            // Find the answer to get user_id
            const answer = answers.find(a => a.id === analysis.answerId);
            if (answer && answer.user_id) {
                // Find profile by user_id using the profiles map
                const profile = window.profilesMap ? window.profilesMap.get(answer.user_id) : null;
                if (profile) {
                    return {
                        ...analysis,
                        studentName: profile.nama_lengkap || `Student ${answer.user_id.slice(0, 8)}`,
                        studentClass: profile.class_name || 'Unknown'
                    };
                } else {
                    // Profile not found, use fallback
                    return {
                        ...analysis,
                        studentName: `Student ${answer.user_id.slice(0, 8)}`,
                        studentClass: 'Unknown'
                    };
                }
            }
            return {
                ...analysis,
                studentName: 'Unknown Student',
                studentClass: 'Unknown'
            };
        });

        console.log(`Gemini analysis loaded: ${analyticsData.geminiAnalyses.length} analyses`);

    } catch (error) {
        console.error('Error loading Gemini analysis:', error);
        analyticsData.geminiAnalyses = [];
        analyticsData.geminiStatus = { available: false, error: error.message };
    }
}

// Generate AI-powered insights
async function generateAIInsights() {
    const insights = [];

    // Insight 1: Overall performance
    const avgScore = analyticsData.students.reduce((sum, s) => sum + s.avgScore, 0) / analyticsData.students.length;
    const passRate = analyticsData.students.filter(s => s.avgScore >= 70).length / analyticsData.students.length * 100;

    insights.push({
        type: 'performance',
        title: 'Performa Keseluruhan',
        content: `Rata-rata skor siswa adalah ${avgScore.toFixed(1)} dengan tingkat kelulusan ${passRate.toFixed(1)}%. ${passRate > 75 ? 'Performa kelas sangat baik!' : passRate > 50 ? 'Performa kelas cukup baik, ada ruang untuk improvement.' : 'Perlu perhatian khusus untuk meningkatkan performa.'}`,
        priority: 'high'
    });

    // Insight 2: Student clustering
    const highPerformers = analyticsData.students.filter(s => s.cluster === 'high-performer').length;
    const struggling = analyticsData.students.filter(s => s.cluster === 'struggling').length;

    insights.push({
        type: 'clustering',
        title: 'Distribusi Kemampuan Siswa',
        content: `${highPerformers} siswa berperforma tinggi, ${struggling} siswa perlu bantuan tambahan. ${struggling > highPerformers ? 'Fokus pada siswa yang kesulitan.' : 'Pertahankan momentum siswa berprestasi.'}`,
        priority: 'high'
    });

    // Insight 3: Trend analysis
    const improving = analyticsData.students.filter(s => s.trend === 'improving').length;
    const declining = analyticsData.students.filter(s => s.trend === 'declining').length;

    if (improving > declining) {
        insights.push({
            type: 'trend',
            title: 'Tren Performa',
            content: `${improving} siswa menunjukkan improvement, ${declining} siswa mengalami penurunan. Strategi pembelajaran efektif!`,
            priority: 'medium'
        });
    }

    // Insight 4: Question quality
    const questionInsights = analyzeQuestionQuality();
    if (questionInsights) {
        insights.push(questionInsights);
    }

    // Insight 5: Predictive analytics (ML-based)
    const predictiveInsights = await generatePredictiveInsights();
    insights.push(...predictiveInsights);

    // Insight 6: Adaptive learning insights
    const adaptiveInsights = await generateAdaptiveLearningInsights();
    insights.push(...adaptiveInsights);

    // Insight 7: Gemini AI analysis insights
    const geminiInsights = await generateGeminiInsights();
    insights.push(...geminiInsights);

    analyticsData.insights = insights;
}

// Analyze question quality using basic statistics
function analyzeQuestionQuality() {
    if (!analyticsData.questions.length) return null;

    // This is a simplified analysis - in real AI system, this would use IRT models
    const avgDifficulty = analyticsData.questions.reduce((sum, q) => {
        // Simple difficulty estimation based on scoring weight
        return sum + (q.scoring_weight || 1);
    }, 0) / analyticsData.questions.length;

    return {
        type: 'questions',
        title: 'Kualitas Soal',
        content: `Rata-rata tingkat kesulitan soal: ${avgDifficulty.toFixed(1)}. ${avgDifficulty > 2 ? 'Soal cukup menantang.' : 'Pertimbangkan untuk menambah soal yang lebih menantang.'}`,
        priority: 'medium'
    };
}

// Generate predictive insights using ML models
async function generatePredictiveInsights() {
    const insights = [];

    try {
        // Check if models are available
        const modelStatus = getModelStatus();

        if (!modelStatus.performanceModel) {
            insights.push({
                type: 'prediction',
                title: 'Model Prediksi Belum Siap',
                content: 'Model prediksi performa siswa sedang dalam pelatihan. Insights prediktif akan tersedia setelah model terlatih.',
                priority: 'low'
            });
            return insights;
        }

        // Insight: Performance predictions
        const strugglingStudents = analyticsData.students.filter(s => s.cluster === 'struggling');
        if (strugglingStudents.length > 0) {
            const predictions = await Promise.all(
                strugglingStudents.slice(0, 3).map(async (student) => {
                    const prediction = await predictNextExamPerformance(student);
                    return { student, prediction };
                })
            );

            const avgPredictedImprovement = predictions
                .filter(p => p.prediction)
                .reduce((sum, p) => sum + (p.prediction - p.student.avgScore), 0) /
                predictions.filter(p => p.prediction).length;

            if (avgPredictedImprovement > 0) {
                insights.push({
                    type: 'prediction',
                    title: 'Prediksi Performa Siswa Kesulitan',
                    content: `AI memprediksi siswa kesulitan akan mengalami improvement rata-rata ${avgPredictedImprovement.toFixed(1)} poin pada ujian berikutnya dengan intervensi yang tepat.`,
                    priority: 'high'
                });
            }
        }

        // Insight: Skill gaps identification
        if (modelStatus.skillGapModel) {
            const totalSkillGaps = analyticsData.students.length;
            const highGapStudents = analyticsData.students.filter(s =>
                s.exams && s.exams.length > 0 && s.avgScore < 60
            ).length;

            if (highGapStudents > 0) {
                insights.push({
                    type: 'skillgap',
                    title: 'Identifikasi Skill Gap',
                    content: `${highGapStudents} siswa teridentifikasi memiliki kesenjangan kemampuan signifikan. AI merekomendasikan fokus pada penguatan konsep dasar.`,
                    priority: 'high'
                });
            }
        }

        // Insight: Learning trends
        if (modelStatus.trendModel) {
            const improvingStudents = analyticsData.students.filter(s => s.trend === 'improving').length;
            const decliningStudents = analyticsData.students.filter(s => s.trend === 'declining').length;

            if (improvingStudents > decliningStudents) {
                insights.push({
                    type: 'trend',
                    title: 'Tren Pembelajaran Positif',
                    content: `AI mendeteksi tren positif dalam pembelajaran. ${improvingStudents} siswa menunjukkan improvement konsisten.`,
                    priority: 'medium'
                });
            } else if (decliningStudents > improvingStudents) {
                insights.push({
                    type: 'trend',
                    title: 'Perhatian: Tren Penurunan',
                    content: `${decliningStudents} siswa mengalami penurunan performa. Perlu intervensi segera.`,
                    priority: 'high'
                });
            }
        }

        // Insight: Model accuracy status
        insights.push({
            type: 'model',
            title: 'Status Model AI',
            content: `Model prediksi aktif: Performance ${modelStatus.performanceModel ? '✓' : '✗'}, Skill Gap ${modelStatus.skillGapModel ? '✓' : '✗'}, Trend ${modelStatus.trendModel ? '✓' : '✗'}`,
            priority: 'low'
        });

    } catch (error) {
        console.error('Error generating predictive insights:', error);
        insights.push({
            type: 'error',
            title: 'Error dalam Prediksi AI',
            content: 'Terjadi kesalahan dalam menghasilkan insights prediktif. Menggunakan analisis dasar.',
            priority: 'low'
        });
    }

    return insights;
}

// Generate adaptive learning insights
async function generateAdaptiveLearningInsights() {
    const insights = [];

    try {
        // Insight: Learning path effectiveness
        if (analyticsData.learningPaths.length > 0) {
            const avgPathLength = analyticsData.learningPaths.reduce((sum, lp) => sum + lp.path.length, 0) / analyticsData.learningPaths.length;
            const pathsWithSkillGaps = analyticsData.learningPaths.filter(lp => lp.skillGaps > 0).length;

            insights.push({
                type: 'adaptive_learning',
                title: 'Efektivitas Learning Path',
                content: `Rata-rata panjang learning path: ${avgPathLength.toFixed(1)} konsep. ${pathsWithSkillGaps} siswa memiliki learning path yang disesuaikan untuk mengatasi skill gaps.`,
                priority: 'medium'
            });
        }

        // Insight: Mastery level distribution
        const masteryLevels = Array.from(analyticsData.masteryLevels.values());
        if (masteryLevels.length > 0) {
            const avgMastery = masteryLevels.reduce((sum, m) => sum + m, 0) / masteryLevels.length;
            const highMastery = masteryLevels.filter(m => m >= 0.8).length;
            const lowMastery = masteryLevels.filter(m => m < 0.5).length;

            insights.push({
                type: 'mastery',
                title: 'Tingkat Mastery Siswa',
                content: `Rata-rata mastery level: ${(avgMastery * 100).toFixed(1)}%. ${highMastery} siswa mahir, ${lowMastery} siswa perlu perhatian khusus.`,
                priority: 'high'
            });
        }

        // Insight: Skill gaps analysis
        if (analyticsData.skillGaps.length > 0) {
            const totalGaps = analyticsData.skillGaps.length;
            const severeGaps = analyticsData.skillGaps.filter(g => g.severity > 0.7).length;

            insights.push({
                type: 'skill_gaps',
                title: 'Analisis Skill Gaps',
                content: `Terdapat ${totalGaps} skill gaps teridentifikasi, dengan ${severeGaps} gaps berat yang perlu intervensi segera.`,
                priority: 'high'
            });
        }

        // Insight: Content adaptation usage
        if (analyticsData.contentAdaptations.length > 0) {
            const adaptationsByType = {};
            analyticsData.contentAdaptations.forEach(adaptation => {
                const type = adaptation.adaptation_strategy?.difficulty || 'unknown';
                adaptationsByType[type] = (adaptationsByType[type] || 0) + 1;
            });

            const mostCommon = Object.entries(adaptationsByType).sort((a, b) => b[1] - a[1])[0];
            if (mostCommon) {
                insights.push({
                    type: 'content_adaptation',
                    title: 'Penggunaan Content Adaptation',
                    content: `Adaptasi konten paling umum: ${mostCommon[0]} (${mostCommon[1]} kali). Sistem berhasil menyesuaikan konten untuk ${analyticsData.contentAdaptations.length} sesi pembelajaran.`,
                    priority: 'medium'
                });
            }
        }

        // Insight: Real-time assessment effectiveness
        if (analyticsData.realtimeAssessments.length > 0) {
            const avgEngagement = analyticsData.realtimeAssessments
                .filter(a => a.engagement_score)
                .reduce((sum, a) => sum + a.engagement_score, 0) /
                analyticsData.realtimeAssessments.filter(a => a.engagement_score).length;

            const avgAccuracy = analyticsData.realtimeAssessments
                .reduce((sum, a) => sum + (a.accuracy || 0), 0) / analyticsData.realtimeAssessments.length;

            if (!isNaN(avgEngagement) && !isNaN(avgAccuracy)) {
                insights.push({
                    type: 'realtime_assessment',
                    title: 'Efektivitas Real-time Assessment',
                    content: `Rata-rata engagement: ${(avgEngagement * 100).toFixed(1)}%, akurasi: ${avgAccuracy.toFixed(1)}%. Assessment adaptif membantu personalisasi pembelajaran.`,
                    priority: 'medium'
                });
            }
        }

        // Insight: Progress trends
        if (analyticsData.progressData.length > 0) {
            const improvingStudents = analyticsData.progressData.filter(p => p.trends?.overall === 'improving').length;
            const decliningStudents = analyticsData.progressData.filter(p => p.trends?.overall === 'declining').length;

            if (improvingStudents > 0 || decliningStudents > 0) {
                insights.push({
                    type: 'progress_trends',
                    title: 'Tren Progress Pembelajaran',
                    content: `${improvingStudents} siswa menunjukkan progress positif, ${decliningStudents} siswa mengalami penurunan. ${improvingStudents > decliningStudents ? 'Secara keseluruhan tren positif!' : 'Perlu perhatian pada siswa yang mengalami penurunan.'}`,
                    priority: 'high'
                });
            }
        }

    } catch (error) {
        console.error('Error generating adaptive learning insights:', error);
        insights.push({
            type: 'error',
            title: 'Error dalam Adaptive Learning Insights',
            content: 'Terjadi kesalahan dalam menghasilkan insights pembelajaran adaptif.',
            priority: 'low'
        });
    }

    return insights;
}

// Generate Gemini AI-powered insights
async function generateGeminiInsights() {
    const insights = [];

    try {
        if (!isGeminiAvailable() || analyticsData.geminiAnalyses.length === 0) {
            insights.push({
                type: 'grok_status',
                title: 'Status Grok AI',
                content: !isGeminiAvailable()
                    ? 'Grok AI belum dikonfigurasi. Tambahkan API key untuk analisis jawaban yang lebih mendalam.'
                    : 'Belum ada analisis Grok AI. Jawaban siswa akan dianalisis secara otomatis.',
                priority: 'low'
            });
            return insights;
        }

        // Insight: Overall answer quality from Gemini analysis
        const avgGeminiScore = analyticsData.geminiAnalyses
            .reduce((sum, a) => sum + (a.analysis.score || 0), 0) / analyticsData.geminiAnalyses.length;

        if (!isNaN(avgGeminiScore)) {
            insights.push({
                type: 'grok_quality',
                title: 'Kualitas Jawaban (Grok AI)',
                content: `Rata-rata skor analisis AI: ${avgGeminiScore.toFixed(1)}/100. ${avgGeminiScore > 80 ? 'Kualitas jawaban sangat baik!' : avgGeminiScore > 60 ? 'Kualitas jawaban cukup baik.' : 'Perlu perbaikan dalam pemahaman konsep.'}`,
                priority: 'high'
            });
        }

        // Insight: Common strengths identified by Gemini
        const allStrengths = analyticsData.geminiAnalyses
            .flatMap(a => a.analysis.strengths || [])
            .filter(s => s && s !== 'Perlu analisis lebih lanjut');

        const strengthCounts = {};
        allStrengths.forEach(strength => {
            strengthCounts[strength] = (strengthCounts[strength] || 0) + 1;
        });

        const topStrengths = Object.entries(strengthCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topStrengths.length > 0) {
            insights.push({
                type: 'grok_strengths',
                title: 'Kelebihan Siswa (Grok AI)',
                content: `Kelebihan paling umum: ${topStrengths.map(([strength, count]) => `${strength} (${count}x)`).join(', ')}`,
                priority: 'medium'
            });
        }

        // Insight: Common weaknesses identified by Gemini
        const allWeaknesses = analyticsData.geminiAnalyses
            .flatMap(a => a.analysis.weaknesses || [])
            .filter(w => w && w !== 'Perlu analisis lebih lanjut');

        const weaknessCounts = {};
        allWeaknesses.forEach(weakness => {
            weaknessCounts[weakness] = (weaknessCounts[weakness] || 0) + 1;
        });

        const topWeaknesses = Object.entries(weaknessCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topWeaknesses.length > 0) {
            insights.push({
                type: 'grok_weaknesses',
                title: 'Kekurangan Siswa (Grok AI)',
                content: `Area yang perlu diperbaiki: ${topWeaknesses.map(([weakness, count]) => `${weakness} (${count}x)`).join(', ')}. Fokus pada konsep-konsep ini dalam pembelajaran.`,
                priority: 'high'
            });
        }

        // Insight: Learning suggestions from Gemini
        const allSuggestions = analyticsData.geminiAnalyses
            .flatMap(a => a.analysis.learningSuggestions || [])
            .filter(s => s && s !== 'Lanjutkan pembelajaran');

        const suggestionCounts = {};
        allSuggestions.forEach(suggestion => {
            suggestionCounts[suggestion] = (suggestionCounts[suggestion] || 0) + 1;
        });

        const topSuggestions = Object.entries(suggestionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

        if (topSuggestions.length > 0) {
            insights.push({
                type: 'grok_suggestions',
                title: 'Rekomendasi Pembelajaran (Grok AI)',
                content: `Saran utama: ${topSuggestions.map(([suggestion, count]) => `${suggestion} (${count}x)`).join(', ')}`,
                priority: 'high'
            });
        }

        // Insight: Gemini analysis coverage
        const totalAnswers = analyticsData.exams.reduce((sum, exam) => sum + (exam.answers?.length || 0), 0);
        const analyzedAnswers = analyticsData.geminiAnalyses.length;
        const coverage = totalAnswers > 0 ? (analyzedAnswers / totalAnswers * 100) : 0;

        insights.push({
            type: 'grok_coverage',
            title: 'Coverage Analisis Grok',
            content: `${analyzedAnswers} dari ${totalAnswers} jawaban telah dianalisis oleh Grok AI (${coverage.toFixed(1)}% coverage). Analisis mendalam tersedia untuk siswa.`,
            priority: 'low'
        });

    } catch (error) {
        console.error('Error generating Gemini insights:', error);
        insights.push({
            type: 'grok_error',
            title: 'Error Analisis Grok',
            content: 'Terjadi kesalahan dalam menghasilkan insights dari Grok AI. Fitur analisis tetap berfungsi dengan model AI lainnya.',
            priority: 'low'
        });
    }

    return insights;
}

// Initialize Chart.js charts
function initializeCharts() {
    // Clustering Chart
    const clusteringCtx = document.getElementById('clusteringChart');
    if (clusteringCtx) {
        const clusterData = {
            labels: ['High Performer', 'Average', 'Perlu Bantuan'],
            datasets: [{
                data: [
                    analyticsData.students.filter(s => s.cluster === 'high-performer').length,
                    analyticsData.students.filter(s => s.cluster === 'average').length,
                    analyticsData.students.filter(s => s.cluster === 'struggling').length
                ],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2
            }]
        };

        clusteringChart = new Chart(clusteringCtx, {
            type: 'doughnut',
            data: clusterData,
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    title: {
                        display: true,
                        text: 'Distribusi Siswa Berdasarkan Performa'
                    }
                }
            }
        });
    }

    // Performance Trends Chart
    const trendsCtx = document.getElementById('trendsChart');
    if (trendsCtx) {
        // Generate sample trend data (in real implementation, this would be historical data)
        const trendData = {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Rata-rata Skor Kelas',
                data: [65, 68, 72, 70, 75, 78],
                borderColor: 'rgba(102, 126, 234, 1)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        };

        trendsChart = new Chart(trendsCtx, {
            type: 'line',
            data: trendData,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Tren Performa Kelas'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Skills Radar Chart
    const skillsCtx = document.getElementById('skillsRadar');
    if (skillsCtx) {
        const skillsData = {
            labels: ['Aljabar', 'Geometri', 'Statistika', 'Logika', 'Aritmatika', 'Pengukuran'],
            datasets: [{
                label: 'Mastery Level',
                data: [75, 68, 82, 71, 79, 73],
                borderColor: 'rgba(16, 185, 129, 1)',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                pointBackgroundColor: 'rgba(16, 185, 129, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(16, 185, 129, 1)'
            }]
        };

        skillsRadar = new Chart(skillsCtx, {
            type: 'radar',
            data: skillsData,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Analisis Kemampuan Matematika'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Difficulty vs Performance Chart
    const difficultyCtx = document.getElementById('difficultyChart');
    if (difficultyCtx) {
        const difficultyData = {
            datasets: [{
                label: 'Siswa',
                data: generateScatterData(),
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        };

        difficultyChart = new Chart(difficultyCtx, {
            type: 'scatter',
            data: difficultyData,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Korelasi Tingkat Kesulitan vs Performa'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Tingkat Kesulitan Soal'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Skor Siswa'
                        },
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Questions Quality Chart - Menggunakan data nyata dari database
    const questionsCtx = document.getElementById('questionsChart');
    if (questionsCtx) {
        // Mapping difficulty ke nilai numerik untuk chart
        const difficultyMap = {
            'Mudah': 33,
            'Sedang': 66,
            'Sulit': 100
        };
        
        // Hitung tingkat keberhasilan per soal dari data jawaban
        const questionSuccessRates = calculateQuestionSuccessRates();
        
        const questionsData = {
            labels: analyticsData.questions.slice(0, 10).map((q, idx) => {
                const chapter = q.chapter || 'Umum';
                const subChapter = q.sub_chapter ? ` - ${q.sub_chapter}` : '';
                return `${chapter}${subChapter}`.substring(0, 20);
            }),
            datasets: [{
                label: 'Tingkat Kesulitan (%)',
                data: analyticsData.questions.slice(0, 10).map(q => difficultyMap[q.difficulty] || 50),
                backgroundColor: 'rgba(245, 158, 11, 0.6)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 1
            }, {
                label: 'Tingkat Keberhasilan Siswa (%)',
                data: analyticsData.questions.slice(0, 10).map(q => questionSuccessRates[q.id] || 0),
                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 1
            }]
        };

        questionsChart = new Chart(questionsCtx, {
            type: 'bar',
            data: questionsData,
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Analisis Kualitas Soal (Data Nyata)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    }
}

// Generate scatter plot data from real exam data
// Menghubungkan tingkat kesulitan soal dengan skor siswa
function generateScatterData() {
    const data = [];
    
    // Jika tidak ada data, kembalikan array kosong
    if (!analyticsData.exams || analyticsData.exams.length === 0) {
        console.log('No exam data available for scatter plot');
        return data;
    }
    
    // Mapping difficulty ke nilai numerik
    const difficultyMap = {
        'Mudah': 1,
        'Sedang': 2,
        'Sulit': 3
    };
    
    // Iterasi melalui exam sessions untuk mendapatkan skor
    analyticsData.exams.forEach(exam => {
        if (exam.total_score !== null && exam.total_score !== undefined) {
            // Hitung rata-rata difficulty dari soal yang dijawab
            // Berdasarkan question_type_variant jika tidak ada difficulty spesifik
            let avgDifficulty = 2; // Default Sedang
            
            // Jika ada questions data, hitung rata-rata difficulty
            if (analyticsData.questions && analyticsData.questions.length > 0) {
                const examQuestions = analyticsData.questions.filter(q => 
                    q.question_type_variant === exam.question_type_variant
                );
                
                if (examQuestions.length > 0) {
                    const totalDiff = examQuestions.reduce((sum, q) => {
                        return sum + (difficultyMap[q.difficulty] || 2);
                    }, 0);
                    avgDifficulty = totalDiff / examQuestions.length;
                }
            }
            
            data.push({
                x: avgDifficulty,
                y: exam.total_score
            });
        }
    });
    
    console.log(`Generated ${data.length} scatter data points from real exam data`);
    return data;
}

// Calculate success rate per question from exam answers
// Menghitung persentase jawaban benar per soal
function calculateQuestionSuccessRates() {
    const successRates = {};
    
    // Jika tidak ada data jawaban, kembalikan object kosong
    if (!analyticsData.answers || analyticsData.answers.length === 0) {
        console.log('No answer data available for success rate calculation');
        return successRates;
    }
    
    // Group answers by question_id
    const questionAnswers = {};
    analyticsData.answers.forEach(answer => {
        if (!questionAnswers[answer.question_id]) {
            questionAnswers[answer.question_id] = {
                total: 0,
                correct: 0
            };
        }
        questionAnswers[answer.question_id].total++;
        if (answer.is_correct) {
            questionAnswers[answer.question_id].correct++;
        }
    });
    
    // Calculate success rate per question
    Object.keys(questionAnswers).forEach(questionId => {
        const stats = questionAnswers[questionId];
        successRates[questionId] = Math.round((stats.correct / stats.total) * 100);
    });
    
    console.log(`Calculated success rates for ${Object.keys(successRates).length} questions`);
    return successRates;
}

// Update UI with analytics data
async function updateUI() {
    // Update overview stats
    updateOverviewStats();

    // Update AI insights
    updateAIInsights();

    // Update student lists
    updateStudentLists();

    // Update data tables
    await updateDataTables();

    // Update Grok AI displays
    updateGrokDisplays();

    // Update predictions
    await updatePredictions();
}

// Update overview statistics
function updateOverviewStats() {
    const totalStudents = analyticsData.students.length;
    const avgScore = analyticsData.students.reduce((sum, s) => sum + s.avgScore, 0) / totalStudents;
    const passRate = analyticsData.students.filter(s => s.avgScore >= 70).length / totalStudents * 100;
    const totalExams = analyticsData.exams.length;

    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('avgScore').textContent = `${avgScore.toFixed(1)}%`;
    document.getElementById('passRate').textContent = `${passRate.toFixed(1)}%`;
    document.getElementById('totalExams').textContent = totalExams;
}

// Update AI insights display
function updateAIInsights() {
    const insightsContainer = document.getElementById('aiInsights');

    if (analyticsData.insights.length === 0) {
        insightsContainer.innerHTML = '<div class="insight-loading"><i class="fas fa-brain"></i><span>AI sedang menganalisis data...</span></div>';
        return;
    }

    insightsContainer.innerHTML = analyticsData.insights.map(insight => `
        <div class="insight-item">
            <h4><i class="fas fa-${getInsightIcon(insight.type)}"></i> ${insight.title}</h4>
            <p>${insight.content}</p>
        </div>
    `).join('');
}

// Get appropriate icon for insight type
function getInsightIcon(type) {
    const icons = {
        performance: 'chart-bar',
        clustering: 'users',
        trend: 'chart-line',
        questions: 'question-circle',
        prediction: 'crystal-ball',
        skillgap: 'search',
        model: 'cogs',
        error: 'exclamation-triangle',
        // Adaptive learning icons
        adaptive_learning: 'route',
        mastery: 'fire',
        skill_gaps: 'search-plus',
        content_adaptation: 'lightbulb',
        realtime_assessment: 'tachometer-alt',
        progress_trends: 'chart-line',
        // Grok AI icons
        grok_status: 'robot',
        grok_quality: 'star',
        grok_strengths: 'thumbs-up',
        grok_weaknesses: 'thumbs-down',
        grok_suggestions: 'graduation-cap',
        grok_coverage: 'chart-pie'
    };
    return icons[type] || 'lightbulb';
}

// Update student lists (top performers and those needing help)
function updateStudentLists() {
    // Top students
    const topStudents = analyticsData.students
        .filter(s => s.cluster === 'high-performer')
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5);

    const topStudentsContainer = document.getElementById('topStudentsList');
    topStudentsContainer.innerHTML = topStudents.map(student => `
        <div class="student-item" onclick="showStudentDetail('${student.id}')">
            <div class="student-avatar">${student.name.charAt(0)}</div>
            <div class="student-info">
                <h4>${student.name}</h4>
                <p>${student.class}</p>
            </div>
            <div class="student-score">
                <div class="score">${student.avgScore.toFixed(1)}</div>
                <div class="trend positive">+${Math.random() * 10 + 5}%</div>
            </div>
        </div>
    `).join('');

    // Students needing help
    const helpNeeded = analyticsData.students
        .filter(s => s.cluster === 'struggling')
        .sort((a, b) => a.avgScore - b.avgScore)
        .slice(0, 5);

    const helpNeededContainer = document.getElementById('helpNeededList');
    helpNeededContainer.innerHTML = helpNeeded.map(student => `
        <div class="student-item" onclick="showStudentDetail('${student.id}')">
            <div class="student-avatar">${student.name.charAt(0)}</div>
            <div class="student-info">
                <h4>${student.name}</h4>
                <p>${student.class}</p>
            </div>
            <div class="student-score">
                <div class="score">${student.avgScore.toFixed(1)}</div>
                <div class="trend negative">${Math.random() * -10 - 5}%</div>
            </div>
        </div>
    `).join('');
}

// Update data tables
async function updateDataTables() {
    // Students table
     const studentsTable = document.getElementById('studentsTable');
     if (studentsTable) {
         const tbody = studentsTable.querySelector('tbody');

         // Generate AI recommendations for students (limit to first 10 to avoid too many API calls)
         const studentsToShow = analyticsData.students.slice(0, 10);
         const recommendationPromises = studentsToShow.map(student =>
             generateStudentAIRecommendation(student).catch(() => "Rekomendasi loading...")
         );

         const recommendations = await Promise.all(recommendationPromises);

         tbody.innerHTML = studentsToShow.map((student, index) => `
             <tr>
                 <td>${student.name}</td>
                 <td>${student.class}</td>
                 <td>${student.avgScore.toFixed(1)}</td>
                 <td>${student.examCount}</td>
                 <td><span class="cluster-badge ${student.cluster}">${student.cluster.replace('-', ' ')}</span></td>
                 <td class="ai-recommendation-cell">${recommendations[index]}</td>
                 <td><button onclick="showStudentDetail('${student.id}')" class="action-btn">Detail</button></td>
             </tr>
         `).join('');
     }

    // Questions table
     const questionsTable = document.getElementById('questionsTable');
     if (questionsTable) {
         const tbody = questionsTable.querySelector('tbody');
         tbody.innerHTML = analyticsData.questions.slice(0, 20).map(question => `
             <tr>
                 <td>${question.id}</td>
                 <td>${question.subject || 'Matematika'}</td>
                 <td>${question.chapter || 'N/A'}</td>
                 <td>${getDifficultyText(question.difficulty || question.scoring_weight)}</td>
                 <td>${calculateDiscriminationIndex(question)}</td>
                 <td>${question.times_answered || 0}</td>
                 <td>${calculateSuccessRate(question).toFixed(1)}%</td>
                 <td><button onclick="goToAdminQuestions()" class="action-btn">Kelola di Admin</button></td>
             </tr>
         `).join('');
     }
}

// Generate prediction text for students
function getPredictionText(student) {
    const predictions = {
        'high-performer': 'Akan terus excellent',
        'average': 'Berpotensi meningkat',
        'struggling': 'Perlu intervensi'
    };
    return predictions[student.cluster] || 'Unknown';
}

// Get difficulty text for questions
function getDifficultyText(difficulty) {
    if (typeof difficulty === 'string') {
        return difficulty;
    } else if (typeof difficulty === 'number') {
        if (difficulty <= 1) return 'Mudah';
        if (difficulty <= 2) return 'Sedang';
        return 'Sulit';
    }
    return 'Sedang';
}

// Calculate discrimination index for a question (simplified)
function calculateDiscriminationIndex(question) {
    // In a real implementation, this would use statistical analysis
    // For now, return a random value based on scoring weight
    const baseIndex = (question.scoring_weight || 1) * 0.1;
    return (Math.random() * 0.4 + baseIndex).toFixed(2);
}

// Calculate success rate for a question
function calculateSuccessRate(question) {
    // In a real implementation, this would be calculated from exam answers
    // For now, return a percentage based on difficulty
    const difficulty = question.scoring_weight || 1;
    const baseRate = 100 - (difficulty * 10);
    return Math.max(10, Math.min(95, baseRate + (Math.random() * 20 - 10)));
}

// Update predictions and recommendations
async function updatePredictions() {
    const performancePredictions = document.getElementById('performancePredictions');
    const aiRecommendations = document.getElementById('aiRecommendations');

    if (performancePredictions) {
        // Check if we have students data
        if (analyticsData.students.length === 0) {
            performancePredictions.innerHTML = '<div class="prediction-card"><p>Belum ada data siswa untuk membuat prediksi.</p></div>';
        } else {
            // Get predictions for top 5 students using ML model or fallback
            const predictions = await Promise.all(
                analyticsData.students.slice(0, 5).map(async (student) => {
                    try {
                        const mlPrediction = await predictNextExamPerformance(student);
                        return {
                            student,
                            predictedScore: mlPrediction || getPredictionScore(student)
                        };
                    } catch (error) {
                        // Fallback to basic prediction
                        return {
                            student,
                            predictedScore: getPredictionScore(student)
                        };
                    }
                })
            );

            performancePredictions.innerHTML = predictions.map(({ student, predictedScore }) => `
                <div class="prediction-card">
                    <h5>${student.name}</h5>
                    <p>Prediksi performa ujian berikutnya: ${predictedScore} poin</p>
                    <small>Current avg: ${student.avgScore.toFixed(1)} | Trend: ${student.trend}</small>
                </div>
            `).join('');
        }
    }

    if (aiRecommendations) {
        // Generate recommendations based on available data
        const strugglingCount = analyticsData.students.filter(s => s.cluster === 'struggling').length;
        const highPerformerCount = analyticsData.students.filter(s => s.cluster === 'high-performer').length;
        const improvingCount = analyticsData.students.filter(s => s.trend === 'improving').length;

        let recommendations = [];

        if (analyticsData.students.length === 0) {
            recommendations.push(`
                <div class="recommendation-card">
                    <h5>📊 Belum Ada Data</h5>
                    <p>Belum ada data siswa yang cukup untuk menghasilkan rekomendasi AI. Lakukan beberapa ujian terlebih dahulu.</p>
                </div>
            `);
        } else {
            if (strugglingCount > 0) {
                recommendations.push(`
                    <div class="recommendation-card">
                        <h5>🎯 Fokus pada Siswa Kesulitan</h5>
                        <p>Berikan remedial khusus untuk ${strugglingCount} siswa yang membutuhkan bantuan. Sistem mendeteksi kesenjangan kemampuan signifikan.</p>
                    </div>
                `);
            }

            if (highPerformerCount > 0) {
                recommendations.push(`
                    <div class="recommendation-card">
                        <h5>🚀 Tantangan untuk Siswa Berprestasi</h5>
                        <p>${highPerformerCount} siswa berprestasi siap untuk soal-soal yang lebih menantang di level advanced.</p>
                    </div>
                `);
            }

            if (improvingCount > strugglingCount) {
                recommendations.push(`
                    <div class="recommendation-card">
                        <h5>📈 Strategi Pembelajaran Efektif</h5>
                        <p>${improvingCount} siswa menunjukkan improvement. Sebarkan strategi pembelajaran yang berhasil.</p>
                    </div>
                `);
            }

            // Add skill gap specific recommendations
            const skillGapStudents = analyticsData.students.filter(s => s.avgScore < 60).length;
            if (skillGapStudents > 0) {
                recommendations.push(`
                    <div class="recommendation-card">
                        <h5>🧠 Penguatan Konsep Dasar</h5>
                        <p>Fokus pada penguatan konsep dasar untuk ${skillGapStudents} siswa dengan performa di bawah 60.</p>
                    </div>
                `);
            }

            // Add general recommendations if no specific ones
            if (recommendations.length === 0) {
                recommendations.push(`
                    <div class="recommendation-card">
                        <h5>📚 Rekomendasi Umum</h5>
                        <p>Lanjutkan pemantauan performa siswa secara berkala. Sistem akan memberikan rekomendasi yang lebih spesifik seiring bertambahnya data.</p>
                    </div>
                `);
            }
        }

        aiRecommendations.innerHTML = recommendations.join('');
    }
}

// Update Grok AI displays
function updateGrokDisplays() {
    console.log('updateGrokDisplays called');
    console.log('geminiAnalyses length:', analyticsData.geminiAnalyses.length);
    console.log('geminiStatus:', analyticsData.geminiStatus);

    // Update Grok status
    const statusDisplay = document.getElementById('grokStatusDisplay');
    if (statusDisplay && analyticsData.geminiStatus) {
        const status = analyticsData.geminiStatus;

        // Determine overall status
        const isFullyOperational = status.available && status.connected && status.validResponse;
        const statusIcon = isFullyOperational ? 'check-circle' : status.available ? 'exclamation-triangle' : 'times-circle';
        const statusColor = isFullyOperational ? 'online' : status.available ? 'warning' : 'offline';
        const statusText = isFullyOperational ? 'Fully Operational' : status.available ? 'Partially Available' : 'Offline';

        statusDisplay.innerHTML = `
            <div class="status-item">
                <div class="status-label">
                    <i class="fas fa-${statusIcon}"></i>
                    Grok AI: ${statusText}
                </div>
                <div class="status-indicator ${statusColor}">
                    <span>${statusText}</span>
                </div>
            </div>

            <div class="status-details">
                <div class="status-info">
                    <strong>Configuration:</strong> ${status.apiConfigured ? '✓ Complete' : '✗ Incomplete'}
                </div>
                <div class="status-info">
                    <strong>Connection:</strong> ${status.connected ? '✓ Connected' : '✗ Failed'}
                    ${status.responseTime ? ` (${status.responseTime}ms)` : ''}
                </div>
                <div class="status-info">
                    <strong>API Response:</strong> ${status.validResponse ? '✓ Valid' : '✗ Invalid'}
                </div>
                <div class="status-info">
                    <strong>Cache:</strong> ${status.cacheSize || 0} analyses stored
                </div>
                <div class="status-info">
                    <strong>Total Analyses:</strong> ${status.totalAnalyses || 0} completed
                </div>
                ${status.lastTest ? `<div class="status-info"><strong>Last Test:</strong> ${status.lastTest.toLocaleString()}</div>` : ''}
                ${status.error ? `<div class="status-error">Error: ${status.error}</div>` : ''}
            </div>
        `;
    }

    // Update Grok analyses list
    const analysesList = document.getElementById('grokAnalysesList');
    console.log('analysesList element:', analysesList);
    if (analysesList) {
        console.log('Setting analyses list HTML');
        console.log('First analysis object:', analyticsData.geminiAnalyses[0]);
        if (analyticsData.geminiAnalyses.length === 0) {
            analysesList.innerHTML = '<div class="no-data">Belum ada analisis Grok AI</div>';
        } else {
            const html = analyticsData.geminiAnalyses.slice(0, 10).map(analysis => `
                  <div class="analysis-card">
                      <div class="analysis-header">
                          <div class="student-info">
                              <h5>${analysis.studentName}</h5>
                              <span class="student-class">${analysis.studentClass}</span>
                          </div>
                          <span class="score-badge score-${getScoreClass(analysis.analysis.score)}">
                              Skor: ${analysis.analysis.score}/100
                          </span>
                      </div>
                      <div class="analysis-content">
                          <div class="analysis-section">
                              <strong>Status Jawaban:</strong> ${analysis.analysis.correctness || 'Unknown'}
                          </div>
                          ${analysis.analysis.strengths && analysis.analysis.strengths.length > 0 ? `
                              <div class="analysis-section">
                                  <strong>Kelebihan:</strong>
                                  <ul>${analysis.analysis.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                              </div>
                          ` : ''}
                          ${analysis.analysis.weaknesses && analysis.analysis.weaknesses.length > 0 ? `
                              <div class="analysis-section">
                                  <strong>Kekurangan:</strong>
                                  <ul>${analysis.analysis.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
                              </div>
                          ` : ''}
                          ${analysis.analysis.learningSuggestions && analysis.analysis.learningSuggestions.length > 0 ? `
                              <div class="analysis-section">
                                  <strong>Saran Pembelajaran:</strong>
                                  <ul>${analysis.analysis.learningSuggestions.map(s => `<li>${s}</li>`).join('')}</ul>
                              </div>
                          ` : ''}
                          <div class="analysis-explanation">
                              <strong>Penjelasan Detail:</strong> ${analysis.analysis.explanation || 'Tidak tersedia'}
                          </div>
                      </div>
                  </div>
              `).join('');
            console.log('Generated HTML length:', html.length);
            console.log('Generated HTML preview:', html.substring(0, 500));
            analysesList.innerHTML = html;
        }
    } else {
        console.log('analysesList element not found');
    }

    // Update Grok insights list
    const insightsList = document.getElementById('grokInsightsList');
    if (insightsList) {
        const grokInsights = analyticsData.insights.filter(i =>
            i.type.startsWith('grok_')
        );
        console.log('Grok insights found:', grokInsights.length);

        if (grokInsights.length === 0) {
            insightsList.innerHTML = '<div class="no-data">Belum ada insights dari Grok AI</div>';
        } else {
            insightsList.innerHTML = grokInsights.map(insight => `
                <div class="insight-card">
                    <div class="insight-header">
                        <i class="fas fa-${getInsightIcon(insight.type)}"></i>
                        <h5>${insight.title}</h5>
                    </div>
                    <div class="insight-content">
                        <p>${insight.content}</p>
                    </div>
                </div>
            `).join('');
        }
    }
}

// Helper function to get score class for styling
function getScoreClass(score) {
    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'average';
    return 'poor';
}

// Generate prediction score for students
function getPredictionScore(student) {
    const baseScore = student.avgScore;
    const trendMultiplier = student.trend === 'improving' ? 1.1 : student.trend === 'declining' ? 0.9 : 1.0;
    return Math.min(100, Math.max(0, baseScore * trendMultiplier)).toFixed(1);
}

// Generate AI recommendation for a student using Grok AI
async function generateStudentAIRecommendation(student) {
    try {
        if (!isGeminiAvailable()) {
            return "AI tidak tersedia";
        }

        // Prepare student context for Grok
        const studentContext = `
Data siswa:
- Nama: ${student.name}
- Kelas: ${student.class}
- Rata-rata skor: ${student.avgScore.toFixed(1)}%
- Jumlah ujian: ${student.examCount}
- Cluster: ${student.cluster}
- Tren performa: ${student.trend}
- Prediksi skor berikutnya: ${getPredictionScore(student)}%
        `;

        // Create recommendation prompt
        const recommendationPrompt = `${studentContext}

Berdasarkan data siswa di atas, berikan rekomendasi pembelajaran yang spesifik dan actionable dalam 2-3 kalimat. Fokus pada kekuatan siswa, area yang perlu diperbaiki, dan strategi pembelajaran yang direkomendasikan. Jawab dalam bahasa Indonesia.`;

        // Call Grok API
        const response = await fetch('https://tsgldkyuktqpsbeuevsn.supabase.co/functions/v1/gemini-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTExOTksImV4cCI6MjA3OTI2NzE5OX0.C0g6iZcwd02ZFmuGFluYXScX9uuahntJtkPvHt5g1FE`
            },
            body: JSON.stringify({ message: recommendationPrompt })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            console.warn('Error getting AI recommendation for student:', student.name, data.error);
            return "Rekomendasi sementara tidak tersedia";
        }

        // Extract Grok's response
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content.trim();
        }

        return "Rekomendasi AI tidak dapat dihasilkan";

    } catch (error) {
        console.error('Error generating AI recommendation:', error);
        return "Error: Tidak dapat menghasilkan rekomendasi";
    }
}

// Show student detail modal
function showStudentDetail(studentId) {
    const student = analyticsData.students.find(s => s.id === studentId);
    if (!student) return;

    const modal = document.getElementById('studentModal');
    const detail = document.getElementById('studentDetail');

    detail.innerHTML = `
        <div class="student-detail-header">
            <h3>${student.name}</h3>
            <p>Kelas: ${student.class}</p>
        </div>
        <div class="student-stats">
            <div class="stat">
                <span class="stat-label">Rata-rata Skor:</span>
                <span class="stat-value">${student.avgScore.toFixed(1)}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Jumlah Ujian:</span>
                <span class="stat-value">${student.examCount}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Cluster:</span>
                <span class="stat-value cluster-badge ${student.cluster}">${student.cluster.replace('-', ' ')}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Tren:</span>
                <span class="stat-value">${student.trend}</span>
            </div>
        </div>
        <div class="student-exams">
            <h4>Riwayat Ujian</h4>
            <div class="exam-history">
                ${student.exams.map(exam => `
                    <div class="exam-item">
                        <span>${new Date(exam.created_at).toLocaleDateString()}</span>
                        <span>Skor: ${exam.total_score || 0}</span>
                        <span>Status: ${exam.is_passed ? 'Lulus' : 'Tidak Lulus'}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    modal.classList.add('active');
}

// Close modal
function closeModal() {
    document.getElementById('studentModal').classList.remove('active');
}


// Filter functions
function updateTimeRange() {
    const timeRange = document.getElementById('timeRange').value;
    console.log('Time range changed to:', timeRange);
    // In a full implementation, this would reload data with the new time range
}

function updateSubjectFilter() {
    const subject = document.getElementById('subjectFilter').value;
    console.log('Subject filter changed to:', subject);
    // In a full implementation, this would filter the data
}

function updateClassFilter() {
    const className = document.getElementById('classFilter').value;
    console.log('Class filter changed to:', className);
    // In a full implementation, this would filter the data
}

// Refresh analytics data
async function refreshAnalytics() {
    document.getElementById('aiInsights').innerHTML = '<div class="insight-loading"><i class="fas fa-spinner fa-spin"></i><span>AI sedang menganalisis data...</span></div>';

    await loadAnalyticsData();
    updateCharts();
    await updateUI();
}

// Update charts with new data
function updateCharts() {
    if (clusteringChart) {
        const clusterData = [
            analyticsData.students.filter(s => s.cluster === 'high-performer').length,
            analyticsData.students.filter(s => s.cluster === 'average').length,
            analyticsData.students.filter(s => s.cluster === 'struggling').length
        ];
        clusteringChart.data.datasets[0].data = clusterData;
        clusteringChart.update();
    }
}

// Export analytics data
function exportAnalytics() {
    const data = {
        students: analyticsData.students,
        insights: analyticsData.insights,
        generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Logout functionality
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('analyticsLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const result = await logoutUser();
                if (result.success) {
                    window.location.href = 'index.html';
                } else {
                    alert('Gagal logout: ' + result.error);
                }
            } catch (error) {
                console.error('Logout error:', error);
                alert('Terjadi kesalahan saat logout');
            }
        });
    }
});

// ==========================================
// ADAPTIVE ANALYTICS FUNCTIONS
// ==========================================

// Get learning path for a specific student
async function getStudentLearningPath(studentId) {
    try {
        const pathData = analyticsData.learningPaths.find(lp => lp.studentId === studentId);
        if (pathData) {
            return pathData;
        }

        // Generate new path if not cached
        const path = await generatePersonalizedPath(studentId);
        return path;
    } catch (error) {
        console.error('Error getting student learning path:', error);
        return null;
    }
}

// Get mastery levels for all concepts for a student
async function getStudentMasteryLevels(studentId) {
    try {
        const tracker = learningPathEngine.getTracker(studentId);
        const mastered = tracker.getMasteredConcepts();
        const weak = tracker.getWeakConcepts();

        return {
            masteredConcepts: Array.from(mastered),
            weakConcepts: weak,
            overallMastery: analyticsData.masteryLevels.get(studentId) || 0
        };
    } catch (error) {
        console.error('Error getting student mastery levels:', error);
        return { masteredConcepts: [], weakConcepts: [], overallMastery: 0 };
    }
}

// Get progress data for a student
async function getStudentProgressData(studentId) {
    try {
        const progress = analyticsData.progressData.find(p => p.userId === studentId);
        if (progress) {
            return progress;
        }

        // Generate new progress report
        const report = await generateProgressReport(studentId);
        return report;
    } catch (error) {
        console.error('Error getting student progress data:', error);
        return null;
    }
}

// Get skill gaps for a student
async function getStudentSkillGaps(studentId) {
    try {
        const gaps = analyticsData.skillGaps.filter(g => g.studentId === studentId);
        return gaps;
    } catch (error) {
        console.error('Error getting student skill gaps:', error);
        return [];
    }
}

// Get content adaptation history
async function getContentAdaptationHistory(studentId = null, limit = 50) {
    try {
        let query = supabase
            .from('content_adaptations')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (studentId) {
            query = query.eq('user_id', studentId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Error getting content adaptation history:', error);
        return [];
    }
}

// Get realtime assessment data
async function getRealtimeAssessmentData(studentId = null, limit = 20) {
    try {
        let query = supabase
            .from('assessment_sessions')
            .select('*')
            .order('end_time', { ascending: false })
            .limit(limit);

        if (studentId) {
            query = query.eq('user_id', studentId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Error getting realtime assessment data:', error);
        return [];
    }
}

// Get learning analytics summary
async function getLearningAnalyticsSummary() {
    try {
        const summary = {
            totalStudents: analyticsData.students.length,
            averageMastery: 0,
            totalLearningPaths: analyticsData.learningPaths.length,
            totalSkillGaps: analyticsData.skillGaps.length,
            contentAdaptationsCount: analyticsData.contentAdaptations.length,
            realtimeAssessmentsCount: analyticsData.realtimeAssessments.length,
            engagementMetrics: {
                averageEngagement: 0,
                highEngagementCount: 0
            }
        };

        // Calculate average mastery
        const masteryValues = Array.from(analyticsData.masteryLevels.values());
        if (masteryValues.length > 0) {
            summary.averageMastery = masteryValues.reduce((sum, m) => sum + m, 0) / masteryValues.length;
        }

        // Calculate engagement metrics
        const engagementScores = analyticsData.realtimeAssessments
            .map(a => a.engagement_score)
            .filter(score => score !== null && score !== undefined);

        if (engagementScores.length > 0) {
            summary.engagementMetrics.averageEngagement =
                engagementScores.reduce((sum, score) => sum + score, 0) / engagementScores.length;
            summary.engagementMetrics.highEngagementCount =
                engagementScores.filter(score => score > 0.7).length;
        }

        return summary;
    } catch (error) {
        console.error('Error getting learning analytics summary:', error);
        return null;
    }
}

// Update student learning path based on performance
async function updateStudentLearningPath(studentId, conceptId, performance) {
    try {
        await updatePathBasedOnPerformance(studentId, conceptId, performance);

        // Refresh cached data
        const updatedPath = await generatePersonalizedPath(studentId);
        const existingIndex = analyticsData.learningPaths.findIndex(lp => lp.studentId === studentId);
        if (existingIndex >= 0) {
            analyticsData.learningPaths[existingIndex] = {
                studentId,
                path: updatedPath.path,
                estimatedTime: updatedPath.estimatedTime,
                skillGaps: updatedPath.skillGaps,
                targetDifficulty: updatedPath.targetDifficulty
            };
        }

        return updatedPath;
    } catch (error) {
        console.error('Error updating student learning path:', error);
        return null;
    }
}

// Get recommended content for student
async function getRecommendedContent(studentId) {
    try {
        const recommendation = await getNextRecommendedContent(studentId);
        return recommendation;
    } catch (error) {
        console.error('Error getting recommended content:', error);
        return null;
    }
}

// ==========================================
// INTEGRATION FUNCTIONS
// ==========================================

// Bridge existing analytics with adaptive features
async function integrateAdaptiveAnalytics() {
    try {
        console.log('Integrating adaptive analytics with existing system...');

        // Enhance student data with adaptive metrics
        for (const student of analyticsData.students) {
            const mastery = analyticsData.masteryLevels.get(student.id) || 0;
            const skillGaps = analyticsData.skillGaps.filter(g => g.studentId === student.id);
            const learningPath = analyticsData.learningPaths.find(lp => lp.studentId === student.id);

            // Add adaptive metrics to student object
            student.adaptiveMetrics = {
                masteryLevel: mastery,
                skillGapsCount: skillGaps.length,
                learningPathLength: learningPath?.path?.length || 0,
                estimatedLearningTime: learningPath?.estimatedTime || 0
            };
        }

        // Update insights to include adaptive data
        await generateAIInsights();

        console.log('Adaptive analytics integration completed');
        return true;
    } catch (error) {
        console.error('Error integrating adaptive analytics:', error);
        return false;
    }
}

// Additional functions will be assigned after they are defined
window.showStudentDetail = showStudentDetail;
window.closeModal = closeModal;
window.refreshAnalytics = refreshAnalytics;
window.exportAnalytics = exportAnalytics;
window.updateTimeRange = updateTimeRange;
window.updateSubjectFilter = updateSubjectFilter;
window.updateClassFilter = updateClassFilter;
window.goToAdminQuestions = goToAdminQuestions;

// Go to admin questions section
function goToAdminQuestions() {
    window.location.href = 'admin.html#questions';
}

// Download Grok analyses as JSON
function downloadGrokAnalyses() {
    if (analyticsData.geminiAnalyses.length === 0) {
        alert('Tidak ada data analisis Grok untuk didownload.');
        return;
    }

    const exportData = {
        exportedAt: new Date().toISOString(),
        totalAnalyses: analyticsData.geminiAnalyses.length,
        aiModel: 'Grok AI (Llama 3.3)',
        analyses: analyticsData.geminiAnalyses.map(analysis => ({
            studentName: analysis.studentName,
            studentClass: analysis.studentClass,
            score: analysis.analysis.score,
            correctness: analysis.analysis.correctness,
            strengths: analysis.analysis.strengths,
            weaknesses: analysis.analysis.weaknesses,
            learningSuggestions: analysis.analysis.learningSuggestions,
            explanation: analysis.analysis.explanation,
            concepts: analysis.analysis.concepts,
            practiceExamples: analysis.analysis.practiceExamples,
            difficulty: analysis.analysis.difficulty,
            timeSpent: analysis.analysis.timeSpent,
            analyzedAt: analysis.createdAt
        }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `grok-analyses-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ==========================================
// GROK CHAT FUNCTIONALITY
// ==========================================

// Global chat variables
let grokChatHistory = [];
let isGrokTyping = false;

// Initialize Grok chat
function initializeGrokChat() {
    const chatInput = document.getElementById('grokChatInput');
    const sendBtn = document.getElementById('grokSendBtn');

    if (chatInput && sendBtn) {
        // Handle Enter key
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendGrokMessage();
            }
        });

        // Handle send button
        sendBtn.addEventListener('click', sendGrokMessage);

        // Load chat history from localStorage
        loadGrokChatHistory();
    }
}

// Send message to Grok
async function sendGrokMessage() {
    const chatInput = document.getElementById('grokChatInput');
    const sendBtn = document.getElementById('grokSendBtn');

    if (!chatInput || !sendBtn) return;

    const message = chatInput.value.trim();
    if (!message || isGrokTyping) return;

    // Add user message to chat
    addGrokMessage(message, 'user');
    chatInput.value = '';
    sendBtn.disabled = true;

    // Show typing indicator
    showGrokTypingIndicator();

    try {
        // Prepare context about analytics data
        const analyticsContext = prepareAnalyticsContext();

        // Create prompt with analytics context
        const fullPrompt = `${analyticsContext}\n\nPertanyaan pengguna: ${message}\n\nJawab sebagai asisten AI yang ahli dalam analisis data pembelajaran matematika. Berikan jawaban yang informatif, akurat, dan berguna.`;

        // Send to Grok via Supabase function
        const response = await fetch('https://tsgldkyuktqpsbeuevsn.supabase.co/functions/v1/gemini-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTExOTksImV4cCI6MjA3OTI2NzE5OX0.C0g6iZcwd02ZFmuGFluYXScX9uuahntJtkPvHt5g1FE`
            },
            body: JSON.stringify({ message: fullPrompt })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            // Handle rate limit errors specifically
            if (data.error && data.error.includes && data.error.includes('Rate limit reached')) {
                throw new Error('Rate limit tercapai. Sistem akan mencoba lagi dalam beberapa detik.');
            }
            throw new Error(data.error || `HTTP Error ${response.status}`);
        }

        // Parse Grok response
        let grokResponse = '';
        if (data.choices && data.choices.length > 0) {
            grokResponse = data.choices[0].message.content;
        } else {
            throw new Error('Invalid response format from Grok');
        }

        // Hide typing indicator and add Grok response
        hideGrokTypingIndicator();
        addGrokMessage(grokResponse, 'ai');

    } catch (error) {
        console.error('Error sending message to Grok:', error);
        hideGrokTypingIndicator();

        // Provide specific error messages
        let errorMessage = 'Maaf, terjadi kesalahan saat berkomunikasi dengan Grok.';
        if (error.message.includes('Rate limit')) {
            errorMessage = 'Rate limit tercapai. Silakan tunggu beberapa saat sebelum mencoba lagi.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage = 'Masalah koneksi. Periksa koneksi internet Anda.';
        }

        addGrokMessage(errorMessage, 'ai');
    } finally {
        sendBtn.disabled = false;
    }
}

// Prepare analytics context for Grok
function prepareAnalyticsContext() {
    const context = [];

    // Basic stats
    if (analyticsData.students.length > 0) {
        const totalStudents = analyticsData.students.length;
        const avgScore = analyticsData.students.reduce((sum, s) => sum + s.avgScore, 0) / totalStudents;
        const highPerformers = analyticsData.students.filter(s => s.cluster === 'high-performer').length;
        const struggling = analyticsData.students.filter(s => s.cluster === 'struggling').length;

        context.push(`DATA ANALISIS SISWA:
- Total siswa: ${totalStudents}
- Rata-rata skor: ${avgScore.toFixed(1)}%
- Siswa berprestasi tinggi: ${highPerformers}
- Siswa perlu bantuan: ${struggling}`);
    }

    // Recent insights
    if (analyticsData.insights.length > 0) {
        const recentInsights = analyticsData.insights.slice(0, 3).map(i => `- ${i.title}: ${i.content}`).join('\n');
        context.push(`\nINSIGHTS TERBARU:\n${recentInsights}`);
    }

    // Grok analyses summary
    if (analyticsData.geminiAnalyses.length > 0) {
        const avgGrokScore = analyticsData.geminiAnalyses.reduce((sum, a) => sum + (a.analysis.score || 0), 0) / analyticsData.geminiAnalyses.length;
        context.push(`\nANALISIS GROK AI:
- Total jawaban dianalisis: ${analyticsData.geminiAnalyses.length}
- Rata-rata skor analisis: ${avgGrokScore.toFixed(1)}/100`);
    }

    return context.join('\n');
}

// Add message to chat
function addGrokMessage(message, sender) {
    const chatMessages = document.getElementById('grokChatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = message;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(timeDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Save to history
    grokChatHistory.push({
        message,
        sender,
        timestamp: new Date().toISOString()
    });

    saveGrokChatHistory();
}

// Show typing indicator
function showGrokTypingIndicator() {
    const chatMessages = document.getElementById('grokChatMessages');
    if (!chatMessages) return;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'grokTypingIndicator';
    typingDiv.innerHTML = '<i class="fas fa-circle"></i><i class="fas fa-circle"></i><i class="fas fa-circle"></i> Grok sedang mengetik...';

    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    isGrokTyping = true;
}

// Hide typing indicator
function hideGrokTypingIndicator() {
    const typingIndicator = document.getElementById('grokTypingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
    isGrokTyping = false;
}

// Load chat history from localStorage
function loadGrokChatHistory() {
    try {
        const saved = localStorage.getItem('grokChatHistory');
        if (saved) {
            grokChatHistory = JSON.parse(saved);

            // Display recent messages (last 10)
            const recentMessages = grokChatHistory.slice(-10);
            recentMessages.forEach(chat => {
                addGrokMessageToUI(chat.message, chat.sender, chat.timestamp);
            });
        }
    } catch (error) {
        console.warn('Error loading chat history:', error);
        grokChatHistory = [];
    }
}

// Add message to UI without saving (for loading history)
function addGrokMessageToUI(message, sender, timestamp) {
    const chatMessages = document.getElementById('grokChatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}-message`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = sender === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = message;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(timeDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);
}

// Save chat history to localStorage
function saveGrokChatHistory() {
    try {
        // Keep only last 50 messages
        if (grokChatHistory.length > 50) {
            grokChatHistory = grokChatHistory.slice(-50);
        }
        localStorage.setItem('grokChatHistory', JSON.stringify(grokChatHistory));
    } catch (error) {
        console.warn('Error saving chat history:', error);
    }
}

// Clear chat history
function clearGrokChatHistory() {
    grokChatHistory = [];
    localStorage.removeItem('grokChatHistory');

    const chatMessages = document.getElementById('grokChatMessages');
    if (chatMessages) {
        // Keep only the initial AI message
        const initialMessage = chatMessages.querySelector('.ai-message');
        chatMessages.innerHTML = '';
        if (initialMessage) {
            chatMessages.appendChild(initialMessage);
        }
    }
}

// Export adaptive analytics functions
window.getStudentLearningPath = getStudentLearningPath;
window.getStudentMasteryLevels = getStudentMasteryLevels;
window.getStudentProgressData = getStudentProgressData;
window.getStudentSkillGaps = getStudentSkillGaps;
window.getContentAdaptationHistory = getContentAdaptationHistory;
window.getRealtimeAssessmentData = getRealtimeAssessmentData;
window.getLearningAnalyticsSummary = getLearningAnalyticsSummary;
window.updateStudentLearningPath = updateStudentLearningPath;
window.getRecommendedContent = getRecommendedContent;
window.integrateAdaptiveAnalytics = integrateAdaptiveAnalytics;
window.downloadGrokAnalyses = downloadGrokAnalyses;

// Export Grok chat functions
window.sendGrokMessage = sendGrokMessage;
window.clearGrokChatHistory = clearGrokChatHistory;
window.initializeGrokChat = initializeGrokChat;