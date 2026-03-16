// content_adaptation.js - Content Adaptation Logic Module
// Handles dynamic content adaptation based on student performance and needs

import { supabase } from './clientSupabase.js';
import { learningPathEngine, getStudentTracker } from './adaptive_learning_engine.js';
import { predictNextExamPerformance, identifySkillGaps } from './predictive_models.js';

// ==========================================
// CONTENT ADAPTATION ENGINE
// ==========================================

class ContentAdaptationEngine {
    constructor() {
        this.adaptationStrategies = new Map();
        this.contentTemplates = new Map();
        this.initializeStrategies();
    }

    initializeStrategies() {
        // Define adaptation strategies for different content types
        this.adaptationStrategies.set('text', {
            difficultyLevels: ['basic', 'intermediate', 'advanced'],
            adaptationRules: this.getTextAdaptationRules()
        });

        this.adaptationStrategies.set('video', {
            speedOptions: [0.75, 1.0, 1.25, 1.5],
            adaptationRules: this.getVideoAdaptationRules()
        });

        this.adaptationStrategies.set('interactive', {
            scaffoldLevels: ['full_support', 'partial_support', 'minimal_support', 'independent'],
            adaptationRules: this.getInteractiveAdaptationRules()
        });
    }

    getTextAdaptationRules() {
        return {
            basic: {
                vocabulary: 'simple',
                sentenceLength: 'short',
                examples: 'concrete',
                explanations: 'step_by_step'
            },
            intermediate: {
                vocabulary: 'moderate',
                sentenceLength: 'medium',
                examples: 'mixed',
                explanations: 'guided'
            },
            advanced: {
                vocabulary: 'complex',
                sentenceLength: 'long',
                examples: 'abstract',
                explanations: 'concise'
            }
        };
    }

    getVideoAdaptationRules() {
        return {
            slow: { speed: 0.75, pauses: 'frequent', repetition: 'high' },
            normal: { speed: 1.0, pauses: 'moderate', repetition: 'medium' },
            fast: { speed: 1.25, pauses: 'minimal', repetition: 'low' }
        };
    }

    getInteractiveAdaptationRules() {
        return {
            full_support: {
                hints: 'always_available',
                feedback: 'immediate_detailed',
                attempts: 'unlimited'
            },
            partial_support: {
                hints: 'on_request',
                feedback: 'immediate_brief',
                attempts: 'limited'
            },
            minimal_support: {
                hints: 'limited',
                feedback: 'delayed',
                attempts: 'few'
            },
            independent: {
                hints: 'none',
                feedback: 'on_completion',
                attempts: 'strict'
            }
        };
    }
}

// ==========================================
// MAIN ADAPTATION FUNCTIONS
// ==========================================

/**
 * Adapt content for a specific student based on their current performance
 * @param {string} userId - Student ID
 * @param {string} contentId - Content ID to adapt
 * @param {number} currentPerformance - Current performance score (0-1)
 * @returns {Object} Adapted content configuration
 */
export async function adaptContentForStudent(userId, contentId, currentPerformance) {
    try {
        console.log(`Adapting content ${contentId} for student ${userId}`);

        // Get student profile and learning context
        const studentProfile = await getStudentProfile(userId);
        const contentInfo = await getContentInfo(contentId);
        const learningContext = await getLearningContext(userId, contentId);

        // Calculate optimal difficulty
        const optimalDifficulty = await calculateOptimalDifficulty(userId, contentId);

        // Determine adaptation strategy
        const adaptationStrategy = determineAdaptationStrategy(
            currentPerformance,
            studentProfile,
            contentInfo,
            learningContext
        );

        // Generate adapted content
        const adaptedContent = await generateAdaptedContent(
            contentInfo,
            adaptationStrategy,
            studentProfile
        );

        // Record adaptation for analytics
        await recordContentAdaptation(userId, contentId, adaptationStrategy);

        return {
            contentId,
            adaptedContent,
            adaptationStrategy,
            optimalDifficulty,
            reasoning: generateAdaptationReasoning(adaptationStrategy, currentPerformance)
        };

    } catch (error) {
        console.error('Error adapting content for student:', error);
        return getDefaultContent(contentId);
    }
}

