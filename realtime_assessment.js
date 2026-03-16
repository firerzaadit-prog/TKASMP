// realtime_assessment.js - Real-time Assessment System for Continuous Learning Evaluation
// Integrates with adaptive_learning_engine.js, analytics.js, and question system

import { supabase } from './clientSupabase.js';
import { learningPathEngine } from './adaptive_learning_engine.js';
import { irtAnalyzer, calibrateAllItems, getItemParameters } from './irt_analysis.js';

// ==========================================
// BAYESIAN KNOWLEDGE TRACING MODEL
// ==========================================

class BayesianKnowledgeTracing {
    constructor() {
        // BKT parameters for each concept
        this.conceptParameters = new Map(); // conceptId -> { pL0, pT, pG, pS }
        this.knowledgeStates = new Map(); // userId_conceptId -> { pLearned, pSlip, pGuess, pTransition }
    }

    // Initialize BKT parameters for a concept (default values)
    initializeConceptParameters(conceptId) {
        if (!this.conceptParameters.has(conceptId)) {
            this.conceptParameters.set(conceptId, {
                pL0: 0.1,  // Prior probability of knowing the concept initially
                pT: 0.3,   // Probability of learning when opportunity arises
                pG: 0.2,   // Probability of guessing correctly when not known
                pS: 0.1    // Probability of slipping (answering incorrectly when known)
            });
        }
    }

    // Update knowledge state based on response
    updateKnowledgeState(userId, conceptId, isCorrect, opportunity = true) {
        this.initializeConceptParameters(conceptId);

        const key = `${userId}_${conceptId}`;
        const params = this.conceptParameters.get(conceptId);

        // Get current state or initialize
        let state = this.knowledgeStates.get(key) || {
            pLearned: params.pL0,
            pSlip: params.pS,
            pGuess: params.pG,
            pTransition: params.pT
        };

        // BKT update equations
        const pLearnedPrev = state.pLearned;
        const pNotLearnedPrev = 1 - pLearnedPrev;

        let pCorrect, pLearnedNew;

        if (isCorrect) {
            // Probability of correct response given learned/not learned
            pCorrect = pLearnedPrev * (1 - params.pS) + pNotLearnedPrev * params.pG;
            // Update learned probability
            pLearnedNew = (pLearnedPrev * (1 - params.pS)) / pCorrect;
        } else {
            // Probability of incorrect response
            pCorrect = pLearnedPrev * params.pS + pNotLearnedPrev * (1 - params.pG);
            // Update learned probability
            pLearnedNew = (pLearnedPrev * params.pS) / (1 - pCorrect);
        }

        // Apply learning if opportunity existed
        if (opportunity) {
            pLearnedNew = pLearnedNew + (1 - pLearnedNew) * params.pT;
        }

        // Update state
        state.pLearned = Math.max(0, Math.min(1, pLearnedNew));
        this.knowledgeStates.set(key, state);

        return state;
    }

    // Get current knowledge probability for a concept
    getKnowledgeProbability(userId, conceptId) {
        const key = `${userId}_${conceptId}`;
        const state = this.knowledgeStates.get(key);
        return state ? state.pLearned : 0.1; // Default prior
    }

    // Predict performance on next question
    predictPerformance(userId, conceptId) {
        const pLearned = this.getKnowledgeProbability(userId, conceptId);
        const params = this.conceptParameters.get(conceptId);

        if (!params) return 0.5;

        // Expected performance = P(L) * (1-P(S)) + (1-P(L)) * P(G)
        return pLearned * (1 - params.pS) + (1 - pLearned) * params.pG;
    }
}

// ==========================================
// INTERACTION TRACKER
// ==========================================

class InteractionTracker {
    constructor() {
        this.sessions = new Map(); // sessionId -> { userId, conceptId, interactions: [], startTime }
        this.eventListeners = new Map();
    }

    // Start tracking session
    startSession(sessionId, userId, conceptId) {
        this.sessions.set(sessionId, {
            userId,
            conceptId,
            interactions: [],
            startTime: Date.now(),
            lastActivity: Date.now()
        });

        this.attachEventListeners(sessionId);
    }

    // Track interaction
    trackInteraction(sessionId, interactionType, data = {}) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const interaction = {
            type: interactionType,
            timestamp: Date.now(),
            data: data,
            timeSinceStart: Date.now() - session.startTime,
            timeSinceLastActivity: Date.now() - session.lastActivity
        };

