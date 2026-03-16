// irt_analysis.js - Item Response Theory Analysis Module
// Implementasi penuh IRT berdasarkan data empiris siswa
// Menghitung Item Difficulty dan Item Discrimination dari data aktual

import { supabase } from './clientSupabase.js';

// ==========================================
// ITEM RESPONSE THEORY (IRT) ANALYZER
// ==========================================

class IRTAnalyzer {
    constructor() {
        this.itemParameters = new Map(); // questionId -> IRT parameters
        this.studentAbilities = new Map(); // userId -> theta (ability estimate)
        this.responseMatrix = null; // Response matrix for analysis
        this.isCalibrated = false;
    }

    // ==========================================
    // 1. ITEM DIFFICULTY (Classical Test Theory)
    // ==========================================
    
    /**
     * Calculate Item Difficulty using Classical Test Theory
     * Item Difficulty = Proportion of students who answered correctly
     * Range: 0.0 (very difficult) to 1.0 (very easy)
     * 
     * Interpretation:
     * - 0.0 - 0.3: Difficult item
     * - 0.3 - 0.7: Moderate item
     * - 0.7 - 1.0: Easy item
     */
    async calculateItemDifficulty(questionId = null) {
        try {
            let query = supabase
                .from('exam_answers')
                .select('question_id, is_correct');

            if (questionId) {
                query = query.eq('question_id', questionId);
            }

            const { data: answers, error } = await query;

            if (error) throw error;

            // Group by question
            const questionStats = {};
            
            answers.forEach(answer => {
                if (!questionStats[answer.question_id]) {
                    questionStats[answer.question_id] = {
                        total: 0,
                        correct: 0
                    };
                }
                questionStats[answer.question_id].total++;
                if (answer.is_correct) {
                    questionStats[answer.question_id].correct++;
                }
            });

            // Calculate difficulty (proportion correct)
            const difficulties = {};
            
            for (const [qId, stats] of Object.entries(questionStats)) {
                // Item difficulty = proportion correct (p-value)
                const pValue = stats.total > 0 ? stats.correct / stats.total : 0.5;
                
                // Convert to IRT difficulty scale (b-parameter)
                // Using logit transformation: b = ln(p/(1-p))
                // This maps p-value to IRT difficulty scale
                let bParameter;
                if (pValue === 0) {
                    bParameter = 3.0; // Very difficult
                } else if (pValue === 1) {
                    bParameter = -3.0; // Very easy
                } else {
                    bParameter = -Math.log(pValue / (1 - pValue));
                }

                // Clamp to reasonable range
                bParameter = Math.max(-3, Math.min(3, bParameter));

                difficulties[qId] = {
                    pValue: pValue,                    // Classical difficulty (proportion correct)
                    bParameter: bParameter,            // IRT difficulty parameter
                    totalResponses: stats.total,
                    correctResponses: stats.correct,
                    interpretation: this.interpretDifficulty(pValue)
                };

                // Store in map
                this.itemParameters.set(qId, {
                    ...this.itemParameters.get(qId),
                    difficulty: pValue,
                    bParameter: bParameter,
                    ...difficulties[qId]
                });
            }

            console.log('Item difficulties calculated:', Object.keys(difficulties).length, 'items');
            return difficulties;

        } catch (error) {
            console.error('Error calculating item difficulty:', error);
            return {};
        }
    }

    /**
     * Interpret difficulty level based on p-value
     */
    interpretDifficulty(pValue) {
        if (pValue < 0.3) return 'Sulit';
        if (pValue < 0.7) return 'Sedang';
        return 'Mudah';
    }

    // ==========================================
    // 2. ITEM DISCRIMINATION (Point-Biserial)
    // ==========================================