/**
 * Adjust difficulty level based on performance metrics
 * @param {string} userId - Student ID
 * @param {string} conceptId - Concept ID
 * @param {Object} performanceMetrics - Performance data
 * @returns {Object} Difficulty adjustment result
 */
export async function adjustDifficultyLevel(userId, conceptId, performanceMetrics) {
    try {
        const tracker = getStudentTracker(userId);
        const currentMastery = tracker.getMastery(conceptId) || 0;

        // Analyze performance metrics
        const performanceScore = calculatePerformanceScore(performanceMetrics);
        const trend = analyzePerformanceTrend(performanceMetrics);

        // Calculate difficulty adjustment
        let adjustment = 0;
        let reasoning = '';

        if (performanceScore < 0.4) {
            // Poor performance - decrease difficulty
            adjustment = -1;
            reasoning = 'Performance below threshold, reducing difficulty to build confidence';
        } else if (performanceScore > 0.8 && trend === 'improving') {
            // Excellent performance with positive trend - increase difficulty
            adjustment = 1;
            reasoning = 'Strong performance with improvement trend, increasing challenge level';
        } else if (performanceScore > 0.6 && currentMastery > 0.7) {
            // Good performance and high mastery - slight increase
            adjustment = 0.5;
            reasoning = 'Consistent good performance, gradually increasing difficulty';
        } else if (performanceScore < 0.6 && trend === 'declining') {
            // Declining performance - decrease difficulty
            adjustment = -0.5;
            reasoning = 'Performance declining, providing additional support';
        }

        // Get base difficulty and calculate new level
        const baseDifficulty = await getConceptDifficulty(conceptId);
        const newDifficulty = Math.max(1, Math.min(5, baseDifficulty + adjustment));

        // Update mastery based on performance
        tracker.updateMastery(conceptId, performanceScore);

        return {
            conceptId,
            originalDifficulty: baseDifficulty,
            newDifficulty: Math.round(newDifficulty),
            adjustment: adjustment,
            reasoning: reasoning,
            performanceScore: performanceScore,
            trend: trend
        };

    } catch (error) {
        console.error('Error adjusting difficulty level:', error);
        return {
            conceptId,
            adjustment: 0,
            reasoning: 'Error occurred, maintaining current difficulty'
        };
    }
}

/**
 * Generate personalized content based on student profile
 * @param {Object} contentTemplate - Base content template
 * @param {Object} studentProfile - Student profile data
 * @returns {Object} Personalized content
 */
export async function generatePersonalizedContent(contentTemplate, studentProfile) {
    try {
        const personalizedContent = { ...contentTemplate };

        // Adapt based on learning style
        if (studentProfile.learningStyle) {
            personalizedContent.presentation = adaptForLearningStyle(
                contentTemplate.presentation,
                studentProfile.learningStyle
            );
        }

        // Adapt based on prior knowledge
        if (studentProfile.priorKnowledge) {
            personalizedContent.prerequisites = filterPrerequisites(
                contentTemplate.prerequisites,
                studentProfile.priorKnowledge
            );
        }

        // Adapt examples based on interests/context
        if (studentProfile.interests) {
            personalizedContent.examples = personalizeExamples(
                contentTemplate.examples,
                studentProfile.interests
            );
        }

        // Adjust pacing based on student preferences
        if (studentProfile.pace) {
            personalizedContent.pacing = calculateOptimalPacing(
                studentProfile.userId,
                contentTemplate.contentType
            );
        }

        return personalizedContent;

    } catch (error) {
        console.error('Error generating personalized content:', error);
        return contentTemplate; // Return original if personalization fails
    }
}

/**
 * Calculate optimal pacing for content delivery
 * @param {string} userId - Student ID
 * @param {string} contentType - Type of content
 * @returns {Object} Pacing configuration
 */
export async function calculateOptimalPacing(userId, contentType) {
    try {
        // Get student preferences and history
        const studentData = await getStudentData(userId);
        const pacePreference = studentData.preferences?.pace || 'moderate';

        // Analyze recent learning sessions
        const recentSessions = await getRecentLearningSessions(userId);
        const avgTimePerSession = calculateAverageSessionTime(recentSessions);

        // Calculate optimal pacing based on content type and student data
        const basePacing = getBasePacingForContentType(contentType);
        const adjustedPacing = adjustPacingForStudent(basePacing, pacePreference, avgTimePerSession);

        return {
            contentType,
            pacePreference,
            recommendedPacing: adjustedPacing,
            estimatedDuration: calculateEstimatedDuration(adjustedPacing, contentType),
            breaks: calculateOptimalBreaks(adjustedPacing)
        };

    } catch (error) {
        console.error('Error calculating optimal pacing:', error);
        return getDefaultPacing(contentType);
    }
}