        session.interactions.push(interaction);
        session.lastActivity = Date.now();

        // Auto-save to database periodically
        if (session.interactions.length % 10 === 0) {
            this.saveInteractionsToDatabase(sessionId);
        }

        return interaction;
    }

    // Attach event listeners for automatic tracking
    attachEventListeners(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        // Mouse movement tracking
        const mouseMoveHandler = (e) => {
            this.trackInteraction(sessionId, 'mouse_move', {
                x: e.clientX,
                y: e.clientY,
                timestamp: Date.now()
            });
        };

        // Click tracking
        const clickHandler = (e) => {
            this.trackInteraction(sessionId, 'click', {
                x: e.clientX,
                y: e.clientY,
                target: e.target.tagName,
                timestamp: Date.now()
            });
        };

        // Scroll tracking
        let scrollTimeout;
        const scrollHandler = (e) => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.trackInteraction(sessionId, 'scroll', {
                    scrollTop: window.scrollY,
                    scrollHeight: document.body.scrollHeight,
                    timestamp: Date.now()
                });
            }, 250);
        };

        // Keyboard tracking
        const keyHandler = (e) => {
            this.trackInteraction(sessionId, 'keypress', {
                key: e.key,
                timestamp: Date.now()
            });
        };

        // Focus/blur tracking
        const focusHandler = () => {
            this.trackInteraction(sessionId, 'focus', { timestamp: Date.now() });
        };

        const blurHandler = () => {
            this.trackInteraction(sessionId, 'blur', { timestamp: Date.now() });
        };

        // Store listeners for cleanup
        this.eventListeners.set(sessionId, {
            mouseMoveHandler,
            clickHandler,
            scrollHandler,
            keyHandler,
            focusHandler,
            blurHandler
        });

        // Attach listeners
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('click', clickHandler);
        window.addEventListener('scroll', scrollHandler);
        document.addEventListener('keypress', keyHandler);
        window.addEventListener('focus', focusHandler);
        window.addEventListener('blur', blurHandler);
    }

    // Remove event listeners
    removeEventListeners(sessionId) {
        const listeners = this.eventListeners.get(sessionId);
        if (!listeners) return;

        document.removeEventListener('mousemove', listeners.mouseMoveHandler);
        document.removeEventListener('click', listeners.clickHandler);
        window.removeEventListener('scroll', listeners.scrollHandler);
        document.removeEventListener('keypress', listeners.keyHandler);
        window.removeEventListener('focus', listeners.focusHandler);
        window.removeEventListener('blur', listeners.blurHandler);

        this.eventListeners.delete(sessionId);
    }

    // End session and save data
    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        this.removeEventListeners(sessionId);
        await this.saveInteractionsToDatabase(sessionId);
        this.sessions.delete(sessionId);
    }

    // Save interactions to database
    async saveInteractionsToDatabase(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.interactions.length === 0) return;

        try {
            // Save to assessment_interactions table (assuming it exists)
            const interactionsToSave = session.interactions.slice(-10); // Last 10 interactions

            await supabase
                .from('assessment_interactions')
                .insert(interactionsToSave.map(interaction => ({
                    session_id: sessionId,
                    user_id: session.userId,
                    concept_id: session.conceptId,
                    interaction_type: interaction.type,
                    interaction_data: interaction.data,
                    timestamp: new Date(interaction.timestamp).toISOString(),
                    time_since_start: interaction.timeSinceStart,
                    time_since_last_activity: interaction.timeSinceLastActivity
                })));

            // Clear saved interactions
            session.interactions = session.interactions.slice(-5); // Keep last 5 for immediate access

        } catch (error) {
            console.error('Error saving interactions to database:', error);
        }
    }

    // Get session interactions
    getSessionInteractions(sessionId) {
        const session = this.sessions.get(sessionId);
        return session ? session.interactions : [];
    }
}

// ==========================================
// ADAPTIVE QUESTION SELECTOR
// ==========================================

class AdaptiveQuestionSelector {
    constructor() {
        this.questionPool = new Map(); // conceptId -> questions[]
        this.questionDifficulty = new Map(); // questionId -> difficulty (0-1)
        this.questionDiscrimination = new Map(); // questionId -> discrimination
        this.questionGuessing = new Map(); // questionId -> guessing parameter (c)
    }

