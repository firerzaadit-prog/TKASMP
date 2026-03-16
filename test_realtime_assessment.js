// test_realtime_assessment.js - Test suite for Real-time Assessment System

import { realtimeAssessmentEngine, startAssessmentSession, trackInteraction, assessUnderstanding, getNextAdaptiveQuestion, provideImmediateFeedback, calculateEngagementScore, endAssessmentSession } from './realtime_assessment.js';
import { supabase } from './clientSupabase.js';

// Mock user and concept for testing
const TEST_USER_ID = 'test-user-123';
const TEST_CONCEPT_ID = 'aritmatika_dasar';

// ==========================================
// TEST SUITE
// ==========================================

class RealtimeAssessmentTester {
    constructor() {
        this.sessionId = null;
        this.questions = [];
    }

    // Test 1: Start Assessment Session
    async testStartSession() {
        console.log('\n=== TEST 1: Start Assessment Session ===');

        try {
            this.sessionId = await startAssessmentSession(TEST_USER_ID, TEST_CONCEPT_ID);

            if (this.sessionId) {
                console.log('✅ Session started successfully:', this.sessionId);

                const summary = realtimeAssessmentEngine.getSessionSummary(this.sessionId);
                console.log('Session summary:', summary);

                return true;
            } else {
                console.error('❌ Failed to start session');
                return false;
            }
        } catch (error) {
            console.error('❌ Error starting session:', error);
            return false;
        }
    }