/**
 * Provide adaptive hints based on student struggle level
 * @param {string} userId - Student ID
 * @param {string} conceptId - Concept ID
 * @param {number} struggleLevel - Level of struggle (0-1)
 * @returns {Object} Adaptive hints configuration
 */
export async function provideAdaptiveHints(userId, conceptId, struggleLevel) {
    try {
        const hintLevels = {
            low: ['minimal_hint'],
            medium: ['concept_reminder', 'similar_example'],
            high: ['step_by_step_solution', 'alternative_approach', 'practice_exercise']
        };

        // Determine hint level based on struggle
        let hintLevel;
        if (struggleLevel < 0.3) hintLevel = 'low';
        else if (struggleLevel < 0.7) hintLevel = 'medium';
        else hintLevel = 'high';

        // Get concept-specific hints
        const conceptHints = await getConceptHints(conceptId);
        const availableHints = hintLevels[hintLevel];

        // Select appropriate hints
        const selectedHints = availableHints.map(hintType => {
            const hints = conceptHints[hintType] || [];
            return hints.length > 0 ? hints[Math.floor(Math.random() * hints.length)] : null;
        }).filter(hint => hint !== null);

        // Generate progressive hint sequence
        const hintSequence = generateHintSequence(selectedHints, struggleLevel);

        return {
            conceptId,
            struggleLevel,
            hintLevel,
            hints: hintSequence,
            timing: calculateHintTiming(struggleLevel),
            effectiveness: await predictHintEffectiveness(userId, conceptId, hintSequence)
        };

    } catch (error) {
        console.error('Error providing adaptive hints:', error);
        return getDefaultHints(conceptId);
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function getStudentProfile(userId) {
    // Get student profile from database
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.warn('Error fetching student profile:', error);
        return { userId, learningStyle: 'visual', pace: 'moderate' };
    }

    return data;
}

async function getContentInfo(contentId) {
    // Get content information from materials table
    const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', contentId)
        .single();

    if (error) {
        console.warn('Error fetching content info:', error);
        return { id: contentId, difficulty: 3, contentType: 'text' };
    }

    return data;
}

async function getLearningContext(userId, contentId) {
    // Get learning context including recent performance
    const recentSessions = await getRecentLearningSessions(userId);
    const skillGaps = await identifySkillGaps([], []); // Would need proper data

    return {
        recentPerformance: calculateAveragePerformance(recentSessions),
        skillGaps: skillGaps,
        timeOfDay: new Date().getHours(),
        sessionCount: recentSessions.length
    };
}

function determineAdaptationStrategy(performance, profile, content, context) {
    const strategy = {
        difficulty: performance < 0.5 ? 'easier' : performance > 0.8 ? 'harder' : 'maintain',
        pacing: profile.pace || 'moderate',
        support: performance < 0.6 ? 'high' : performance > 0.8 ? 'low' : 'medium',
        multimedia: adaptMultimediaForPerformance(performance, content.contentType)
    };

    return strategy;
}

async function generateAdaptedContent(contentInfo, strategy, profile) {
    // This would implement the actual content transformation
    // For now, return modified content structure
    return {
        ...contentInfo,
        adaptedDifficulty: strategy.difficulty,
        pacing: strategy.pacing,
        supportLevel: strategy.support,
        multimediaSettings: strategy.multimedia
    };
}

function calculatePerformanceScore(metrics) {
    // Calculate overall performance score from metrics
    const weights = {
        accuracy: 0.4,
        speed: 0.2,
        consistency: 0.2,
        improvement: 0.2
    };

    return (
        (metrics.accuracy || 0) * weights.accuracy +
        (metrics.speed || 0) * weights.speed +
        (metrics.consistency || 0) * weights.consistency +
        (metrics.improvement || 0) * weights.improvement
    );
}

function analyzePerformanceTrend(metrics) {
    // Simple trend analysis
    if (!metrics.recentScores || metrics.recentScores.length < 2) {
        return 'stable';
    }

    const recent = metrics.recentScores.slice(-3);
    const trend = recent[recent.length - 1] - recent[0];

    if (trend > 5) return 'improving';
    if (trend < -5) return 'declining';
    return 'stable';
}

async function getConceptDifficulty(conceptId) {
    // Get difficulty from concept graph
    const graph = learningPathEngine.graph;
    return graph.getDifficulty(conceptId) || 3;
}

function generateAdaptationReasoning(strategy, performance) {
    return `Content adapted based on ${performance.toFixed(2)} performance score. ` +
           `Difficulty: ${strategy.difficulty}, Support: ${strategy.support}, Pacing: ${strategy.pacing}`;
}

function getDefaultContent(contentId) {
    return {
        contentId,
        adaptedContent: { difficulty: 3, pacing: 'moderate', support: 'medium' },
        adaptationStrategy: { difficulty: 'maintain', pacing: 'moderate', support: 'medium' },
        reasoning: 'Using default adaptation due to error'
    };
}

async function recordContentAdaptation(userId, contentId, strategy) {
    // Record adaptation in database for analytics
    try {
        await supabase
            .from('content_adaptations')
            .insert({
                user_id: userId,
                content_id: contentId,
                strategy: strategy,
                timestamp: new Date()
            });
    } catch (error) {
        console.warn('Failed to record content adaptation:', error);
    }
}

// ==========================================
// ADDITIONAL HELPER FUNCTIONS
// ==========================================

async function getStudentData(userId) {
    // Get student data from database
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) {
        console.warn('Error fetching student data:', error);
        return { preferences: { pace: 'moderate' } };
    }

    return data;
}

