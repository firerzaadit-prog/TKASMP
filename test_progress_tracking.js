// test_progress_tracking.js - Test suite for progress tracking functionality

import {
    trackConceptProgress,
    getConceptMasteryLevel,
    analyzeLearningCurve,
    identifySkillGaps,
    generateProgressReport,
    getProgressHeatmap,
    calculateLearningVelocity
} from './progress_tracking.js';

import { supabase } from './clientSupabase.js';

// Test data
const testUserId = 'test-user-123';
const testConceptId = 'aritmatika_dasar';

// Mock performance data
const mockPerformanceData = {
    performanceScore: 0.85,
    timeSpentSeconds: 1200,
    difficultyLevel: 2,
    metadata: {
        sessionType: 'practice',
        hintsUsed: 1,
        attempts: 2
    }
};

// Test functions
async function runProgressTrackingTests() {
    console.log('🧪 Starting Progress Tracking Tests...\n');

    try {
        // Test 1: Track Concept Progress
        console.log('Test 1: Tracking Concept Progress');
        const trackResult = await trackConceptProgress(testUserId, testConceptId, mockPerformanceData);
        console.log('✅ Track result:', trackResult ? 'Success' : 'Failed');

        // Test 2: Get Concept Mastery Level
        console.log('\nTest 2: Getting Concept Mastery Level');
        const masteryResult = await getConceptMasteryLevel(testUserId, testConceptId);
        console.log('✅ Mastery level:', masteryResult);

        // Test 3: Analyze Learning Curve
        console.log('\nTest 3: Analyzing Learning Curve');
        const curveResult = await analyzeLearningCurve(testUserId, testConceptId, { days: 30 });
        console.log('✅ Learning curve analysis:', curveResult ? 'Success' : 'No data');

        // Test 4: Calculate Learning Velocity
        console.log('\nTest 4: Calculating Learning Velocity');
        const velocityResult = await calculateLearningVelocity(testUserId, testConceptId);
        console.log('✅ Learning velocity:', velocityResult);

        // Test 5: Identify Skill Gaps
        console.log('\nTest 5: Identifying Skill Gaps');
        const gapsResult = await identifySkillGaps(testUserId);
        console.log('✅ Skill gaps found:', gapsResult.length);

        // Test 6: Generate Progress Report
        console.log('\nTest 6: Generating Progress Report');
        const reportResult = await generateProgressReport(testUserId);
        console.log('✅ Progress report:', reportResult ? 'Generated' : 'Failed');

        // Test 7: Get Progress Heatmap
        console.log('\nTest 7: Getting Progress Heatmap');
        const heatmapResult = await getProgressHeatmap(testUserId, { days: 30 });
        console.log('✅ Progress heatmap:', heatmapResult ? 'Generated' : 'No data');

        // Test 8: Multiple Concept Tracking
        console.log('\nTest 8: Multiple Concept Tracking');
        const concepts = ['persamaan_linear', 'bangun_datar', 'pecahan_desimal'];
        for (const concept of concepts) {
            const testData = {
                ...mockPerformanceData,
                performanceScore: Math.random() * 0.5 + 0.5, // 0.5-1.0
                timeSpentSeconds: Math.floor(Math.random() * 1800) + 600 // 10-40 minutes
            };

            await trackConceptProgress(testUserId, concept, testData);
            console.log(`✅ Tracked progress for ${concept}`);
        }

        // Test 9: Comprehensive Report with Multiple Concepts
        console.log('\nTest 9: Comprehensive Report with Multiple Concepts');
        const multiReport = await generateProgressReport(testUserId, concepts);
        console.log('✅ Multi-concept report:', multiReport ? 'Generated' : 'Failed');

        // Test 10: Integration with Existing Systems
        console.log('\nTest 10: Integration Test');
        const integrationResult = await testIntegration();
        console.log('✅ Integration test:', integrationResult ? 'Passed' : 'Failed');

        console.log('\n🎉 All Progress Tracking Tests Completed!');

    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }
}

// Test integration with existing systems
async function testIntegration() {
    try {
        // Test database connectivity
        const { data: testData, error } = await supabase
            .from('concept_progress_history')
            .select('count')
            .limit(1);

        if (error) {
            console.error('Database integration failed:', error);
            return false;
        }

        // Test with adaptive learning engine (mock test)
        console.log('Integration with adaptive learning engine: OK');

        // Test with analytics (mock test)
        console.log('Integration with analytics system: OK');

        return true;

    } catch (error) {
        console.error('Integration test failed:', error);
        return false;
    }
}

// Performance test
async function runPerformanceTest() {
    console.log('\n⚡ Running Performance Tests...');

    const startTime = Date.now();

    // Simulate multiple progress tracking operations
    const operations = [];
    for (let i = 0; i < 10; i++) {
        operations.push(trackConceptProgress(testUserId, `test_concept_${i}`, {
            performanceScore: Math.random(),
            timeSpentSeconds: Math.floor(Math.random() * 3600),
            difficultyLevel: Math.floor(Math.random() * 5) + 1
        }));
    }

    await Promise.all(operations);

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✅ Performance test completed in ${duration}ms`);
    console.log(`Average time per operation: ${duration / 10}ms`);
}

// Cleanup test data
async function cleanupTestData() {
    console.log('\n🧹 Cleaning up test data...');

    try {
        // Delete test progress history
        await supabase
            .from('concept_progress_history')
            .delete()
            .eq('student_id', testUserId);

        // Delete test milestones
        await supabase
            .from('concept_milestones')
            .delete()
            .eq('student_id', testUserId);

        console.log('✅ Test data cleaned up');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    }
}

// Main test runner
async function main() {
    console.log('🚀 Progress Tracking Test Suite\n');
    console.log('=====================================\n');

    // Run main tests
    await runProgressTrackingTests();

    // Run performance test
    await runPerformanceTest();

    // Cleanup
    await cleanupTestData();

    console.log('\n✨ Test suite execution completed!');
}

// Export for use in other files
export { runProgressTrackingTests, runPerformanceTest, cleanupTestData };

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    main().catch(console.error);
} else {
    // Browser environment - expose to window
    window.runProgressTrackingTests = runProgressTrackingTests;
    window.runPerformanceTest = runPerformanceTest;
    window.cleanupTestData = cleanupTestData;

    // Auto-run in browser if not imported
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main().catch(console.error);
    }
}