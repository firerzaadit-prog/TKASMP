// adaptive_learning_engine.js - Adaptive Learning Path Engine
// Integrates with analytics.js and predictive_models.js for personalized learning paths

import { supabase } from './supabaseClient.js';
import { predictNextExamPerformance, identifySkillGaps, analyzeLearningTrends } from './predictive_models.js';

// ==========================================
// CONCEPT DEPENDENCY GRAPH
// ==========================================

class ConceptDependencyGraph {
    constructor() {
        this.nodes = new Map(); // conceptId -> { name, difficulty, prerequisites: [] }
        this.initializeGraph();
    }

    initializeGraph() {
        // Define core mathematical concepts and their dependencies
        const concepts = [
            // Basic concepts (no prerequisites)
            { id: 'aritmatika_dasar', name: 'Aritmatika Dasar', difficulty: 1, prerequisites: [] },
            { id: 'aljabar_dasar', name: 'Aljabar Dasar', difficulty: 2, prerequisites: [] },
            { id: 'geometri_dasar', name: 'Geometri Dasar', difficulty: 2, prerequisites: [] },

            // Intermediate concepts
            { id: 'persamaan_linear', name: 'Persamaan Linear', difficulty: 3, prerequisites: ['aljabar_dasar'] },
            { id: 'bangun_datar', name: 'Bangun Datar', difficulty: 3, prerequisites: ['geometri_dasar'] },
            { id: 'pecahan_desimal', name: 'Pecahan dan Desimal', difficulty: 2, prerequisites: ['aritmatika_dasar'] },

            // Advanced concepts
            { id: 'sistem_persamaan', name: 'Sistem Persamaan', difficulty: 4, prerequisites: ['persamaan_linear'] },
            { id: 'trigonometri', name: 'Trigonometri', difficulty: 4, prerequisites: ['bangun_datar'] },
            { id: 'statistika_dasar', name: 'Statistika Dasar', difficulty: 3, prerequisites: ['pecahan_desimal'] },

            // Complex concepts
            { id: 'fungsi_kuadrat', name: 'Fungsi Kuadrat', difficulty: 5, prerequisites: ['sistem_persamaan'] },
            { id: 'geometri_analitik', name: 'Geometri Analitik', difficulty: 5, prerequisites: ['trigonometri', 'sistem_persamaan'] },
            { id: 'probabilitas', name: 'Probabilitas', difficulty: 4, prerequisites: ['statistika_dasar'] }
        ];

        concepts.forEach(concept => {
            this.nodes.set(concept.id, {
                name: concept.name,
                difficulty: concept.difficulty,
                prerequisites: concept.prerequisites
            });
        });
    }

    getPrerequisites(conceptId) {
        return this.nodes.get(conceptId)?.prerequisites || [];
    }

    getDifficulty(conceptId) {
        return this.nodes.get(conceptId)?.difficulty || 1;
    }

    getAllConcepts() {
        return Array.from(this.nodes.keys());
    }

    // Get concepts that can be learned next (all prerequisites mastered)
    getAvailableConcepts(masteredConcepts) {
        const available = [];
        for (const [conceptId, concept] of this.nodes) {
            if (!masteredConcepts.has(conceptId)) {
                const allPrereqsMastered = concept.prerequisites.every(prereq =>
                    masteredConcepts.has(prereq)
                );
                if (allPrereqsMastered) {
                    available.push(conceptId);
                }
            }
        }
        return available;
    }

    // Perform topological sort to get learning order
    getTopologicalOrder() {
        const visited = new Set();
        const temp = new Set();
        const order = [];

        const visit = (conceptId) => {
            if (temp.has(conceptId)) return; // Cycle detected, but we'll ignore for now
            if (visited.has(conceptId)) return;

            temp.add(conceptId);

            const concept = this.nodes.get(conceptId);
            if (concept) {
                concept.prerequisites.forEach(prereq => visit(prereq));
            }

            temp.delete(conceptId);
            visited.add(conceptId);
            order.push(conceptId);
        };

        for (const conceptId of this.nodes.keys()) {
            if (!visited.has(conceptId)) {
                visit(conceptId);
            }
        }

        return order.reverse(); // Reverse to get dependency order
    }
}

// ==========================================
// STUDENT MASTERY TRACKER
// ==========================================

class StudentMasteryTracker {
    constructor() {
        this.masteryLevels = new Map(); // conceptId -> mastery level (0-1)
        this.conceptAttempts = new Map(); // conceptId -> { correct, total }
    }

    updateMastery(conceptId, performance) {
        // performance: 0-1 (0 = failed, 1 = perfect)

        const current = this.masteryLevels.get(conceptId) || 0;
        const attempts = this.conceptAttempts.get(conceptId) || { correct: 0, total: 0 };

        attempts.total++;
        if (performance >= 0.7) attempts.correct++; // Consider 70%+ as correct

        // Calculate new mastery using exponential moving average
        const alpha = 0.3; // Learning rate
        const newMastery = alpha * performance + (1 - alpha) * current;

        this.masteryLevels.set(conceptId, Math.min(1, newMastery));
        this.conceptAttempts.set(conceptId, attempts);
    }