async function getRecentLearningSessions(userId, limit = 10) {
    // Get recent learning sessions
    const { data, error } = await supabase
        .from('learning_sessions')
        .select('*')
        .eq('student_id', userId)
        .order('session_start', { ascending: false })
        .limit(limit);

    if (error) {
        console.warn('Error fetching learning sessions:', error);
        return [];
    }

    return data || [];
}

function calculateAverageSessionTime(sessions) {
    if (sessions.length === 0) return 1800; // 30 minutes default

    const totalTime = sessions.reduce((sum, session) => {
        if (session.session_end && session.session_start) {
            const duration = new Date(session.session_end) - new Date(session.session_start);
            return sum + (duration / 1000); // Convert to seconds
        }
        return sum;
    }, 0);

    return totalTime / sessions.length;
}

function getBasePacingForContentType(contentType) {
    const pacingMap = {
        'text': { chunks: 5, breakDuration: 2, totalTime: 25 },
        'video': { chunks: 3, breakDuration: 1, totalTime: 20 },
        'interactive': { chunks: 4, breakDuration: 3, totalTime: 30 },
        'quiz': { chunks: 10, breakDuration: 1, totalTime: 15 }
    };

    return pacingMap[contentType] || pacingMap.text;
}

function adjustPacingForStudent(basePacing, pacePreference, avgTime) {
    const paceMultipliers = {
        'slow': 1.5,
        'moderate': 1.0,
        'fast': 0.7
    };

    const multiplier = paceMultipliers[pacePreference] || 1.0;
    const timeAdjustment = avgTime > 2400 ? 1.2 : avgTime < 1200 ? 0.8 : 1.0; // Based on 20-40 min sessions

    return {
        chunks: Math.max(1, Math.round(basePacing.chunks * multiplier)),
        breakDuration: Math.max(1, Math.round(basePacing.breakDuration * multiplier)),
        totalTime: Math.round(basePacing.totalTime * multiplier * timeAdjustment)
    };
}

function calculateEstimatedDuration(pacing, contentType) {
    // Estimate total duration in minutes
    return pacing.totalTime + (pacing.chunks - 1) * pacing.breakDuration;
}

function calculateOptimalBreaks(pacing) {
    const breaks = [];
    for (let i = 1; i < pacing.chunks; i++) {
        breaks.push({
            afterChunk: i,
            duration: pacing.breakDuration,
            suggestion: i % 2 === 0 ? 'Stand up and stretch' : 'Review what you learned'
        });
    }
    return breaks;
}

function getDefaultPacing(contentType) {
    return {
        contentType,
        pacePreference: 'moderate',
        recommendedPacing: getBasePacingForContentType(contentType),
        estimatedDuration: 25,
        breaks: []
    };
}

