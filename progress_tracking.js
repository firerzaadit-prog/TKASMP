// progress_tracking.js - Detailed Progress Tracking per Concept
// Integrates with analytics.js, adaptive_learning_engine.js, and database schemas

import { supabase } from './supabaseClient.js';
import { getStudentTracker, updatePathBasedOnPerformance } from './adaptive_learning_engine.js';
import { analyzeLearningTrends, identifySkillGaps as predictSkillGaps } from './predictive_models.js';

// ==========================================
// CONCEPT PROGRESS TRACKER CLASS
// ==========================================

class ConceptProgressTracker {
    constructor() {
        this.cache = new Map(); // Cache for analytics data
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
    }

    // Track concept progress with detailed data
    async trackConceptProgress(userId, conceptId, performanceData) {
        try {
            const {
                performanceScore, // 0-1
                timeSpentSeconds,
                difficultyLevel,
                sessionId = null,
                metadata = {}
            } = performanceData;

            // Get current mastery level from adaptive learning engine
            const tracker = getStudentTracker(userId);
            const currentMastery = tracker.getMastery(conceptId);

            // Calculate learning velocity (improvement rate)
            const learningVelocity = await this.calculateLearningVelocity(userId, conceptId);

            // Insert progress record
            const { data, error } = await supabase
                .from('concept_progress_history')
                .insert({
                    student_id: userId,
                    concept_id: conceptId,
                    mastery_level: currentMastery,
                    performance_score: performanceScore,
                    time_spent_seconds: timeSpentSeconds,
                    difficulty_level: difficultyLevel,
                    learning_velocity: learningVelocity,
                    session_id: sessionId,
                    metadata: {
                        ...metadata,
                        timestamp: new Date().toISOString()
                    }
                })
                .select()
                .single();

            if (error) {
                console.error('Error tracking concept progress:', error);
                return null;
            }

            // Update adaptive learning engine
            await updatePathBasedOnPerformance(userId, conceptId, performanceScore);

            // Check for milestones
            await this.checkAndRecordMilestones(userId, conceptId, data);

            // Invalidate analytics cache
            this.invalidateAnalyticsCache(userId, conceptId);

            return data;

        } catch (error) {
            console.error('Error in trackConceptProgress:', error);
            return null;
        }
    }