    // Load questions for a concept
    async loadQuestionsForConcept(conceptId) {
        try {
            const { data: questions, error } = await supabase
                .from('questions')
                .select('*')
                .eq('concept_id', conceptId)
                .eq('is_active', true);

            if (error) {
                console.error('Error loading questions:', error);
                return [];
            }

            this.questionPool.set(conceptId, questions || []);

            // Estimate difficulty and discrimination for each question (now async)
            for (const question of questions || []) {
                await this.estimateQuestionParameters(question);
            }

            return questions || [];

        } catch (error) {
            console.error('Error in loadQuestionsForConcept:', error);
            return [];
        }
    }

    // Estimate question parameters using IRT - now uses actual data from irt_analysis.js
    async estimateQuestionParameters(question) {
        // First, try to get calibrated IRT parameters from database
        const calibratedParams = await this.getCalibratedIRTParameters(question.id);
        
        if (calibratedParams) {
            // Use calibrated parameters from IRT analysis
            this.questionDifficulty.set(question.id, calibratedParams.bParameter);
            this.questionDiscrimination.set(question.id, calibratedParams.aParameter);
            this.questionGuessing.set(question.id, calibratedParams.cParameter);
            return;
        }

        // Fallback: Simple estimation based on scoring weight and question type
        // This is used when no calibration data is available yet
        let difficulty = 0.5; // Default medium difficulty

        // Adjust based on scoring weight (higher weight = harder)
        if (question.scoring_weight) {
            difficulty = Math.min(0.9, Math.max(0.1, question.scoring_weight / 10));
        }

        // Adjust based on question type complexity
        const typeMultipliers = {
            'Pilihan Ganda': 1.0,
            'PGK MCMA': 1.2,
            'PGK Kategori': 1.3
        };

        difficulty *= typeMultipliers[question.question_type] || 1.0;

        this.questionDifficulty.set(question.id, difficulty);
        this.questionDiscrimination.set(question.id, 1.0); // Default discrimination
        
        // Set guessing parameter based on question type
        const guessingParams = {
            'Pilihan Ganda': 0.25,
            'PGK MCMA': 0.1,
            'PGK Kategori': 0.2
        };
        this.questionGuessing.set(question.id, guessingParams[question.question_type] || 0.25);
    }

    // Get calibrated IRT parameters from database
    async getCalibratedIRTParameters(questionId) {
        try {
            const { data, error } = await supabase
                .from('questions')
                .select('irt_a_parameter, irt_b_parameter, irt_c_parameter, difficulty_pvalue, discrimination_index, is_valid_item')
                .eq('id', questionId)
                .single();

            if (error || !data || !data.is_valid_item) {
                return null;
            }

            return {
                aParameter: data.irt_a_parameter || 1.0,
                bParameter: data.irt_b_parameter || 0.0,
                cParameter: data.irt_c_parameter || 0.25,
                pValue: data.difficulty_pvalue,
                discrimination: data.discrimination_index
            };
        } catch (error) {
            console.warn('Could not fetch IRT parameters:', error);
            return null;
        }
    }

    // Select next question based on current knowledge state using IRT
    // Uses Maximum Fisher Information criterion for optimal item selection
    selectNextQuestion(userId, conceptId, bktModel, excludeQuestions = []) {
        const questions = this.questionPool.get(conceptId) || [];
        const availableQuestions = questions.filter(q => !excludeQuestions.includes(q.id));

        if (availableQuestions.length === 0) {
            return null;
        }

        const knowledgeLevel = bktModel.getKnowledgeProbability(userId, conceptId);
        
        // Convert knowledge probability to theta (ability estimate)
        // Using logit transformation: theta = ln(P/(1-P))
        let theta = 0;
        if (knowledgeLevel > 0.01 && knowledgeLevel < 0.99) {
            theta = Math.log(knowledgeLevel / (1 - knowledgeLevel));
        } else if (knowledgeLevel >= 0.99) {
            theta = 3;
        } else {
            theta = -3;
        }

        // Select question using Maximum Fisher Information
        // This is the optimal criterion in IRT-based adaptive testing
        let bestQuestion = null;
        let maxInfo = -Infinity;

        availableQuestions.forEach(question => {
            const a = this.questionDiscrimination.get(question.id) || 1.0;
            const b = this.questionDifficulty.get(question.id) || 0.0;
            const c = this.questionGuessing.get(question.id) || 0.25;

            // Calculate Fisher Information at current theta
            const info = this.calculateFisherInformation(theta, a, b, c);

            if (info > maxInfo) {
                maxInfo = info;
                bestQuestion = question;
            }
        });

        // Fallback to difficulty matching if no good item found
        if (!bestQuestion) {
            let bestFit = Infinity;
            availableQuestions.forEach(question => {
                const difficulty = this.questionDifficulty.get(question.id) || 0.5;
                const fit = Math.abs(difficulty - knowledgeLevel);
                if (fit < bestFit) {
                    bestFit = fit;
                    bestQuestion = question;
                }
            });
        }

        return bestQuestion;
    }