async function getConceptHints(conceptId) {
    // Get hints for a concept (would be stored in database)
    // For now, return mock hints
    return {
        minimal_hint: [
            "Think about the basic definition of this concept.",
            "Recall a similar problem you've solved before."
        ],
        concept_reminder: [
            "Remember the key formula or rule for this concept.",
            "Consider the relationship between the variables involved."
        ],
        similar_example: [
            "Look at the example in your textbook from last week.",
            "Try to connect this to a real-world application."
        ],
        step_by_step_solution: [
            "Break down the problem into smaller steps.",
            "Start with what you know and work towards what you need to find."
        ],
        alternative_approach: [
            "Try a different method to solve this problem.",
            "Use a diagram or visualization to understand the concept."
        ],
        practice_exercise: [
            "Complete a similar exercise from your practice workbook.",
            "Try explaining the concept to someone else."
        ]
    };
}

function generateHintSequence(selectedHints, struggleLevel) {
    // Generate progressive hint sequence based on struggle level
    const sequence = [];
    const hintDelay = struggleLevel > 0.7 ? 30000 : struggleLevel > 0.4 ? 60000 : 120000; // 30s, 1min, 2min

    selectedHints.forEach((hint, index) => {
        sequence.push({
            id: `hint_${index + 1}`,
            content: hint,
            delay: hintDelay * (index + 1),
            type: index === 0 ? 'gentle' : index === selectedHints.length - 1 ? 'direct' : 'progressive'
        });
    });

    return sequence;
}

function calculateHintTiming(struggleLevel) {
    // Calculate when to show hints
    const baseDelay = struggleLevel > 0.7 ? 20000 : struggleLevel > 0.4 ? 40000 : 80000; // 20s, 40s, 80s

    return {
        initialDelay: baseDelay,
        subsequentDelay: baseDelay * 1.5,
        maxHints: struggleLevel > 0.7 ? 3 : struggleLevel > 0.4 ? 2 : 1
    };
}

async function predictHintEffectiveness(userId, conceptId, hintSequence) {
    // Predict how effective hints will be (simplified)
    const tracker = getStudentTracker(userId);
    const currentMastery = tracker.getMastery(conceptId) || 0;

    // Higher mastery = less effective hints, more hints = more effective
    const baseEffectiveness = 0.5 + (hintSequence.length * 0.1) - (currentMastery * 0.3);

    return Math.max(0.1, Math.min(0.9, baseEffectiveness));
}

function getDefaultHints(conceptId) {
    return {
        conceptId,
        struggleLevel: 0.5,
        hintLevel: 'medium',
        hints: [{
            id: 'default_hint',
            content: 'Take your time and think carefully about the problem.',
            delay: 60000,
            type: 'gentle'
        }],
        timing: { initialDelay: 60000, subsequentDelay: 90000, maxHints: 1 },
        effectiveness: 0.5
    };
}

function adaptForLearningStyle(presentation, learningStyle) {
    const adaptations = {
        visual: {
            addDiagrams: true,
            useColors: true,
            includeCharts: true,
            reduceText: true
        },
        auditory: {
            addAudio: true,
            includeMnemonics: true,
            useRhythm: true,
            verbalExplanations: true
        },
        kinesthetic: {
            addInteractive: true,
            includeMovement: true,
            handsOnActivities: true,
            realWorldExamples: true
        },
        reading: {
            detailedText: true,
            structuredNotes: true,
            vocabularyLists: true,
            writtenExamples: true
        }
    };

    return { ...presentation, ...adaptations[learningStyle] };
}

function filterPrerequisites(prerequisites, priorKnowledge) {
    // Filter out prerequisites that student already knows
    return prerequisites.filter(prereq => !priorKnowledge.includes(prereq));
}

function personalizeExamples(examples, interests) {
    // Reorder or select examples based on student interests
    const interestKeywords = interests.map(interest => interest.toLowerCase());

    return examples.sort((a, b) => {
        const aScore = interestKeywords.reduce((score, keyword) =>
            a.toLowerCase().includes(keyword) ? score + 1 : score, 0);
        const bScore = interestKeywords.reduce((score, keyword) =>
            b.toLowerCase().includes(keyword) ? score + 1 : score, 0);

        return bScore - aScore; // Higher interest score first
    });
}