    getMastery(conceptId) {
        return this.masteryLevels.get(conceptId) || 0;
    }

    getMasteredConcepts(threshold = 0.8) {
        const mastered = new Set();
        for (const [conceptId, mastery] of this.masteryLevels) {
            if (mastery >= threshold) {
                mastered.add(conceptId);
            }
        }
        return mastered;
    }

    getWeakConcepts(threshold = 0.5) {
        const weak = [];
        for (const [conceptId, mastery] of this.masteryLevels) {
            if (mastery < threshold) {
                weak.push({ conceptId, mastery });
            }
        }
        return weak.sort((a, b) => a.mastery - b.mastery);
    }
}

// ==========================================
// LEARNING PATH ENGINE
// ==========================================

class LearningPathEngine {
    constructor() {
        this.graph = new ConceptDependencyGraph();
        this.studentTrackers = new Map(); // userId -> StudentMasteryTracker
        this.activePaths = new Map(); // userId -> current path
    }

    getTracker(userId) {
        if (!this.studentTrackers.has(userId)) {
            this.studentTrackers.set(userId, new StudentMasteryTracker());
        }
        return this.studentTrackers.get(userId);
    }

    // Generate personalized learning path
    async generatePersonalizedPath(userId) {
        try {
            const tracker = this.getTracker(userId);
            const masteredConcepts = tracker.getMasteredConcepts();
            const availableConcepts = this.graph.getAvailableConcepts(masteredConcepts);

            // Get student data for personalization
            const studentData = await this.getStudentData(userId);
            const preferences = studentData.preferences || {};
            const pace = preferences.pace || 'moderate'; // slow, moderate, fast

            // Calculate optimal difficulty progression
            const currentAvgMastery = this.calculateAverageMastery(tracker);
            const targetDifficulty = this.calculateTargetDifficulty(currentAvgMastery, pace);

            // Filter concepts by difficulty and availability
            let candidateConcepts = availableConcepts.filter(conceptId => {
                const difficulty = this.graph.getDifficulty(conceptId);
                return difficulty <= targetDifficulty + 1; // Allow slightly harder concepts
            });

            // Prioritize based on skill gaps and predictions
            const skillGaps = await this.identifySkillGapsForStudent(userId);
            const gapConcepts = skillGaps.map(gap => gap.conceptId);

            // Sort candidates: skill gaps first, then by difficulty
            candidateConcepts.sort((a, b) => {
                const aIsGap = gapConcepts.includes(a);
                const bIsGap = gapConcepts.includes(b);

                if (aIsGap && !bIsGap) return -1;
                if (!aIsGap && bIsGap) return 1;

                // Then by difficulty (easier first)
                return this.graph.getDifficulty(a) - this.graph.getDifficulty(b);
            });

            // Generate path with appropriate length based on pace
            const pathLength = this.getPathLengthForPace(pace);
            const path = candidateConcepts.slice(0, pathLength);

            // Store the active path
            this.activePaths.set(userId, {
                concepts: path,
                generatedAt: new Date(),
                progress: 0,
                pace: pace
            });

            return {
                path: path.map(conceptId => ({
                    id: conceptId,
                    name: this.graph.nodes.get(conceptId).name,
                    difficulty: this.graph.getDifficulty(conceptId),
                    prerequisites: this.graph.getPrerequisites(conceptId)
                })),
                estimatedTime: this.estimatePathTime(path, pace),
                skillGaps: skillGaps.length,
                targetDifficulty: targetDifficulty
            };

        } catch (error) {
            console.error('Error generating personalized path:', error);
            return { path: [], estimatedTime: 0, skillGaps: 0, targetDifficulty: 1 };
        }
    }

    // Update path based on performance
    async updatePathBasedOnPerformance(userId, conceptId, performance) {
        const tracker = this.getTracker(userId);
        tracker.updateMastery(conceptId, performance);

        const activePath = this.activePaths.get(userId);
        if (activePath) {
            activePath.progress = Math.min(activePath.progress + 1, activePath.concepts.length);

            // If performance is poor, adjust path
            if (performance < 0.5) {
                // Add remedial concepts
                const prerequisites = this.graph.getPrerequisites(conceptId);
                const weakPrereqs = prerequisites.filter(prereq =>
                    tracker.getMastery(prereq) < 0.7
                );

                if (weakPrereqs.length > 0) {
                    // Insert remedial concepts at the beginning of remaining path
                    const remainingPath = activePath.concepts.slice(activePath.progress);
                    activePath.concepts = [
                        ...activePath.concepts.slice(0, activePath.progress),
                        ...weakPrereqs,
                        ...remainingPath
                    ];
                }
            }

            // If performance is excellent, accelerate
            if (performance > 0.9 && activePath.pace !== 'fast') {
                // Add an extra concept if available
                const mastered = tracker.getMasteredConcepts();
                const available = this.graph.getAvailableConcepts(mastered);
                const nextConcept = available.find(c => !activePath.concepts.includes(c));

                if (nextConcept) {
                    activePath.concepts.splice(activePath.progress + 1, 0, nextConcept);
                }
            }
        }

        // Retrain predictive models with new data
        await this.updatePredictiveModels(userId);
    }