    /**
     * Calculate Item Discrimination using Point-Biserial Correlation
     * 
     * Point-Biserial Correlation formula:
     * r_pb = (M1 - M0) / S_t * sqrt(p * q)
     * 
     * Where:
     * - M1 = Mean total score of students who answered correctly
     * - M0 = Mean total score of students who answered incorrectly
     * - S_t = Standard deviation of total scores
     * - p = Proportion who answered correctly
     * - q = Proportion who answered incorrectly (1-p)
     * 
     * Interpretation:
     * - > 0.40: Excellent discrimination
     * - 0.30 - 0.39: Good discrimination
     * - 0.20 - 0.29: Fair discrimination
     * - < 0.20: Poor discrimination (item may need revision)
     */
    async calculateItemDiscrimination(questionId = null) {
        try {
            // Step 1: Get all exam answers with session info
            let answersQuery = supabase
                .from('exam_answers')
                .select(`
                    question_id,
                    is_correct,
                    exam_session_id,
                    exam_sessions (
                        id,
                        user_id,
                        total_score
                    )
                `);

            if (questionId) {
                answersQuery = answersQuery.eq('question_id', questionId);
            }

            const { data: answers, error } = await answersQuery;

            if (error) throw error;

            // Step 2: Organize data by question
            const questionData = {};
            const studentTotalScores = {};

            answers.forEach(answer => {
                const qId = answer.question_id;
                const sessionId = answer.exam_session_id;
                const totalScore = answer.exam_sessions?.total_score || 0;

                // Track student total scores
                studentTotalScores[sessionId] = totalScore;

                if (!questionData[qId]) {
                    questionData[qId] = {
                        correctScores: [],
                        incorrectScores: [],
                        totalResponses: 0,
                        correctCount: 0
                    };
                }

                questionData[qId].totalResponses++;

                if (answer.is_correct) {
                    questionData[qId].correctScores.push(totalScore);
                    questionData[qId].correctCount++;
                } else {
                    questionData[qId].incorrectScores.push(totalScore);
                }
            });

            // Step 3: Calculate point-biserial correlation for each question
            const discriminations = {};

            for (const [qId, data] of Object.entries(questionData)) {
                const n = data.totalResponses;
                
                if (n < 2) {
                    discriminations[qId] = {
                        discrimination: 0,
                        interpretation: 'Insufficient data',
                        aParameter: 1.0
                    };
                    continue;
                }

                // Calculate means
                const M1 = data.correctScores.length > 0 
                    ? data.correctScores.reduce((a, b) => a + b, 0) / data.correctScores.length 
                    : 0;
                const M0 = data.incorrectScores.length > 0 
                    ? data.incorrectScores.reduce((a, b) => a + b, 0) / data.incorrectScores.length 
                    : 0;

                // Calculate standard deviation of all scores
                const allScores = [...data.correctScores, ...data.incorrectScores];
                const meanAll = allScores.reduce((a, b) => a + b, 0) / allScores.length;
                const variance = allScores.reduce((sum, score) => sum + Math.pow(score - meanAll, 2), 0) / allScores.length;
                const St = Math.sqrt(variance);

                // Calculate p and q
                const p = data.correctCount / n;
                const q = 1 - p;

                // Calculate point-biserial correlation
                let rpb = 0;
                if (St > 0 && p > 0 && q > 0) {
                    rpb = (M1 - M0) / St * Math.sqrt(p * q);
                }

                // Clamp to valid range
                rpb = Math.max(-1, Math.min(1, rpb));

                // Convert to IRT discrimination parameter (a-parameter)
                // Approximate conversion: a ≈ rpb * 1.7 (using logistic model constant)
                const aParameter = Math.max(0.1, Math.min(3, Math.abs(rpb) * 1.7));

                discriminations[qId] = {
                    pointBiserial: rpb,
                    discrimination: rpb,
                    aParameter: aParameter,
                    meanCorrectScore: M1,
                    meanIncorrectScore: M0,
                    totalResponses: n,
                    interpretation: this.interpretDiscrimination(rpb)
                };

                // Store in map
                this.itemParameters.set(qId, {
                    ...this.itemParameters.get(qId),
                    discrimination: rpb,
                    aParameter: aParameter,
                    ...discriminations[qId]
                });
            }

            console.log('Item discriminations calculated:', Object.keys(discriminations).length, 'items');
            return discriminations;

        } catch (error) {
            console.error('Error calculating item discrimination:', error);
            return {};
        }
    }