    // Calculate Fisher Information for 3PL IRT model
    // I(θ) = a² * (1-c)² * e^(-a(θ-b)) / [(c + e^(-a(θ-b)))² * (1 + e^(-a(θ-b)))²]
    calculateFisherInformation(theta, a, b, c) {
        const expTerm = Math.exp(-a * (theta - b));
        const P = c + (1 - c) / (1 + expTerm);
        const Q = 1 - P;
        
        // Fisher Information formula for 3PL model
        const numerator = a * a * (1 - c) * (1 - c) * expTerm * expTerm;
        const denominator = P * P * Q * Q * (1 + expTerm) * (1 + expTerm);
        
        if (denominator === 0) return 0;
        return numerator / denominator;
    }

    // Get question by ID
    getQuestion(questionId) {
        for (const questions of this.questionPool.values()) {
            const question = questions.find(q => q.id === questionId);
            if (question) return question;
        }
        return null;
    }
}

// ==========================================
// ENGAGEMENT ANALYZER
// ==========================================

class EngagementAnalyzer {
    constructor() {
        this.engagementMetrics = new Map(); // sessionId -> metrics
    }

    // Calculate engagement score from interaction data
    calculateEngagementScore(sessionId, interactions, sessionDuration) {
        if (!interactions || interactions.length === 0) {
            return { score: 0, metrics: {} };
        }

        // Analyze different engagement indicators
        const metrics = {
            mouseActivity: this.analyzeMouseActivity(interactions),
            clickFrequency: this.analyzeClickFrequency(interactions, sessionDuration),
            scrollActivity: this.analyzeScrollActivity(interactions),
            focusTime: this.analyzeFocusTime(interactions, sessionDuration),
            typingActivity: this.analyzeTypingActivity(interactions),
            attentionSpans: this.analyzeAttentionSpans(interactions)
        };

        // Calculate overall engagement score (0-1)
        const weights = {
            mouseActivity: 0.15,
            clickFrequency: 0.2,
            scrollActivity: 0.15,
            focusTime: 0.25,
            typingActivity: 0.15,
            attentionSpans: 0.1
        };

        let totalScore = 0;
        let totalWeight = 0;

        Object.entries(metrics).forEach(([metric, value]) => {
            totalScore += value * weights[metric];
            totalWeight += weights[metric];
        });

        const engagementScore = totalWeight > 0 ? totalScore / totalWeight : 0;

        return {
            score: Math.max(0, Math.min(1, engagementScore)),
            metrics: metrics
        };
    }

    analyzeMouseActivity(interactions) {
        const mouseMoves = interactions.filter(i => i.type === 'mouse_move');
        const avgTimeBetweenMoves = mouseMoves.length > 1 ?
            (mouseMoves[mouseMoves.length - 1].timestamp - mouseMoves[0].timestamp) / mouseMoves.length : 0;

        // Lower time between moves = more active engagement
        return Math.max(0, Math.min(1, 1 - (avgTimeBetweenMoves / 5000))); // Normalize to 5 seconds
    }

    analyzeClickFrequency(interactions, sessionDuration) {
        const clicks = interactions.filter(i => i.type === 'click');
        const clickRate = clicks.length / (sessionDuration / 60000); // clicks per minute

        // Optimal click rate around 10-20 clicks per minute
        return Math.max(0, Math.min(1, clickRate / 15));
    }

    analyzeScrollActivity(interactions) {
        const scrolls = interactions.filter(i => i.type === 'scroll');
        const uniqueScrollPositions = new Set(scrolls.map(s => s.data.scrollTop)).size;

        // More unique scroll positions = better engagement
        return Math.min(1, uniqueScrollPositions / 10);
    }