function adaptMultimediaForPerformance(performance, contentType) {
    if (contentType === 'video') {
        return {
            speed: performance > 0.8 ? 1.25 : performance < 0.5 ? 0.75 : 1.0,
            captions: performance < 0.6,
            pauses: performance < 0.7
        };
    } else if (contentType === 'interactive') {
        return {
            guidance: performance < 0.6 ? 'high' : performance > 0.8 ? 'low' : 'medium',
            feedback: performance < 0.7 ? 'immediate' : 'delayed',
            attempts: performance < 0.5 ? 'unlimited' : 'limited'
        };
    }

    return {};
}

function calculateAveragePerformance(sessions) {
    if (sessions.length === 0) return 0.5;

    const performances = sessions
        .map(session => session.performance_score)
        .filter(score => score !== null && score !== undefined);

    return performances.length > 0 ?
        performances.reduce((sum, score) => sum + score, 0) / performances.length : 0.5;
}

// ==========================================
// INTEGRATION WITH LEARNING PATH ENGINE
// ==========================================

/**
 * Integrate content adaptation with learning path recommendations
 * @param {string} userId - Student ID
 * @returns {Object} Enhanced learning path with content adaptations
 */
export async function getAdaptedLearningPath(userId) {
    try {
        // Get base learning path from engine
        const basePath = await learningPathEngine.generatePersonalizedPath(userId);

        if (!basePath.path || basePath.path.length === 0) {
            return basePath;
        }

        // Adapt each content item in the path
        const adaptedPath = await Promise.all(
            basePath.path.map(async (contentItem) => {
                // Get recent performance for this concept
                const recentPerformance = await getRecentConceptPerformance(userId, contentItem.id);

                // Adapt the content
                const adaptation = await adaptContentForStudent(
                    userId,
                    contentItem.id,
                    recentPerformance
                );

                return {
                    ...contentItem,
                    adaptation: adaptation.adaptationStrategy,
                    adaptedDifficulty: adaptation.optimalDifficulty,
                    estimatedTime: calculateAdaptedTime(contentItem, adaptation.adaptationStrategy)
                };
            })
        );

        return {
            ...basePath,
            path: adaptedPath,
            adaptationsApplied: adaptedPath.length,
            totalEstimatedTime: adaptedPath.reduce((sum, item) => sum + item.estimatedTime, 0)
        };

    } catch (error) {
        console.error('Error getting adapted learning path:', error);
        return await learningPathEngine.generatePersonalizedPath(userId);
    }
}

/**
 * Update learning path based on adapted content performance
 * @param {string} userId - Student ID
 * @param {string} contentId - Content ID
 * @param {number} performance - Performance score
 * @param {Object} adaptationUsed - Adaptation strategy used
 */
export async function updateAdaptedLearningPath(userId, contentId, performance, adaptationUsed) {
    try {
        // Update base learning path
        await learningPathEngine.updatePathBasedOnPerformance(userId, contentId, performance);

        // Record adaptation effectiveness
        await recordAdaptationEffectiveness(userId, contentId, performance, adaptationUsed);

        // Adjust future adaptations based on effectiveness
        await updateAdaptationStrategy(userId, adaptationUsed, performance);

    } catch (error) {
        console.error('Error updating adapted learning path:', error);
    }
}

// ==========================================
// CONTENT SYSTEM INTEGRATION
// ==========================================

/**
 * Apply content adaptation to material display
 * @param {string} materialId - Material ID
 * @param {Object} adaptation - Adaptation configuration
 * @returns {Object} Adapted material content
 */
export async function applyContentAdaptationToMaterial(materialId, adaptation) {
    try {
        // Get material with sections
        const { data: material, error } = await supabase
            .from('materials')
            .select(`
                *,
                material_sections (*)
            `)
            .eq('id', materialId)
            .single();

        if (error) throw error;

        // Apply adaptations to sections
        const adaptedSections = material.material_sections.map(section =>
            adaptSectionContent(section, adaptation)
        );

        // Apply adaptations to main content
        const adaptedMaterial = {
            ...material,
            adaptedSections,
            adaptationApplied: adaptation,
            adaptedAt: new Date()
        };

        return adaptedMaterial;

    } catch (error) {
        console.error('Error applying content adaptation to material:', error);
        return null;
    }
}

