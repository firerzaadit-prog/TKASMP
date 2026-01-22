// test_save_gemini_analyses.js - Test script untuk utility penyimpanan analisis Grok AI
import { supabase } from './supabaseClient.js';
import {
    saveGrokAnalysis,
    batchSaveGrokAnalyses,
    analyzeAndSaveUnanalyzed,
    getGrokAnalysesWithStudents,
    exportGrokAnalyses
} from './save_gemini_analyses.js';

// Test functions
async function testSingleSave() {
    console.log('=== Test Single Analysis Save ===');

    const testAnalysis = {
        score: 85,
        correctness: 'Benar Lengkap',
        strengths: ['Pemahaman konsep algebra baik', 'Langkah penyelesaian sistematis'],
        weaknesses: ['Perlu latihan perhitungan manual'],
        explanation: 'Jawaban menunjukkan pemahaman yang baik tentang konsep persamaan kuadrat. Siswa berhasil mengidentifikasi bentuk persamaan dan menerapkan rumus abc dengan benar.',
        learningSuggestions: ['Lanjutkan latihan soal persamaan kuadrat', 'Pelajari konsep diskriminan']
    };

    // Untuk test, kita perlu ID jawaban yang valid dari database
    // Dalam implementasi nyata, ambil dari exam_answers table
    const testAnswerId = 'test-answer-id'; // Ganti dengan ID real

    const success = await saveGrokAnalysis(testAnswerId, testAnalysis);
    console.log('Single save result:', success);
}

async function testBatchSave() {
    console.log('=== Test Batch Analysis Save ===');

    const testAnalyses = [
        {
            answerId: 'answer-1',
            analysis: {
                score: 90,
                correctness: 'Benar Lengkap',
                strengths: ['Logika matematika kuat'],
                weaknesses: [],
                explanation: 'Jawaban sempurna',
                learningSuggestions: ['Tingkatkan kecepatan']
            }
        },
        {
            answerId: 'answer-2',
            analysis: {
                score: 65,
                correctness: 'Sebagian Benar',
                strengths: ['Konsep dasar dipahami'],
                weaknesses: ['Kesalahan perhitungan'],
                explanation: 'Konsep benar tapi ada kesalahan aritmatika',
                learningSuggestions: ['Latihan perhitungan dasar']
            }
        }
    ];

    const results = await batchSaveGrokAnalyses(testAnalyses);
    console.log('Batch save results:', results);
}

async function testAnalyzeAndSave() {
    console.log('=== Test Analyze and Save Unanalyzed Answers ===');

    try {
        // Ambil beberapa jawaban dari database yang belum dianalisis
        const { data: answers, error: answersError } = await supabase
            .from('exam_answers')
            .select('*')
            .limit(5); // Ambil 5 jawaban untuk test

        if (answersError) {
            console.error('Error fetching answers:', answersError);
            return;
        }

        if (!answers || answers.length === 0) {
            console.log('No answers found for testing');
            return;
        }

        // Ambil questions
        const questionIds = [...new Set(answers.map(a => a.question_id))];
        const { data: questions, error: questionsError } = await supabase
            .from('questions')
            .select('*')
            .in('id', questionIds);

        if (questionsError) {
            console.error('Error fetching questions:', questionsError);
            return;
        }

        // Buat questions map
        const questionsMap = new Map();
        questions.forEach(q => questionsMap.set(q.id, q));

        // Analisis dan simpan
        const result = await analyzeAndSaveUnanalyzed(answers, questionsMap);
        console.log('Analyze and save result:', result);

    } catch (error) {
        console.error('Error in testAnalyzeAndSave:', error);
    }
}

async function testGetAnalyses() {
    console.log('=== Test Get Analyses with Student Info ===');

    const analyses = await getGrokAnalysesWithStudents(10);
    console.log(`Retrieved ${analyses.length} analyses:`);
    analyses.forEach((analysis, index) => {
        console.log(`${index + 1}. ${analysis.studentName} (${analysis.studentClass}): Score ${analysis.analysis.score}`);
    });
}

async function testExport() {
    console.log('=== Test Export Analyses ===');

    const jsonData = await exportGrokAnalyses();
    if (jsonData) {
        console.log('Export successful. First 500 characters:');
        console.log(jsonData.substring(0, 500) + '...');

        // Simpan ke file (dalam browser environment)
        if (typeof window !== 'undefined') {
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `grok-analyses-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('File downloaded as grok-analyses-export-[date].json');
        }
    } else {
        console.log('Export failed');
    }
}

// Main test runner
async function runTests() {
    console.log('🚀 Starting Gemini Analysis Save Tests...\n');

    try {
        // Test 1: Single save (commented out karena butuh ID valid)
        // await testSingleSave();

        // Test 2: Batch save (commented out karena butuh ID valid)
        // await testBatchSave();

        // Test 3: Analyze and save (akan berjalan jika ada data)
        await testAnalyzeAndSave();

        // Test 4: Get analyses
        await testGetAnalyses();

        // Test 5: Export
        await testExport();

    } catch (error) {
        console.error('❌ Test runner error:', error);
    }

    console.log('\n✅ Tests completed!');
}

// Export untuk penggunaan di browser console atau module
if (typeof window !== 'undefined') {
    window.testGeminiAnalysisSave = runTests;
    window.testSingleSave = testSingleSave;
    window.testBatchSave = testBatchSave;
    window.testAnalyzeAndSave = testAnalyzeAndSave;
    window.testGetAnalyses = testGetAnalyses;
    window.testExport = testExport;

    console.log('🔧 Test functions available:');
    console.log('- testGeminiAnalysisSave() // Run all tests');
    console.log('- testSingleSave()');
    console.log('- testBatchSave()');
    console.log('- testAnalyzeAndSave()');
    console.log('- testGetAnalyses()');
    console.log('- testExport()');
}

// Auto-run jika dijalankan langsung
if (typeof require !== 'undefined' && require.main === module) {
    runTests();
}