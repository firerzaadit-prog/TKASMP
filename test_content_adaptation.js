// test_content_adaptation.js - Basic test for content adaptation module
// Run this in browser console or Node.js with ESM support

import {
    adaptContentForStudent,
    adjustDifficultyLevel,
    generatePersonalizedContent,
    calculateOptimalPacing,
    provideAdaptiveHints,
    getAdaptedLearningPath
} from './content_adaptation.js';

console.log('Testing Content Adaptation Module...');

// Test 1: adaptContentForStudent
async function testAdaptContent() {
    try {
        console.log('Test 1: adaptContentForStudent');
        const result = await adaptContentForStudent('test-user-id', 'test-content-id', 0.7);
        console.log('✓ adaptContentForStudent result:', result);
    } catch (error) {
        console.log('✗ adaptContentForStudent error:', error.message);
    }
}

// Test 2: adjustDifficultyLevel
async function testAdjustDifficulty() {
    try {
        console.log('Test 2: adjustDifficultyLevel');
        const result = await adjustDifficultyLevel('test-user-id', 'aritmatika_dasar', {
            accuracy: 0.8,
            speed: 0.6,
            consistency: 0.7,
            improvement: 0.2
        });
        console.log('✓ adjustDifficultyLevel result:', result);
    } catch (error) {
        console.log('✗ adjustDifficultyLevel error:', error.message);
    }
}

// Test 3: generatePersonalizedContent
async function testPersonalizeContent() {
    try {
        console.log('Test 3: generatePersonalizedContent');
        const template = {
            title: 'Basic Algebra',
            content: 'Learn about variables and equations',
            examples: ['2x + 3 = 7', 'Solve for x'],
            prerequisites: ['basic_arithmetic']
        };
        const profile = {
            learningStyle: 'visual',
            priorKnowledge: ['basic_arithmetic'],
            interests: ['mathematics', 'puzzles']
        };
        const result = await generatePersonalizedContent(template, profile);
        console.log('✓ generatePersonalizedContent result:', result);
    } catch (error) {
        console.log('✗ generatePersonalizedContent error:', error.message);
    }
}

// Test 4: calculateOptimalPacing
async function testCalculatePacing() {
    try {
        console.log('Test 4: calculateOptimalPacing');
        const result = await calculateOptimalPacing('test-user-id', 'text');
        console.log('✓ calculateOptimalPacing result:', result);
    } catch (error) {
        console.log('✗ calculateOptimalPacing error:', error.message);
    }
}

// Test 5: provideAdaptiveHints
async function testProvideHints() {
    try {
        console.log('Test 5: provideAdaptiveHints');
        const result = await provideAdaptiveHints('test-user-id', 'aritmatika_dasar', 0.6);
        console.log('✓ provideAdaptiveHints result:', result);
    } catch (error) {
        console.log('✗ provideAdaptiveHints error:', error.message);
    }
}

// Test 6: getAdaptedLearningPath
async function testAdaptedLearningPath() {
    try {
        console.log('Test 6: getAdaptedLearningPath');
        const result = await getAdaptedLearningPath('test-user-id');
        console.log('✓ getAdaptedLearningPath result:', result);
    } catch (error) {
        console.log('✗ getAdaptedLearningPath error:', error.message);
    }
}

// Run all tests
async function runAllTests() {
    console.log('='.repeat(50));
    console.log('CONTENT ADAPTATION MODULE TESTS');
    console.log('='.repeat(50));

    await testAdaptContent();
    console.log('');

    await testAdjustDifficulty();
    console.log('');

    await testPersonalizeContent();
    console.log('');

    await testCalculatePacing();
    console.log('');

    await testProvideHints();
    console.log('');

    await testAdaptedLearningPath();
    console.log('');

    console.log('='.repeat(50));
    console.log('TESTS COMPLETED');
    console.log('='.repeat(50));
}

// Export for browser usage
window.runContentAdaptationTests = runAllTests;

// Auto-run if in Node.js environment
if (typeof process !== 'undefined' && process.argv) {
    runAllTests().catch(console.error);
}