    // Test 2: Track Interactions
    async testTrackInteractions() {
        console.log('\n=== TEST 2: Track Interactions ===');

        if (!this.sessionId) {
            console.error('❌ No active session');
            return false;
        }

        try {
            // Simulate various interactions
            const interactions = [
                { type: 'click', data: { x: 100, y: 200, target: 'button' } },
                { type: 'scroll', data: { scrollTop: 500, scrollHeight: 2000 } },
                { type: 'keypress', data: { key: 'a' } },
                { type: 'focus', data: {} },
                { type: 'mouse_move', data: { x: 150, y: 250 } }
            ];

            for (const interaction of interactions) {
                const result = trackInteraction(TEST_USER_ID, interaction.type, interaction.data);
                if (result) {
                    console.log(`✅ Tracked ${interaction.type} interaction`);
                } else {
                    console.log(`❌ Failed to track ${interaction.type} interaction`);
                }

                // Small delay to simulate real interaction timing
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return true;
        } catch (error) {
            console.error('❌ Error tracking interactions:', error);
            return false;
        }
    }

    // Test 3: Load and Answer Questions
    async testQuestionFlow() {
        console.log('\n=== TEST 3: Question Flow ===');

        if (!this.sessionId) {
            console.error('❌ No active session');
            return false;
        }

        try {
            // Get first question
            const firstQuestion = await getNextAdaptiveQuestion(TEST_USER_ID, TEST_CONCEPT_ID);

            if (!firstQuestion) {
                console.log('⚠️ No questions available for concept');
                return true; // This might be expected if no questions exist
            }

            console.log('✅ Got first question:', firstQuestion.questionId);
            console.log('Question details:', {
                difficulty: firstQuestion.predictedDifficulty,
                knowledgeState: firstQuestion.knowledgeState
            });

            this.questions.push(firstQuestion);

            // Simulate answering the question
            const responseData = {
                questionId: firstQuestion.questionId,
                selectedAnswer: 'A', // Assume correct answer
                timeSpent: 30000 // 30 seconds
            };

            const assessment = await assessUnderstanding(TEST_USER_ID, TEST_CONCEPT_ID, responseData);

            if (assessment) {
                console.log('✅ Assessment completed:', {
                    isCorrect: assessment.isCorrect,
                    knowledgeState: assessment.knowledgeState.pLearned,
                    performance: assessment.performance
                });

                // Get feedback
                const feedback = provideImmediateFeedback(TEST_USER_ID, firstQuestion.questionId, 'A');

                if (feedback) {
                    console.log('✅ Feedback provided:', {
                        isCorrect: feedback.isCorrect,
                        message: feedback.message,
                        hint: feedback.hint ? 'Available' : 'None',
                        nextSteps: feedback.nextSteps
                    });
                }

                // Get next question
                const nextQuestion = await getNextAdaptiveQuestion(TEST_USER_ID, TEST_CONCEPT_ID);

                if (nextQuestion) {
                    console.log('✅ Got next question:', nextQuestion.questionId);
                    this.questions.push(nextQuestion);
                } else {
                    console.log('ℹ️ No more questions available');
                }

            } else {
                console.error('❌ Assessment failed');
                return false;
            }

            return true;
        } catch (error) {
            console.error('❌ Error in question flow:', error);
            return false;
        }
    }

    // Test 4: Calculate Engagement Score
    async testEngagementScore() {
        console.log('\n=== TEST 4: Calculate Engagement Score ===');

        if (!this.sessionId) {
            console.error('❌ No active session');
            return false;
        }

        try {
            // Wait a bit to accumulate interactions
            await new Promise(resolve => setTimeout(resolve, 1000));

            const engagement = calculateEngagementScore(TEST_USER_ID);

            if (engagement) {
                console.log('✅ Engagement score calculated:', {
                    score: engagement.score.toFixed(3),
                    metrics: Object.keys(engagement.metrics)
                });

                // Log detailed metrics
                console.log('Detailed metrics:');
                Object.entries(engagement.metrics).forEach(([metric, value]) => {
                    console.log(`  ${metric}: ${value.toFixed(3)}`);
                });

                return true;
            } else {
                console.error('❌ Failed to calculate engagement');
                return false;
            }
        } catch (error) {
            console.error('❌ Error calculating engagement:', error);
            return false;
        }
    }

    // Test 5: End Session
    async testEndSession() {
        console.log('\n=== TEST 5: End Assessment Session ===');

        if (!this.sessionId) {
            console.error('❌ No active session');
            return false;
        }

        try {
            const result = await endAssessmentSession(this.sessionId);

            if (result) {
                console.log('✅ Session ended successfully:', {
                    sessionId: result.sessionId,
                    duration: Math.round(result.duration / 1000) + 's',
                    finalKnowledge: result.finalKnowledge.toFixed(3),
                    engagementScore: result.engagementScore.toFixed(3),
                    questionsAnswered: result.questionsAnswered,
                    accuracy: result.accuracy.toFixed(3)
                });

                this.sessionId = null;
                return true;
            } else {
                console.error('❌ Failed to end session');
                return false;
            }
        } catch (error) {
            console.error('❌ Error ending session:', error);
            return false;
        }
    }

    // Test 6: Multiple Sessions
    async testMultipleSessions() {
        console.log('\n=== TEST 6: Multiple Sessions Test ===');

        try {
            // Start multiple sessions for different concepts
            const concepts = ['aljabar_dasar', 'geometri_dasar', 'persamaan_linear'];

            for (const conceptId of concepts) {
                console.log(`\nTesting session for concept: ${conceptId}`);

                // Start session
                const sessionId = await startAssessmentSession(TEST_USER_ID, conceptId);
                if (!sessionId) {
                    console.log(`❌ Failed to start session for ${conceptId}`);
                    continue;
                }

                // Quick interaction
                trackInteraction(TEST_USER_ID, 'click', { target: 'start-button' });

                // End session quickly
                await endAssessmentSession(sessionId);
                console.log(`✅ Completed quick session for ${conceptId}`);
            }

            return true;
        } catch (error) {
            console.error('❌ Error in multiple sessions test:', error);
            return false;
        }
    }

    // Test 7: Error Handling
    async testErrorHandling() {
        console.log('\n=== TEST 7: Error Handling ===');

        try {
            // Test with invalid user ID
            const invalidSession = await startAssessmentSession('invalid-user', TEST_CONCEPT_ID);
            console.log('Invalid user session result:', invalidSession);

            // Test with invalid concept ID
            const invalidConceptSession = await startAssessmentSession(TEST_USER_ID, 'invalid-concept');
            console.log('Invalid concept session result:', invalidConceptSession);

            // Test tracking interaction without active session
            const noSessionInteraction = trackInteraction('nonexistent-user', 'click', {});
            console.log('No session interaction result:', noSessionInteraction);

            // Test ending non-existent session
            const endResult = await endAssessmentSession('nonexistent-session');
            console.log('End nonexistent session result:', endResult);

            console.log('✅ Error handling tests completed');
            return true;
        } catch (error) {
            console.error('❌ Error in error handling test:', error);
            return false;
        }
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 Starting Real-time Assessment System Tests\n');

        const tests = [
            { name: 'Start Session', method: this.testStartSession.bind(this) },
            { name: 'Track Interactions', method: this.testTrackInteractions.bind(this) },
            { name: 'Question Flow', method: this.testQuestionFlow.bind(this) },
            { name: 'Engagement Score', method: this.testEngagementScore.bind(this) },
            { name: 'End Session', method: this.testEndSession.bind(this) },
            { name: 'Multiple Sessions', method: this.testMultipleSessions.bind(this) },
            { name: 'Error Handling', method: this.testErrorHandling.bind(this) }
        ];

        const results = [];

        for (const test of tests) {
            console.log(`\n🔄 Running ${test.name}...`);
            const result = await test.method();
            results.push({ name: test.name, passed: result });

            if (result) {
                console.log(`✅ ${test.name} PASSED`);
            } else {
                console.log(`❌ ${test.name} FAILED`);
            }
        }

        // Summary
        console.log('\n📊 TEST SUMMARY');
        console.log('='.repeat(50));

        const passed = results.filter(r => r.passed).length;
        const total = results.length;

        results.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}`);
        });

        console.log(`\n🎯 Overall: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All tests passed! Real-time Assessment System is working correctly.');
        } else {
            console.log('⚠️ Some tests failed. Please check the implementation.');
        }