    analyzeFocusTime(interactions, sessionDuration) {
        const focusEvents = interactions.filter(i => i.type === 'focus');
        const blurEvents = interactions.filter(i => i.type === 'blur');

        let focusedTime = sessionDuration;
        let lastBlurTime = 0;

        blurEvents.forEach(blur => {
            if (lastBlurTime > 0) {
                focusedTime -= (blur.timestamp - lastBlurTime);
            }
            lastBlurTime = blur.timestamp;
        });

        return focusedTime / sessionDuration;
    }

    analyzeTypingActivity(interactions) {
        const keypresses = interactions.filter(i => i.type === 'keypress');
        const typingRate = keypresses.length / 60; // keys per second (assuming 1 minute window)

        // Moderate typing activity indicates engagement
        return Math.max(0, Math.min(1, typingRate / 2));
    }

    analyzeAttentionSpans(interactions) {
        // Calculate periods of continuous activity
        const activityTimestamps = interactions
            .filter(i => ['click', 'scroll', 'keypress'].includes(i.type))
            .map(i => i.timestamp)
            .sort((a, b) => a - b);

        if (activityTimestamps.length < 2) return 0;

        // Calculate average gap between activities
        let totalGap = 0;
        for (let i = 1; i < activityTimestamps.length; i++) {
            totalGap += activityTimestamps[i] - activityTimestamps[i - 1];
        }

        const avgGap = totalGap / (activityTimestamps.length - 1);

        // Smaller gaps = better sustained attention
        return Math.max(0, Math.min(1, 1 - (avgGap / 30000))); // Normalize to 30 seconds
    }
}

// ==========================================
// IMMEDIATE FEEDBACK PROVIDER
// ==========================================

class ImmediateFeedbackProvider {
    constructor() {
        this.feedbackRules = new Map(); // conceptId -> feedback rules
        this.hintTemplates = new Map(); // conceptId -> hint templates
        this.initializeFeedbackRules();
    }

    initializeFeedbackRules() {
        // Define feedback rules for different concepts
        const rules = {
            'aritmatika_dasar': {
                correct: [
                    "Bagus! Kamu memahami konsep dasar aritmatika.",
                    "Jawaban benar! Operasi aritmatika dasar sudah tepat."
                ],
                incorrect: [
                    "Periksa kembali operasi aritmatika dasar.",
                    "Ada kesalahan dalam perhitungan. Coba lagi."
                ],
                hints: [
                    "Ingat: penjumlahan (+) menambah nilai, pengurangan (-) mengurang nilai.",
                    "Perkalian (×) adalah penjumlahan berulang, pembagian (÷) adalah pengurangan berulang."
                ]
            },
            'persamaan_linear': {
                correct: [
                    "Excellent! Konsep persamaan linear sudah dikuasai.",
                    "Benar! Manipulasi persamaan linear sudah tepat."
                ],
                incorrect: [
                    "Periksa kembali langkah-langkah penyelesaian persamaan.",
                    "Ada kesalahan dalam manipulasi aljabar."
                ],
                hints: [
                    "Ingat: apa yang dilakukan pada satu sisi persamaan harus dilakukan juga pada sisi lainnya.",
                    "Gabungkan suku-suku sejenis terlebih dahulu."
                ]
            }
            // Add more concept-specific rules as needed
        };

        Object.entries(rules).forEach(([conceptId, rule]) => {
            this.feedbackRules.set(conceptId, rule);
        });
    }

    // Provide immediate feedback based on response
    provideFeedback(userId, questionId, response, isCorrect, conceptId, knowledgeLevel) {
        const rules = this.feedbackRules.get(conceptId) || this.getDefaultRules();

        let feedback = {
            isCorrect: isCorrect,
            message: '',
            hint: null,
            encouragement: '',
            nextSteps: []
        };

        // Select appropriate message
        if (isCorrect) {
            feedback.message = rules.correct[Math.floor(Math.random() * rules.correct.length)];
            feedback.encouragement = this.getEncouragementMessage(knowledgeLevel);
        } else {
            feedback.message = rules.incorrect[Math.floor(Math.random() * rules.incorrect.length)];
            feedback.hint = this.selectHint(rules.hints, knowledgeLevel);
            feedback.nextSteps = this.getNextSteps(conceptId, knowledgeLevel);
        }

        return feedback;
    }

    // Select appropriate hint based on knowledge level
    selectHint(hints, knowledgeLevel) {
        if (!hints || hints.length === 0) return null;

        // For lower knowledge levels, provide more basic hints
        if (knowledgeLevel < 0.3) {
            return hints[0]; // Most basic hint
        } else if (knowledgeLevel < 0.7) {
            return hints[Math.floor(hints.length / 2)]; // Intermediate hint
        } else {
            return hints[hints.length - 1]; // Advanced hint
        }
    }