    // Get next recommended content
    async getNextRecommendedContent(userId) {
        const activePath = this.activePaths.get(userId);
        if (!activePath || activePath.progress >= activePath.concepts.length) {
            // Generate new path if current is completed
            const newPath = await this.generatePersonalizedPath(userId);
            return newPath.path.length > 0 ? newPath.path[0] : null;
        }

        const nextConceptId = activePath.concepts[activePath.progress];
        return {
            id: nextConceptId,
            name: this.graph.nodes.get(nextConceptId).name,
            difficulty: this.graph.getDifficulty(nextConceptId),
            prerequisites: this.graph.getPrerequisites(nextConceptId)
        };
    }

    // Calculate optimal difficulty for a concept
    async calculateOptimalDifficulty(userId, conceptId) {
        const tracker = this.getTracker(userId);
        const baseDifficulty = this.graph.getDifficulty(conceptId);
        const currentMastery = tracker.getMastery(conceptId);

        // Adjust based on student's current level
        const avgMastery = this.calculateAverageMastery(tracker);

        // Use predictive model for difficulty adjustment
        const prediction = await predictNextExamPerformance({ id: userId, avgScore: avgMastery * 100 });

        let adjustment = 0;
        if (prediction) {
            const predictedScore = prediction;
            if (predictedScore > 80) adjustment = 0.5; // Can handle harder
            else if (predictedScore < 60) adjustment = -0.5; // Needs easier
        }

        const optimalDifficulty = Math.max(1, Math.min(5, baseDifficulty + adjustment));

        return {
            baseDifficulty: baseDifficulty,
            optimalDifficulty: optimalDifficulty,
            adjustment: adjustment,
            reasoning: adjustment > 0 ? 'Student ready for challenge' :
                      adjustment < 0 ? 'Student needs easier content' :
                      'Difficulty matches current level'
        };
    }

    // Helper methods
    async getStudentData(userId) {
        // In real implementation, fetch from database
        // For now, return mock data
        return {
            preferences: { pace: 'moderate' },
            history: []
        };
    }

    calculateAverageMastery(tracker) {
        const masteries = Array.from(tracker.masteryLevels.values());
        return masteries.length > 0 ?
            masteries.reduce((sum, m) => sum + m, 0) / masteries.length : 0;
    }

    calculateTargetDifficulty(avgMastery, pace) {
        const baseDifficulty = Math.floor(avgMastery * 5) + 1;
        const paceMultiplier = { slow: 0.8, moderate: 1.0, fast: 1.2 };
        return Math.max(1, Math.min(5, baseDifficulty * paceMultiplier[pace]));
    }

    getPathLengthForPace(pace) {
        const lengths = { slow: 3, moderate: 5, fast: 7 };
        return lengths[pace] || 5;
    }

    estimatePathTime(concepts, pace) {
        const timePerConcept = { slow: 30, moderate: 20, fast: 15 }; // minutes
        const baseTime = concepts.length * timePerConcept[pace];
        return baseTime + (concepts.length - 1) * 5; // Add 5 min breaks
    }

    async identifySkillGapsForStudent(userId) {
        // Use predictive models to identify gaps
        const tracker = this.getTracker(userId);
        const weakConcepts = tracker.getWeakConcepts();

        return weakConcepts.map(({ conceptId, mastery }) => ({
            conceptId,
            mastery,
            priority: 1 - mastery // Higher priority for lower mastery
        }));
    }

    async updatePredictiveModels(userId) {
        // Trigger retraining of predictive models with new data
        // This would be called periodically, not on every update
        console.log('Updating predictive models for user:', userId);
    }
}

// ==========================================
// EXPORTS
// ==========================================

const learningPathEngine = new LearningPathEngine();

export {
    ConceptDependencyGraph,
    StudentMasteryTracker,
    LearningPathEngine,
    learningPathEngine
};

// Main API functions
export async function generatePersonalizedPath(userId) {
    return await learningPathEngine.generatePersonalizedPath(userId);
}

export async function updatePathBasedOnPerformance(userId, conceptId, performance) {
    return await learningPathEngine.updatePathBasedOnPerformance(userId, conceptId, performance);
}

export async function getNextRecommendedContent(userId) {
    return await learningPathEngine.getNextRecommendedContent(userId);
}

export async function calculateOptimalDifficulty(userId, conceptId) {
    return await learningPathEngine.calculateOptimalDifficulty(userId, conceptId);
}

// Utility functions
export function getConceptGraph() {
    return learningPathEngine.graph;
}

export function getStudentTracker(userId) {
    return learningPathEngine.getTracker(userId);
}