    // Get current mastery level for a concept
    async getConceptMasteryLevel(userId, conceptId) {
        try {
            // Handle 'Overall' mastery as average across all concepts
            if (conceptId === 'Overall') {
                // Get average mastery from database
                const { data: masteryData, error } = await supabase
                    .from('concept_mastery')
                    .select('mastery_level, last_updated')
                    .eq('student_id', userId)
                    .order('last_updated', { ascending: false });

                if (error) {
                    console.error('Error getting overall concept mastery:', error);
                    return {
                        masteryLevel: 0,
                        lastUpdated: null,
                        source: 'default'
                    };
                }

                if (masteryData && masteryData.length > 0) {
                    const averageMastery = masteryData.reduce((sum, record) => sum + record.mastery_level, 0) / masteryData.length;
                    const latestUpdate = masteryData[0].last_updated;

                    return {
                        masteryLevel: averageMastery,
                        lastUpdated: latestUpdate,
                        source: 'database_average'
                    };
                }

                return {
                    masteryLevel: 0,
                    lastUpdated: null,
                    source: 'default'
                };
            }

            // First check the adaptive learning engine
            const tracker = getStudentTracker(userId);
            const currentMastery = tracker.getMastery(conceptId);

            if (currentMastery > 0) {
                return {
                    masteryLevel: currentMastery,
                    lastUpdated: new Date(),
                    source: 'adaptive_engine'
                };
            }

            // Fallback to database for specific concept
            const { data, error } = await supabase
                .from('concept_mastery')
                .select('mastery_level, last_updated')
                .eq('student_id', userId)
                .eq('content_id', conceptId)
                .order('last_updated', { ascending: false })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') { // Not found error
                console.error('Error getting concept mastery:', error);
                return null;
            }

            return data ? {
                masteryLevel: data.mastery_level,
                lastUpdated: data.last_updated,
                source: 'database'
            } : {
                masteryLevel: 0,
                lastUpdated: null,
                source: 'default'
            };

        } catch (error) {
            console.error('Error in getConceptMasteryLevel:', error);
            return null;
        }
    }

    // Analyze learning curve over time
    async analyzeLearningCurve(userId, conceptId, timeRange = { days: 30 }) {
        try {
            const cacheKey = `learning_curve_${userId}_${conceptId}_${timeRange.days}`;
            const cached = this.getCachedAnalytics(cacheKey);
            if (cached) return cached;

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - timeRange.days);

            // Get historical progress data
            const { data: progressData, error } = await supabase
                .from('concept_progress_history')
                .select('*')
                .eq('student_id', userId)
                .eq('concept_id', conceptId)
                .gte('recorded_at', startDate.toISOString())
                .order('recorded_at', { ascending: true });

            if (error) {
                console.error('Error analyzing learning curve:', error);
                return null;
            }

            if (!progressData || progressData.length === 0) {
                return {
                    conceptId,
                    timeRange,
                    dataPoints: 0,
                    trend: 'insufficient_data',
                    analysis: 'Not enough data to analyze learning curve'
                };
            }

            // Calculate trend analysis
            const analysis = this.calculateTrendAnalysis(progressData);

            // Generate learning curve data points
            const curveData = progressData.map(point => ({
                date: point.recorded_at,
                mastery: point.mastery_level,
                performance: point.performance_score,
                timeSpent: point.time_spent_seconds,
                velocity: point.learning_velocity
            }));

            const result = {
                conceptId,
                timeRange,
                dataPoints: progressData.length,
                curveData,
                trend: analysis.trend,
                averageVelocity: analysis.averageVelocity,
                consistencyScore: analysis.consistencyScore,
                plateauDetected: analysis.plateauDetected,
                recommendations: analysis.recommendations
            };

            // Cache the result
            this.setCachedAnalytics(cacheKey, result);

            return result;

        } catch (error) {
            console.error('Error in analyzeLearningCurve:', error);
            return null;
        }
    }

    // Identify skill gaps for a user
    async identifySkillGaps(userId) {
        try {
            const cacheKey = `skill_gaps_${userId}`;
            const cached = this.getCachedAnalytics(cacheKey);
            if (cached) return cached;

            // Get all concepts the user has worked on
            const { data: concepts, error } = await supabase
                .from('concept_progress_history')
                .select('concept_id, mastery_level, recorded_at')
                .eq('student_id', userId)
                .order('recorded_at', { ascending: false });

            if (error) {
                console.error('Error identifying skill gaps:', error);
                return [];
            }

            // Group by concept and get latest mastery
            const conceptMastery = new Map();
            concepts.forEach(record => {
                if (!conceptMastery.has(record.concept_id) ||
                    new Date(record.recorded_at) > new Date(conceptMastery.get(record.concept_id).recorded_at)) {
                    conceptMastery.set(record.concept_id, record);
                }
            });

            // Identify gaps (mastery < 0.7)
            const skillGaps = [];
            for (const [conceptId, data] of conceptMastery) {
                if (data.mastery_level < 0.7) {
                    // Calculate gap severity and priority
                    const severity = 1 - data.mastery_level;
                    const recency = (new Date() - new Date(data.recorded_at)) / (1000 * 60 * 60 * 24); // days ago

                    skillGaps.push({
                        conceptId,
                        currentMastery: data.mastery_level,
                        severity,
                        priority: severity * Math.exp(-recency / 30), // Higher priority for recent severe gaps
                        lastPracticed: data.recorded_at,
                        daysSincePractice: Math.floor(recency)
                    });
                }
            }

            // Sort by priority
            skillGaps.sort((a, b) => b.priority - a.priority);

            const result = skillGaps.slice(0, 10); // Top 10 gaps
            this.setCachedAnalytics(cacheKey, result);

            return result;

        } catch (error) {
            console.error('Error in identifySkillGaps:', error);
            return [];
        }
    }

    // Generate comprehensive progress report
    async generateProgressReport(userId, conceptIds = null) {
        try {
            const report = {
                userId,
                generatedAt: new Date().toISOString(),
                summary: {},
                concepts: [],
                trends: {},
                recommendations: []
            };

            // Get concepts to analyze
            let conceptsToAnalyze = conceptIds;
            if (!conceptsToAnalyze) {
                const { data: userConcepts } = await supabase
                    .from('concept_progress_history')
                    .select('concept_id')
                    .eq('student_id', userId);

                conceptsToAnalyze = [...new Set(userConcepts.map(c => c.concept_id))];
            }

            // Analyze each concept
            for (const conceptId of conceptsToAnalyze) {
                const mastery = await this.getConceptMasteryLevel(userId, conceptId);
                const learningCurve = await this.analyzeLearningCurve(userId, conceptId);
                const velocity = await this.calculateLearningVelocity(userId, conceptId);

                report.concepts.push({
                    conceptId,
                    masteryLevel: mastery?.masteryLevel || 0,
                    learningCurve,
                    currentVelocity: velocity,
                    status: this.getConceptStatus(mastery?.masteryLevel || 0, velocity)
                });
            }

            // Generate summary
            report.summary = this.generateReportSummary(report.concepts);

            // Generate trends
            report.trends = await this.generateTrendsAnalysis(userId, conceptsToAnalyze);

            // Generate recommendations
            report.recommendations = this.generateRecommendations(report.concepts, report.trends);

            return report;

        } catch (error) {
            console.error('Error generating progress report:', error);
            return null;
        }
    }

    // Get progress heatmap data
    async getProgressHeatmap(userId, timeRange = { days: 30 }) {
        try {
            const cacheKey = `heatmap_${userId}_${timeRange.days}`;
            const cached = this.getCachedAnalytics(cacheKey);
            if (cached) return cached;

            const startDate = new Date();
            startDate.setDate(startDate.getDate() - timeRange.days);

            // Get daily progress data
            const { data: dailyData, error } = await supabase
                .from('concept_progress_history')
                .select('concept_id, mastery_level, recorded_at, performance_score')
                .eq('student_id', userId)
                .gte('recorded_at', startDate.toISOString())
                .order('recorded_at', { ascending: true });

            if (error) {
                console.error('Error getting progress heatmap:', error);
                return null;
            }

            // Group by date and concept
            const heatmapData = new Map();

            dailyData.forEach(record => {
                const date = new Date(record.recorded_at).toDateString();
                if (!heatmapData.has(date)) {
                    heatmapData.set(date, new Map());
                }

                const conceptData = heatmapData.get(date);
                if (!conceptData.has(record.concept_id)) {
                    conceptData.set(record.concept_id, {
                        mastery: record.mastery_level,
                        performance: record.performance_score,
                        sessions: 1
                    });
                } else {
                    const existing = conceptData.get(record.concept_id);
                    existing.mastery = Math.max(existing.mastery, record.mastery_level);
                    existing.performance = (existing.performance + record.performance_score) / 2;
                    existing.sessions++;
                }
            });

            // Convert to array format
            const result = {
                timeRange,
                dates: Array.from(heatmapData.keys()).sort(),
                concepts: [...new Set(dailyData.map(d => d.concept_id))],
                data: {}
            };

            result.dates.forEach(date => {
                result.data[date] = {};
                result.concepts.forEach(concept => {
                    const conceptData = heatmapData.get(date)?.get(concept);
                    result.data[date][concept] = conceptData || null;
                });
            });

            this.setCachedAnalytics(cacheKey, result);
            return result;

        } catch (error) {
            console.error('Error in getProgressHeatmap:', error);
            return null;
        }
    }

    // Calculate learning velocity for a concept
    async calculateLearningVelocity(userId, conceptId, timeWindowDays = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - timeWindowDays);

            const { data: progressData, error } = await supabase
                .from('concept_progress_history')
                .select('mastery_level, recorded_at')
                .eq('student_id', userId)
                .eq('concept_id', conceptId)
                .gte('recorded_at', startDate.toISOString())
                .order('recorded_at', { ascending: true });

            if (error || !progressData || progressData.length < 2) {
                return 0;
            }

            // Calculate velocity as mastery improvement per day
            const firstPoint = progressData[0];
            const lastPoint = progressData[progressData.length - 1];

            const timeDiff = (new Date(lastPoint.recorded_at) - new Date(firstPoint.recorded_at)) / (1000 * 60 * 60 * 24);
            const masteryDiff = lastPoint.mastery_level - firstPoint.mastery_level;

            return timeDiff > 0 ? masteryDiff / timeDiff : 0;

        } catch (error) {
            console.error('Error calculating learning velocity:', error);
            return 0;
        }
    }

    // Helper methods
    calculateTrendAnalysis(progressData) {
        if (progressData.length < 2) {
            return {
                trend: 'insufficient_data',
                averageVelocity: 0,
                consistencyScore: 0,
                plateauDetected: false,
                recommendations: ['Need more practice sessions']
            };
        }

        // Calculate velocity trend
        const velocities = [];
        for (let i = 1; i < progressData.length; i++) {
            const timeDiff = (new Date(progressData[i].recorded_at) - new Date(progressData[i-1].recorded_at)) / (1000 * 60 * 60 * 24);
            const masteryDiff = progressData[i].mastery_level - progressData[i-1].mastery_level;
            velocities.push(timeDiff > 0 ? masteryDiff / timeDiff : 0);
        }

        const averageVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;

        // Calculate consistency (lower variance = more consistent)
        const variance = velocities.reduce((sum, v) => sum + Math.pow(v - averageVelocity, 2), 0) / velocities.length;
        const consistencyScore = Math.max(0, 1 - Math.sqrt(variance));

        // Detect plateau (recent velocities near zero)
        const recentVelocities = velocities.slice(-3);
        const plateauDetected = recentVelocities.every(v => Math.abs(v) < 0.01);

        // Determine trend
        let trend = 'stable';
        if (averageVelocity > 0.02) trend = 'improving';
        else if (averageVelocity < -0.02) trend = 'declining';

        // Generate recommendations
        const recommendations = [];
        if (trend === 'declining') {
            recommendations.push('Consider reviewing foundational concepts');
        }
        if (consistencyScore < 0.5) {
            recommendations.push('Practice more regularly for consistent improvement');
        }
        if (plateauDetected) {
            recommendations.push('Try more challenging exercises or different learning approaches');
        }

        return {
            trend,
            averageVelocity,
            consistencyScore,
            plateauDetected,
            recommendations
        };
    }

    async checkAndRecordMilestones(userId, conceptId, progressRecord) {
        const milestones = [];

        // Check for first attempt milestone
        const { data: existingAttempts } = await supabase
            .from('concept_progress_history')
            .select('id')
            .eq('student_id', userId)
            .eq('concept_id', conceptId);

        if (existingAttempts.length === 1) {
            milestones.push({
                milestone_type: 'first_attempt',
                milestone_value: progressRecord.performance_score,
                description: 'First attempt at this concept'
            });
        }

        // Check for mastery milestone
        if (progressRecord.mastery_level >= 0.8) {
            const { data: existingMastery } = await supabase
                .from('concept_milestones')
                .select('id')
                .eq('student_id', userId)
                .eq('concept_id', conceptId)
                .eq('milestone_type', 'mastered');

            if (!existingMastery || existingMastery.length === 0) {
                milestones.push({
                    milestone_type: 'mastered',
                    milestone_value: progressRecord.mastery_level,
                    description: 'Achieved mastery level (80%+)'
                });
            }
        }

        // Insert milestones
        if (milestones.length > 0) {
            const milestoneRecords = milestones.map(milestone => ({
                student_id: userId,
                concept_id: conceptId,
                ...milestone
            }));

            await supabase
                .from('concept_milestones')
                .insert(milestoneRecords);
        }
    }

    getConceptStatus(masteryLevel, velocity) {
        if (masteryLevel >= 0.8) return 'mastered';
        if (masteryLevel >= 0.6) return 'developing';
        if (velocity > 0.01) return 'improving';
        if (velocity < -0.01) return 'declining';
        return 'needs_attention';
    }

    generateReportSummary(concepts) {
        const totalConcepts = concepts.length;
        const mastered = concepts.filter(c => c.status === 'mastered').length;
        const improving = concepts.filter(c => c.status === 'improving').length;
        const needsAttention = concepts.filter(c => c.status === 'needs_attention').length;

        return {
            totalConcepts,
            mastered,
            improving,
            needsAttention,
            overallProgress: mastered / totalConcepts,
            averageVelocity: concepts.reduce((sum, c) => sum + c.currentVelocity, 0) / totalConcepts
        };
    }

    async generateTrendsAnalysis(userId, conceptIds) {
        const trends = {
            overall: 'stable',
            improvingConcepts: [],
            decliningConcepts: [],
            plateauConcepts: []
        };

        for (const conceptId of conceptIds) {
            const curve = await this.analyzeLearningCurve(userId, conceptId, { days: 14 });
            if (curve && curve.trend !== 'insufficient_data') {
                if (curve.trend === 'improving') {
                    trends.improvingConcepts.push(conceptId);
                } else if (curve.trend === 'declining') {
                    trends.decliningConcepts.push(conceptId);
                }

                if (curve.plateauDetected) {
                    trends.plateauConcepts.push(conceptId);
                }
            }
        }

        // Determine overall trend
        if (trends.improvingConcepts.length > trends.decliningConcepts.length) {
            trends.overall = 'improving';
        } else if (trends.decliningConcepts.length > trends.improvingConcepts.length) {
            trends.overall = 'declining';
        }

        return trends;
    }

    generateRecommendations(concepts, trends) {
        const recommendations = [];

        if (trends.overall === 'improving') {
            recommendations.push('Great progress! Continue with current learning pace.');
        } else if (trends.overall === 'declining') {
            recommendations.push('Consider reviewing recent material and adjusting study habits.');
        }

        if (trends.plateauConcepts.length > 0) {
            recommendations.push(`Focus on plateaued concepts: ${trends.plateauConcepts.join(', ')}`);
        }

        const needsAttention = concepts.filter(c => c.status === 'needs_attention');
        if (needsAttention.length > 0) {
            recommendations.push(`Prioritize these concepts needing attention: ${needsAttention.map(c => c.conceptId).join(', ')}`);
        }

        return recommendations;
    }

    getCachedAnalytics(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        this.cache.delete(key);
        return null;
    }

    setCachedAnalytics(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    invalidateAnalyticsCache(userId, conceptId = null) {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.includes(userId) && (!conceptId || key.includes(conceptId))) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }
}

// ==========================================
// EXPORTS
// ==========================================

const conceptProgressTracker = new ConceptProgressTracker();

export {
    ConceptProgressTracker,
    conceptProgressTracker
};

// Main API functions
export async function trackConceptProgress(userId, conceptId, performanceData) {
    return await conceptProgressTracker.trackConceptProgress(userId, conceptId, performanceData);
}

export async function getConceptMasteryLevel(userId, conceptId) {
    return await conceptProgressTracker.getConceptMasteryLevel(userId, conceptId);
}

export async function analyzeLearningCurve(userId, conceptId, timeRange) {
    return await conceptProgressTracker.analyzeLearningCurve(userId, conceptId, timeRange);
}

export async function identifySkillGaps(userId) {
    return await conceptProgressTracker.identifySkillGaps(userId);
}

export async function generateProgressReport(userId, conceptIds) {
    return await conceptProgressTracker.generateProgressReport(userId, conceptIds);
}

export async function getProgressHeatmap(userId, timeRange) {
    return await conceptProgressTracker.getProgressHeatmap(userId, timeRange);
}

export async function calculateLearningVelocity(userId, conceptId) {
    return await conceptProgressTracker.calculateLearningVelocity(userId, conceptId);
}