    // Get encouragement message
    getEncouragementMessage(knowledgeLevel) {
        if (knowledgeLevel > 0.8) {
            return "Kamu sudah mahir! Pertahankan performa ini.";
        } else if (knowledgeLevel > 0.6) {
            return "Bagus! Kamu semakin memahami konsep ini.";
        } else {
            return "Ada kemajuan! Terus belajar ya.";
        }
    }

    // Get next steps recommendations
    getNextSteps(conceptId, knowledgeLevel) {
        const steps = [];

        if (knowledgeLevel < 0.5) {
            steps.push("Pelajari ulang konsep dasar");
            steps.push("Kerjakan latihan tambahan");
        } else if (knowledgeLevel < 0.8) {
            steps.push("Coba soal yang lebih menantang");
            steps.push("Praktikkan variasi masalah");
        } else {
            steps.push("Siap untuk konsep lanjutan");
        }

        return steps;
    }

    // Default feedback rules
    getDefaultRules() {
        return {
            correct: ["Jawaban benar! Bagus sekali."],
            incorrect: ["Jawaban belum tepat. Coba lagi."],
            hints: ["Periksa kembali pemahaman konsep Anda."]
        };
    }
}

// ==========================================
// REAL-TIME ASSESSMENT ENGINE
// ==========================================

class RealTimeAssessmentEngine {
    constructor() {
        this.bkt = new BayesianKnowledgeTracing();
        this.interactionTracker = new InteractionTracker();
        this.questionSelector = new AdaptiveQuestionSelector();
        this.engagementAnalyzer = new EngagementAnalyzer();
        this.feedbackProvider = new ImmediateFeedbackProvider();

        this.activeSessions = new Map(); // sessionId -> session data
    }