    /**
     * Interpret discrimination level based on point-biserial correlation
     */
    interpretDiscrimination(rpb) {
        const absR = Math.abs(rpb);
        if (absR >= 0.40) return 'Sangat Baik';
        if (absR >= 0.30) return 'Baik';
        if (absR >= 0.20) return 'Cukup';
        return 'Buruk (perlu revisi)';
    }

    // ==========================================
    // 3. GUESSING PARAMETER (c-parameter)
    // ==========================================

    /**
     * Estimate guessing parameter based on question type
     * For multiple choice with n options, c ≈ 1/n
     */
    estimateGuessingParameter(questionType, numOptions = 4) {
        switch (questionType) {
            case 'Pilihan Ganda':
            case 'MCQ':
                return 1 / numOptions; // Typically 0.25 for 4 options
            case 'PGK MCMA':
                return 0.1; // Lower guessing for multiple answer
            case 'PGK Kategori':
                return 0.2; // Moderate guessing
            case 'Isian':
            case 'Essay':
                return 0.0; // No guessing for open-ended
            default:
                return 0.25;
        }
    }

    // ==========================================
    // 4. FULL IRT CALIBRATION
    // ==========================================

    /**
     * Perform full IRT calibration for all items
     * Calculates all three parameters: a, b, c
     */
    async calibrateAllItems() {
        console.log('Starting IRT calibration...');

        // Calculate difficulty (b-parameter)
        const difficulties = await this.calculateItemDifficulty();

        // Calculate discrimination (a-parameter)
        const discriminations = await this.calculateItemDiscrimination();

        // Get question types for guessing parameter
        const { data: questions, error } = await supabase
            .from('questions')
            .select('id, question_type');

        if (error) {
            console.error('Error fetching questions:', error);
            return null;
        }

        // Combine all parameters
        const calibratedItems = {};

        for (const question of questions || []) {
            const qId = question.id;
            const diffData = difficulties[qId] || {};
            const discData = discriminations[qId] || {};

            calibratedItems[qId] = {
                // IRT Parameters
                a: discData.aParameter || 1.0,           // Discrimination
                b: diffData.bParameter || 0.0,           // Difficulty
                c: this.estimateGuessingParameter(question.question_type), // Guessing

                // Classical statistics
                pValue: diffData.pValue || 0.5,          // Proportion correct
                pointBiserial: discData.pointBiserial || 0, // Discrimination index

                // Metadata
                totalResponses: diffData.totalResponses || 0,
                interpretation: {
                    difficulty: diffData.interpretation || 'Unknown',
                    discrimination: discData.interpretation || 'Unknown'
                },

                // Quality flags
                isValid: this.validateItem(diffData.pValue, discData.pointBiserial)
            };

            // Update map
            this.itemParameters.set(qId, calibratedItems[qId]);
        }

        this.isCalibrated = true;
        console.log('IRT calibration complete:', Object.keys(calibratedItems).length, 'items');

        // Save to database
        await this.saveCalibrationToDatabase(calibratedItems);

        return calibratedItems;
    }

    /**
     * Validate item quality based on difficulty and discrimination
     */
    validateItem(pValue, discrimination) {
        // Item is valid if:
        // - Difficulty is not extreme (0.1 < p < 0.9)
        // - Discrimination is positive and reasonable (r > 0.1)
        const validDifficulty = pValue > 0.1 && pValue < 0.9;
        const validDiscrimination = discrimination > 0.1;

        return validDifficulty && validDiscrimination;
    }