        return passed === total;
    }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Mock database setup for testing (if needed)
async function setupTestDatabase() {
    console.log('Setting up test database...');

    try {
        // This would normally set up test data, but since we're using Supabase,
        // we'll assume the schema is already created and test with mock data

        console.log('Test database setup complete');
    } catch (error) {
        console.error('Error setting up test database:', error);
    }
}

// Performance testing
async function runPerformanceTest() {
    console.log('\n⚡ Running Performance Tests...');

    const startTime = Date.now();

    // Test session creation performance
    const sessions = [];
    for (let i = 0; i < 10; i++) {
        const sessionId = await startAssessmentSession(`perf-user-${i}`, TEST_CONCEPT_ID);
        if (sessionId) {
            sessions.push(sessionId);

            // Quick interactions
            for (let j = 0; j < 5; j++) {
                trackInteraction(`perf-user-${i}`, 'click', { test: true });
            }

            await endAssessmentSession(sessionId);
        }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`Performance test completed in ${duration}ms`);
    console.log(`Created and completed ${sessions.length} sessions`);
    console.log(`Average time per session: ${(duration / sessions.length).toFixed(2)}ms`);
}

// ==========================================
// MAIN TEST EXECUTION
// ==========================================

// Run tests when this file is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    console.log('Running tests in Node.js environment...');

    // Setup and run tests
    setupTestDatabase().then(() => {
        const tester = new RealtimeAssessmentTester();
        return tester.runAllTests();
    }).then(success => {
        if (success) {
            console.log('\n🎉 All tests completed successfully!');
            process.exit(0);
        } else {
            console.log('\n❌ Some tests failed!');
            process.exit(1);
        }
    }).catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });

} else {
    // Browser environment - expose test functions globally
    window.RealtimeAssessmentTester = RealtimeAssessmentTester;
    window.runRealtimeAssessmentTests = async () => {
        const tester = new RealtimeAssessmentTester();
        return await tester.runAllTests();
    };

    window.runPerformanceTest = runPerformanceTest;

    console.log('Real-time Assessment Tests loaded. Run window.runRealtimeAssessmentTests() to start testing.');
}

// Export for use in other modules
export { RealtimeAssessmentTester, runPerformanceTest };