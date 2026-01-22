// test_gemini_analytics.js - Test Gemini AI Integration
import { geminiAnalytics, isGeminiAvailable, getGeminiStatus } from './gemini_analytics.js';

// Mock data for testing
const mockAnswerData = {
    id: 'test-answer-1',
    answer_text: '2x + 3 = 7, maka x = 2',
    question_id: 'test-question-1'
};

const mockQuestionData = {
    id: 'test-question-1',
    question_text: 'Selesaikan persamaan: 2x + 3 = 7',
    correct_answer: 'x = 2',
    question_type: 'Pilihan Ganda',
    difficulty: 'Mudah'
};

// Test functions
async function testGeminiStatus() {
    console.log('=== Testing Gemini AI Status ===');
    console.log('Gemini Available:', isGeminiAvailable());
    console.log('Gemini Status:', getGeminiStatus());
}

async function testGeminiAnalysis() {
    console.log('\n=== Testing Gemini AI Analysis ===');

    if (!isGeminiAvailable()) {
        console.log('⚠️  Gemini AI not configured. Set GEMINI_API_KEY in gemini_analytics.js');
        console.log('Using fallback analysis...');

        // Test fallback analysis
        const fallbackAnalysis = geminiAnalytics.getFallbackAnalysis(mockAnswerData, mockQuestionData);
        console.log('Fallback Analysis Result:', fallbackAnalysis);
        return;
    }

    try {
        console.log('Analyzing answer with Gemini AI...');
        const analysis = await geminiAnalytics.analyzeStudentAnswer(mockAnswerData, mockQuestionData);

        console.log('✅ Analysis completed successfully!');
        console.log('Score:', analysis.score);
        console.log('Correctness:', analysis.correctness);
        console.log('Strengths:', analysis.strengths);
        console.log('Weaknesses:', analysis.weaknesses);
        console.log('Explanation:', analysis.explanation);
        console.log('Suggestions:', analysis.learningSuggestions);

    } catch (error) {
        console.error('❌ Analysis failed:', error);
    }
}

async function testBatchAnalysis() {
    console.log('\n=== Testing Batch Analysis ===');

    const mockAnswers = [
        {
            id: 'answer-1',
            answer_text: '2x + 3 = 7, maka x = 2',
            question_id: 'q1'
        },
        {
            id: 'answer-2',
            answer_text: 'Luas persegi panjang adalah panjang × lebar',
            question_id: 'q2'
        }
    ];

 const mockQuestions = new Map([
    ['q1', { id: 'q1', question_text: 'Selesaikan: 2x + 3 = 7', correct_answer: 'x = 2' }],
    ['q2', { id: 'q2', question_text: 'Rumus luas persegi panjang?', correct_answer: 'panjang × lebar' }]
]);

    try {
        console.log('Running batch analysis...');
        const results = await geminiAnalytics.batchAnalyzeAnswers(mockAnswers, mockQuestions);

        console.log('✅ Batch analysis completed!');
        console.log('Results:', results.length);

        results.forEach((result, index) => {
            console.log(`\nAnswer ${index + 1}:`);
            console.log('- Score:', result.analysis.score);
            console.log('- Correctness:', result.analysis.correctness);
        });

    } catch (error) {
        console.error('❌ Batch analysis failed:', error);
    }
}

async function testCapabilityReport() {
    console.log('\n=== Testing Capability Report ===');

    const mockAnalyses = [
        {
            analysis: {
                score: 85,
                strengths: ['Pemahaman konsep dasar', 'Langkah sistematis'],
                weaknesses: ['Perhitungan kurang teliti'],
                learningSuggestions: ['Latih perhitungan lebih banyak']
            }
        },
        {
            analysis: {
                score: 75,
                strengths: ['Logika matematika baik'],
                weaknesses: ['Konversi satuan sering salah'],
                learningSuggestions: ['Pelajari konversi satuan']
            }
        }
    ];

    try {
        console.log('Generating capability report...');
        const report = await geminiAnalytics.generateCapabilityReport('student-1', mockAnalyses);

        console.log('✅ Capability report generated!');
        console.log('Overall Capability:', report.overallCapability);
        console.log('Main Strengths:', report.mainStrengths);
        console.log('Areas for Improvement:', report.areasForImprovement);
        console.log('Recommendations:', report.recommendations);

    } catch (error) {
        console.error('❌ Capability report failed:', error);
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Gemini AI Analytics Tests\n');

    await testGeminiStatus();
    await testGeminiAnalysis();
    await testBatchAnalysis();
    await testCapabilityReport();

    console.log('\n🎉 All tests completed!');
}

// Export for use in other files
export {
    testGeminiStatus,
    testGeminiAnalysis,
    testBatchAnalysis,
    testCapabilityReport,
    runAllTests
};

// Auto-run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - don't auto-run
} else {
    // Node.js environment - run tests
    runAllTests().catch(console.error);
}