    // ==========================================
    // 5. ABILITY ESTIMATION (Theta)
    // ==========================================

    /**
     * Estimate student ability (theta) using Maximum Likelihood Estimation
     * Based on 3-Parameter Logistic Model (3PL IRT)
     * 
     * P(θ) = c + (1-c) / (1 + e^(-a(θ-b)))
     */
    async estimateStudentAbility(userId) {
        try {
            // Get student's answers
            const { data: answers, error } = await supabase
                .from('exam_answers')
                .select(`
                    question_id,
                    is_correct,
                    questions!inner(id)
                `)
                .eq('exam_sessions.user_id', userId);

            if (error) throw error;

            if (!answers || answers.length === 0) {
                return { theta: 0, se: 1 };
            }

            // Use Expected A Posteriori (EAP) estimation
            let theta = 0; // Initial estimate
            const maxIterations = 20;
            const convergenceThreshold = 0.001;

            for (let iter = 0; iter < maxIterations; iter++) {
                let sumNumerator = 0;
                let sumDenominator = 0;

                for (const answer of answers) {
                    const params = this.itemParameters.get(answer.question_id);
                    if (!params) continue;

                    const { a = 1, b = 0, c = 0.25 } = params;

                    // Calculate probability using 3PL model
                    const expTerm = Math.exp(-a * (theta - b));
                    const P = c + (1 - c) / (1 + expTerm);

                    // Calculate derivative
                    const Q = 1 - P;
                    const dP = a * (1 - c) * expTerm / Math.pow(1 + expTerm, 2);

                    // Update sums for MLE
                    const response = answer.is_correct ? 1 : 0;
                    sumNumerator += dP * (response - P);
                    sumDenominator -= dP * dP / (P * Q);
                }

                // Update theta
                if (sumDenominator !== 0) {
                    const delta = sumNumerator / sumDenominator;
                    theta -= delta;

                    // Check convergence
                    if (Math.abs(delta) < convergenceThreshold) {
                        break;
                    }
                }
            }

            // Calculate standard error
            let infoSum = 0;
            for (const answer of answers) {
                const params = this.itemParameters.get(answer.question_id);
                if (!params) continue;

                const { a = 1, b = 0, c = 0.25 } = params;
                const expTerm = Math.exp(-a * (theta - b));
                const P = c + (1 - c) / (1 + expTerm);
                const Q = 1 - P;

                // Fisher information
                const info = a * a * (1 - c) * (1 - c) * P * Q / Math.pow(c + Q, 2);
                infoSum += info;
            }

            const se = infoSum > 0 ? Math.sqrt(1 / infoSum) : 1;

            // Store ability
            this.studentAbilities.set(userId, { theta, se });

            return { theta, se };

        } catch (error) {
            console.error('Error estimating ability:', error);
            return { theta: 0, se: 1 };
        }
    }

    // ==========================================
    // 6. ITEM CHARACTERISTIC CURVE (ICC)
    // ==========================================

    /**
     * Calculate probability of correct response using 3PL model
     * @param {number} theta - Student ability
     * @param {object} params - Item parameters (a, b, c)
     * @returns {number} Probability of correct response
     */
    calculateICC(theta, params) {
        const { a = 1, b = 0, c = 0.25 } = params;
        const expTerm = Math.exp(-a * (theta - b));
        return c + (1 - c) / (1 + expTerm);
    }

    /**
     * Generate ICC data points for visualization
     */
    generateICCCurve(questionId, thetaRange = [-3, 3], steps = 50) {
        const params = this.itemParameters.get(questionId);
        if (!params) return null;

        const stepSize = (thetaRange[1] - thetaRange[0]) / steps;
        const curve = [];

        for (let theta = thetaRange[0]; theta <= thetaRange[1]; theta += stepSize) {
            curve.push({
                theta: theta,
                probability: this.calculateICC(theta, params)
            });
        }

        return {
            questionId,
            parameters: params,
            curve
        };
    }