    // Start assessment session
    async startAssessmentSession(userId, conceptId) {
        try {
            // Generate unique session ID
            const sessionId = `assessment_${userId}_${conceptId}_${Date.now()}`;

            // Create session record
            const { data: session, error } = await supabase
                .from('assessment_sessions')
                .insert([{
                    id: sessionId,
                    user_id: userId,
                    concept_id: conceptId,
                    start_time: new Date().toISOString(),
                    status: 'active'
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating assessment session:', error);
                return null;
            }

            // Initialize session data
            const sessionData = {
                sessionId: sessionId,
                userId: userId,
                conceptId: conceptId,
                startTime: Date.now(),
                currentQuestion: null,
                questionHistory: [],
                knowledgeState: this.bkt.getKnowledgeProbability(userId, conceptId),
                engagementScore: 0,
                status: 'active'
            };

            this.activeSessions.set(sessionId, sessionData);

            // Start interaction tracking
            this.interactionTracker.startSession(sessionId, userId, conceptId);

            // Load questions for the concept
            await this.questionSelector.loadQuestionsForConcept(conceptId);

            // Track session start
            this.interactionTracker.trackInteraction(sessionId, 'session_start', {
                conceptId: conceptId,
                initialKnowledge: sessionData.knowledgeState
            });

            console.log('Assessment session started:', sessionId);
            return sessionId;

        } catch (error) {
            console.error('Error starting assessment session:', error);
            return null;
        }
    }

    // Track user interaction
    trackInteraction(userId, interactionType, data = {}) {
        // Find active session for user
        const activeSession = Array.from(this.activeSessions.values())
            .find(session => session.userId === userId && session.status === 'active');

        if (activeSession) {
            return this.interactionTracker.trackInteraction(activeSession.sessionId, interactionType, data);
        }

        return null;
    }

    // Assess understanding based on response
    async assessUnderstanding(userId, conceptId, responseData) {
        const activeSession = Array.from(this.activeSessions.values())
            .find(session => session.userId === userId && session.conceptId === conceptId && session.status === 'active');

        if (!activeSession) {
            console.warn('No active assessment session found for user:', userId);
            return null;
        }

        const { questionId, selectedAnswer, timeSpent } = responseData;

        // Get question details
        const question = this.questionSelector.getQuestion(questionId);
        if (!question) {
            console.error('Question not found:', questionId);
            return null;
        }

        // Determine if answer is correct
        let isCorrect = false;
        if (question.question_type === 'PGK MCMA') {
            const selectedAnswers = selectedAnswer.split(',').sort();
            const correctAnswers = Array.isArray(question.correct_answers)
                ? question.correct_answers.sort()
                : (question.correct_answers || '').split(',').sort();
            isCorrect = JSON.stringify(selectedAnswers) === JSON.stringify(correctAnswers);
        } else {
            isCorrect = selectedAnswer === question.correct_answer;
        }

        // Update BKT model
        const newKnowledgeState = this.bkt.updateKnowledgeState(userId, conceptId, isCorrect, true);

        // Update session data
        activeSession.questionHistory.push({
            questionId: questionId,
            selectedAnswer: selectedAnswer,
            isCorrect: isCorrect,
            timeSpent: timeSpent,
            knowledgeBefore: activeSession.knowledgeState,
            knowledgeAfter: newKnowledgeState.pLearned,
            timestamp: Date.now()
        });

        activeSession.knowledgeState = newKnowledgeState.pLearned;

        // Update mastery tracker in adaptive learning engine
        const tracker = learningPathEngine.getTracker(userId);
        const performance = isCorrect ? 1.0 : 0.0;
        tracker.updateMastery(conceptId, performance);

        // Track assessment response
        this.interactionTracker.trackInteraction(activeSession.sessionId, 'assessment_response', {
            questionId: questionId,
            isCorrect: isCorrect,
            timeSpent: timeSpent,
            knowledgeChange: newKnowledgeState.pLearned - activeSession.questionHistory[activeSession.questionHistory.length - 1].knowledgeBefore
        });

        // Save response to database
        await this.saveAssessmentResponse(activeSession.sessionId, questionId, selectedAnswer, isCorrect, timeSpent, newKnowledgeState.pLearned);

        return {
            isCorrect: isCorrect,
            knowledgeState: newKnowledgeState,
            performance: performance,
            assessment: {
                questionId: questionId,
                conceptId: conceptId,
                difficulty: this.questionSelector.questionDifficulty.get(questionId) || 0.5,
                discrimination: this.questionSelector.questionDiscrimination.get(questionId) || 1.0
            }
        };
    }

    // Get next adaptive question
    async getNextAdaptiveQuestion(userId, conceptId) {
        const activeSession = Array.from(this.activeSessions.values())
            .find(session => session.userId === userId && session.conceptId === conceptId && session.status === 'active');

        if (!activeSession) {
            console.warn('No active assessment session found for user:', userId);
            return null;
        }

        // Get questions already asked in this session
        const askedQuestions = activeSession.questionHistory.map(h => h.questionId);

        // Select next question using adaptive algorithm
        const nextQuestion = this.questionSelector.selectNextQuestion(
            userId,
            conceptId,
            this.bkt,
            askedQuestions
        );

        if (nextQuestion) {
            activeSession.currentQuestion = nextQuestion.id;

            // Track question selection
            this.interactionTracker.trackInteraction(activeSession.sessionId, 'question_selected', {
                questionId: nextQuestion.id,
                difficulty: this.questionSelector.questionDifficulty.get(nextQuestion.id) || 0.5,
                knowledgeLevel: activeSession.knowledgeState
            });

            return {
                questionId: nextQuestion.id,
                question: nextQuestion,
                predictedDifficulty: this.questionSelector.questionDifficulty.get(nextQuestion.id) || 0.5,
                knowledgeState: activeSession.knowledgeState,
                sessionProgress: activeSession.questionHistory.length
            };
        }

        return null; // No more questions available
    }

    // Provide immediate feedback
    provideImmediateFeedback(userId, questionId, response) {
        const activeSession = Array.from(this.activeSessions.values())
            .find(session => session.userId === userId && session.status === 'active');

        if (!activeSession) {
            return null;
        }

        // Find the response in history
        const responseHistory = activeSession.questionHistory.find(h => h.questionId === questionId);
        if (!responseHistory) {
            return null;
        }

        return this.feedbackProvider.provideFeedback(
            userId,
            questionId,
            response,
            responseHistory.isCorrect,
            activeSession.conceptId,
            activeSession.knowledgeState
        );
    }

    // Calculate engagement score
    calculateEngagementScore(userId, sessionData = null) {
        const activeSession = Array.from(this.activeSessions.values())
            .find(session => session.userId === userId && session.status === 'active');

        if (!activeSession) {
            return { score: 0, metrics: {} };
        }

        // Get interactions for this session
        const interactions = sessionData ? sessionData.interactions :
            this.interactionTracker.getSessionInteractions(activeSession.sessionId);

        const sessionDuration = Date.now() - activeSession.startTime;

        const engagement = this.engagementAnalyzer.calculateEngagementScore(
            activeSession.sessionId,
            interactions,
            sessionDuration
        );

        // Update session engagement score
        activeSession.engagementScore = engagement.score;

        return engagement;
    }

    // End assessment session
    async endAssessmentSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return;

        // Calculate final metrics
        const finalEngagement = this.calculateEngagementScore(session.userId);
        const finalKnowledge = session.knowledgeState;
        const questionsAnswered = session.questionHistory.length;
        const correctAnswers = session.questionHistory.filter(h => h.isCorrect).length;
        const accuracy = questionsAnswered > 0 ? correctAnswers / questionsAnswered : 0;

        // Update session record
        await supabase
            .from('assessment_sessions')
            .update({
                end_time: new Date().toISOString(),
                final_knowledge_state: finalKnowledge,
                engagement_score: finalEngagement.score,
                questions_answered: questionsAnswered,
                accuracy: accuracy,
                status: 'completed'
            })
            .eq('id', sessionId);

        // End interaction tracking
        await this.interactionTracker.endSession(sessionId);

        // Clean up
        this.activeSessions.delete(sessionId);

        console.log('Assessment session ended:', sessionId);

        return {
            sessionId: sessionId,
            duration: Date.now() - session.startTime,
            finalKnowledge: finalKnowledge,
            engagementScore: finalEngagement.score,
            questionsAnswered: questionsAnswered,
            accuracy: accuracy
        };
    }

    // Save assessment response to database
    async saveAssessmentResponse(sessionId, questionId, selectedAnswer, isCorrect, timeSpent, knowledgeState) {
        try {
            await supabase
                .from('assessment_responses')
                .insert([{
                    session_id: sessionId,
                    question_id: questionId,
                    selected_answer: selectedAnswer,
                    is_correct: isCorrect,
                    time_spent: timeSpent,
                    knowledge_state: knowledgeState,
                    timestamp: new Date().toISOString()
                }]);

        } catch (error) {
            console.error('Error saving assessment response:', error);
        }
    }

    // Get session summary
    getSessionSummary(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return null;

        return {
            sessionId: session.sessionId,
            userId: session.userId,
            conceptId: session.conceptId,
            startTime: session.startTime,
            duration: Date.now() - session.startTime,
            questionsAnswered: session.questionHistory.length,
            currentKnowledge: session.knowledgeState,
            engagementScore: session.engagementScore,
            status: session.status
        };
    }
}

// ==========================================
// EXPORTS
// ==========================================

const realtimeAssessmentEngine = new RealTimeAssessmentEngine();

export {
    BayesianKnowledgeTracing,
    InteractionTracker,
    AdaptiveQuestionSelector,
    EngagementAnalyzer,
    ImmediateFeedbackProvider,
    RealTimeAssessmentEngine,
    realtimeAssessmentEngine
};

// Main API functions
export async function startAssessmentSession(userId, conceptId) {
    return await realtimeAssessmentEngine.startAssessmentSession(userId, conceptId);
}

export function trackInteraction(userId, interactionType, data) {
    return realtimeAssessmentEngine.trackInteraction(userId, interactionType, data);
}

export async function assessUnderstanding(userId, conceptId, responseData) {
    return await realtimeAssessmentEngine.assessUnderstanding(userId, conceptId, responseData);
}

export async function getNextAdaptiveQuestion(userId, conceptId) {
    return await realtimeAssessmentEngine.getNextAdaptiveQuestion(userId, conceptId);
}

export function provideImmediateFeedback(userId, questionId, response) {
    return realtimeAssessmentEngine.provideImmediateFeedback(userId, questionId, response);
}

export function calculateEngagementScore(userId, sessionData) {
    return realtimeAssessmentEngine.calculateEngagementScore(userId, sessionData);
}

export async function endAssessmentSession(sessionId) {
    return await realtimeAssessmentEngine.endAssessmentSession(sessionId);
}

// Utility functions
export function getActiveSessions() {
    return Array.from(realtimeAssessmentEngine.activeSessions.values());
}

export function getSessionSummary(sessionId) {
    return realtimeAssessmentEngine.getSessionSummary(sessionId);
}