/**
 * Adapt individual section content
 * @param {Object} section - Material section
 * @param {Object} adaptation - Adaptation configuration
 * @returns {Object} Adapted section
 */
function adaptSectionContent(section, adaptation) {
    const adaptedSection = { ...section };

    // Adapt text content based on difficulty
    if (adaptation.difficulty === 'easier' && section.section_type === 'text') {
        adaptedSection.content = simplifyText(section.content);
    } else if (adaptation.difficulty === 'harder' && section.section_type === 'text') {
        adaptedSection.content = enhanceText(section.content);
    }

    // Adapt multimedia elements
    if (section.section_type === 'image' && adaptation.multimedia) {
        adaptedSection.adaptedSettings = adaptation.multimedia;
    }

    // Add scaffolding hints if needed
    if (adaptation.support === 'high' && section.section_type === 'text') {
        adaptedSection.hints = generateSectionHints(section.content);
    }

    return adaptedSection;
}

// ==========================================
// ADAPTATION EFFECTIVENESS TRACKING
// ==========================================

async function recordAdaptationEffectiveness(userId, contentId, performance, adaptation) {
    try {
        await supabase
            .from('adaptation_effectiveness')
            .insert({
                user_id: userId,
                content_id: contentId,
                adaptation_strategy: adaptation,
                performance_score: performance,
                recorded_at: new Date()
            });
    } catch (error) {
        console.warn('Failed to record adaptation effectiveness:', error);
    }
}

async function updateAdaptationStrategy(userId, adaptation, performance) {
    // Update adaptation preferences based on effectiveness
    // This would use machine learning to improve future adaptations
    console.log(`Updating adaptation strategy for user ${userId} based on performance ${performance}`);
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

async function getRecentConceptPerformance(userId, conceptId) {
    // Get recent performance for a concept
    const sessions = await getRecentLearningSessions(userId, 5);
    const conceptSessions = sessions.filter(session => session.content_id === conceptId);

    if (conceptSessions.length === 0) return 0.5; // Default moderate performance

    const avgPerformance = conceptSessions
        .map(session => session.performance_score || 0)
        .reduce((sum, score) => sum + score, 0) / conceptSessions.length;

    return avgPerformance;
}

function calculateAdaptedTime(contentItem, adaptation) {
    const baseTime = contentItem.estimatedTime || 20; // Default 20 minutes

    // Adjust time based on adaptation
    let timeMultiplier = 1.0;

    if (adaptation.difficulty === 'easier') timeMultiplier = 0.8;
    else if (adaptation.difficulty === 'harder') timeMultiplier = 1.2;

    if (adaptation.pacing === 'slow') timeMultiplier *= 1.3;
    else if (adaptation.pacing === 'fast') timeMultiplier *= 0.8;

    if (adaptation.support === 'high') timeMultiplier *= 1.1;

    return Math.round(baseTime * timeMultiplier);
}

function simplifyText(text) {
    // Simple text simplification (in real implementation, use NLP)
    return text
        .replace(/(\w+)(\s+)(and|or|but|so|because|although|however)(\s+)/gi, '$1. ')
        .replace(/\b(?:furthermore|moreover|additionally|consequently|subsequently)\b/gi, 'Also');
}

function enhanceText(text) {
    // Simple text enhancement (in real implementation, use NLP)
    return text
        .replace(/\b(example|for instance)\b/gi, 'For example')
        .replace(/\b(important|key|crucial)\b/gi, 'Very important');
}

function generateSectionHints(content) {
    // Generate contextual hints for sections
    const hints = [];

    if (content.toLowerCase().includes('calculate')) {
        hints.push('Remember to show your work step by step');
    }

    if (content.toLowerCase().includes('formula')) {
        hints.push('Check that you have all the variables needed for the formula');
    }

    if (content.toLowerCase().includes('graph')) {
        hints.push('Label your axes and give the graph a title');
    }

    return hints;
}

// ==========================================
// EXPORTS
// ==========================================

const contentAdaptationEngine = new ContentAdaptationEngine();

export {
    ContentAdaptationEngine,
    contentAdaptationEngine
};

// Utility functions for external use
export function getAdaptationStrategies() {
    return contentAdaptationEngine.adaptationStrategies;
}

export function getContentTemplates() {
    return contentAdaptationEngine.contentTemplates;
}