    // ==========================================
    // 7. DATABASE OPERATIONS
    // ==========================================

    /**
     * Save calibration results to database
     */
    async saveCalibrationToDatabase(calibratedItems) {
        try {
            // Create/update item_parameters table
            const { error: createError } = await supabase.rpc('create_item_parameters_table_if_not_exists');
            
            // Update each item's parameters
            for (const [questionId, params] of Object.entries(calibratedItems)) {
                await supabase
                    .from('questions')
                    .update({
                        irt_a_parameter: params.a,
                        irt_b_parameter: params.b,
                        irt_c_parameter: params.c,
                        difficulty_pvalue: params.pValue,
                        discrimination_index: params.pointBiserial,
                        is_valid_item: params.isValid,
                        last_calibrated: new Date().toISOString()
                    })
                    .eq('id', questionId);
            }

            console.log('IRT parameters saved to database');
            return true;

        } catch (error) {
            console.error('Error saving calibration to database:', error);
            return false;
        }
    }

    /**
     * Load calibration from database
     */
    async loadCalibrationFromDatabase() {
        try {
            const { data: questions, error } = await supabase
                .from('questions')
                .select(`
                    id,
                    irt_a_parameter,
                    irt_b_parameter,
                    irt_c_parameter,
                    difficulty_pvalue,
                    discrimination_index,
                    is_valid_item,
                    last_calibrated
                `)
                .not('irt_a_parameter', 'is', null);

            if (error) throw error;

            for (const q of questions || []) {
                this.itemParameters.set(q.id, {
                    a: q.irt_a_parameter,
                    b: q.irt_b_parameter,
                    c: q.irt_c_parameter,
                    pValue: q.difficulty_pvalue,
                    pointBiserial: q.discrimination_index,
                    isValid: q.is_valid_item,
                    lastCalibrated: q.last_calibrated
                });
            }

            this.isCalibrated = true;
            console.log('IRT parameters loaded from database:', this.itemParameters.size, 'items');
            return true;

        } catch (error) {
            console.error('Error loading calibration:', error);
            return false;
        }
    }

    // ==========================================
    // 8. ADAPTIVE TESTING SUPPORT
    // ==========================================

    /**
     * Select optimal next item for adaptive testing
     * Based on Maximum Fisher Information
     */
    selectNextItem(theta, availableItems, administeredItems = []) {
        let maxInfo = -Infinity;
        let bestItem = null;

        for (const itemId of availableItems) {
            if (administeredItems.includes(itemId)) continue;

            const params = this.itemParameters.get(itemId);
            if (!params || !params.isValid) continue;

            // Calculate Fisher information at current theta
            const info = this.calculateFisherInformation(theta, params);

            if (info > maxInfo) {
                maxInfo = info;
                bestItem = itemId;
            }
        }

        return bestItem;
    }

    /**
     * Calculate Fisher Information for an item
     */
    calculateFisherInformation(theta, params) {
        const { a = 1, b = 0, c = 0.25 } = params;
        const expTerm = Math.exp(-a * (theta - b));
        const P = c + (1 - c) / (1 + expTerm);
        const Q = 1 - P;

        // Fisher information for 3PL model
        const numerator = a * a * (1 - c) * (1 - c) * expTerm * expTerm;
        const denominator = P * Q * Math.pow(1 + expTerm, 4);

        return numerator / denominator;
    }

    // ==========================================
    // 9. REPORTING
    // ==========================================

    /**
     * Generate item analysis report
     */
    generateItemAnalysisReport(questionId) {
        const params = this.itemParameters.get(questionId);
        if (!params) return null;

        return {
            questionId,
            irtParameters: {
                discrimination: params.a,
                difficulty: params.b,
                guessing: params.c
            },
            classicalStatistics: {
                pValue: params.pValue,
                pointBiserial: params.pointBiserial
            },
            interpretation: {
                difficulty: params.interpretation?.difficulty || this.interpretDifficulty(params.pValue),
                discrimination: params.interpretation?.discrimination || this.interpretDiscrimination(params.pointBiserial)
            },
            quality: {
                isValid: params.isValid,
                recommendation: this.getItemRecommendation(params)
            }
        };
    }

    /**
     * Get recommendation for item based on parameters
     */
    getItemRecommendation(params) {
        const recommendations = [];

        if (params.pValue < 0.2) {
            recommendations.push('Soal terlalu sulit, pertimbangkan untuk direvisi');
        } else if (params.pValue > 0.9) {
            recommendations.push('Soal terlalu mudah, pertimbangkan untuk direvisi');
        }

        if (params.pointBiserial < 0.2) {
            recommendations.push('Daya beda rendah, periksa kualitas soal');
        } else if (params.pointBiserial < 0) {
            recommendations.push('Daya beda negatif, soal bermasalah dan perlu diganti');
        }

        if (recommendations.length === 0) {
            recommendations.push('Soal memiliki kualitas yang baik');
        }

        return recommendations;
    }

    /**
     * Get all item statistics for admin dashboard
     */
    getAllItemStatistics() {
        const stats = {
            totalItems: this.itemParameters.size,
            validItems: 0,
            invalidItems: 0,
            averageDifficulty: 0,
            averageDiscrimination: 0,
            difficultyDistribution: { easy: 0, moderate: 0, difficult: 0 },
            discriminationDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
            items: []
        };

        let totalP = 0;
        let totalR = 0;

        for (const [id, params] of this.itemParameters) {
            if (params.isValid) stats.validItems++;
            else stats.invalidItems++;

            totalP += params.pValue || 0;
            totalR += Math.abs(params.pointBiserial || 0);

            // Difficulty distribution
            if (params.pValue >= 0.7) stats.difficultyDistribution.easy++;
            else if (params.pValue >= 0.3) stats.difficultyDistribution.moderate++;
            else stats.difficultyDistribution.difficult++;

            // Discrimination distribution
            const absR = Math.abs(params.pointBiserial || 0);
            if (absR >= 0.4) stats.discriminationDistribution.excellent++;
            else if (absR >= 0.3) stats.discriminationDistribution.good++;
            else if (absR >= 0.2) stats.discriminationDistribution.fair++;
            else stats.discriminationDistribution.poor++;

            stats.items.push({
                id,
                ...params
            });
        }

        stats.averageDifficulty = stats.totalItems > 0 ? totalP / stats.totalItems : 0;
        stats.averageDiscrimination = stats.totalItems > 0 ? totalR / stats.totalItems : 0;

        return stats;
    }
}

// ==========================================
// SINGLETON INSTANCE
// ==========================================

const irtAnalyzer = new IRTAnalyzer();

// ==========================================
// EXPORTS
// ==========================================

export {
    IRTAnalyzer,
    irtAnalyzer
};

export async function calculateItemDifficulty(questionId = null) {
    return await irtAnalyzer.calculateItemDifficulty(questionId);
}

export async function calculateItemDiscrimination(questionId = null) {
    return await irtAnalyzer.calculateItemDiscrimination(questionId);
}

export async function calibrateAllItems() {
    return await irtAnalyzer.calibrateAllItems();
}

export async function estimateStudentAbility(userId) {
    return await irtAnalyzer.estimateStudentAbility(userId);
}

export function getItemParameters(questionId) {
    return irtAnalyzer.itemParameters.get(questionId);
}

export function getAllItemStatistics() {
    return irtAnalyzer.getAllItemStatistics();
}

export function selectNextAdaptiveItem(theta, availableItems, administeredItems) {
    return irtAnalyzer.selectNextItem(theta, availableItems, administeredItems);
}

export function generateICCCurve(questionId) {
    return irtAnalyzer.generateICCCurve(questionId);
}

export default irtAnalyzer;
