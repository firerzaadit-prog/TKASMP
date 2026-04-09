// preexam.js - Pre-Exam Page Logic
import { supabase } from './clientSupabase.js';
import { getCurrentUser } from './auth.js';

// DOM Elements
const agreementCheckbox = document.getElementById('agreementCheckbox');
const startExamBtn = document.getElementById('startExamBtn');
const questionCountEl = document.getElementById('questionCount');
const timeLimitEl = document.getElementById('timeLimit');

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if user is logged in
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            window.location.href = 'index.html';
            return;
        }

        console.log('User authenticated:', result.user.email);

        // Check if user has already taken the exam
        await checkExamEligibility(result.user.id);

        // Load exam info
        await loadExamInfo();

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Error initializing pre-exam page:', error);
        alert('Terjadi kesalahan. Silakan coba lagi.');
        window.location.href = 'halamanpertama.html';
    }
});

// Check if user is eligible to take the exam
// Semua siswa boleh mengerjakan ujian berkali-kali
async function checkExamEligibility(userId) {
    return true;
}


// Load exam information from database
async function loadExamInfo() {
    try {
        // Get active questions count
        const { data: questionsData, error: questionsError } = await supabase
            .from('questions')
            .select('id, time_limit_minutes, question_type_variant')
            .eq('subject', 'Matematika')
            .eq('is_active', true);

        if (questionsError) throw questionsError;

        if (questionsData && questionsData.length > 0) {
            // Count unique question type variants
            const variants = [...new Set(questionsData.map(q => q.question_type_variant))];
            
            // Calculate average questions per variant
            const questionsPerVariant = {};
            questionsData.forEach(q => {
                const variant = q.question_type_variant || 'A';
                questionsPerVariant[variant] = (questionsPerVariant[variant] || 0) + 1;
            });

            // Use the first variant's count as estimate (each variant should have same count)
            const avgCount = Math.round(questionsData.length / variants.length) || questionsData.length;
            
            // Update question count display
            questionCountEl.textContent = `${avgCount} Soal`;

            // ✅ PERBAIKAN: Logika waktu sebelumnya salah (hasil selalu kecil karena dibagi 30 lagi).
            // time_limit_minutes di DB adalah total waktu ujian (misal 60).
            // Jika nilainya sangat kecil (<= 5), asumsikan itu waktu per soal lalu kalikan jumlah soal.
            const firstTimeLimit = questionsData[0]?.time_limit_minutes;
            let totalTime;
            if (firstTimeLimit && firstTimeLimit > 5) {
                // Sudah merupakan total waktu ujian — pakai langsung
                totalTime = firstTimeLimit;
            } else if (firstTimeLimit && firstTimeLimit <= 5) {
                // Waktu per soal — kalikan dengan jumlah soal
                totalTime = Math.round(firstTimeLimit * avgCount);
            } else {
                // Default 60 menit jika kolom time_limit_minutes kosong
                totalTime = 60;
            }

            timeLimitEl.textContent = `${totalTime} Menit`;
        } else {
            // Default values if no questions
            questionCountEl.textContent = '30 Soal';
            timeLimitEl.textContent = '30 Menit';
        }

    } catch (error) {
        console.error('Error loading exam info:', error);
        // Use default values on error
        questionCountEl.textContent = '30 Soal';
        timeLimitEl.textContent = '30 Menit';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Agreement checkbox
    agreementCheckbox.addEventListener('change', () => {
        startExamBtn.disabled = !agreementCheckbox.checked;
        
        if (agreementCheckbox.checked) {
            startExamBtn.style.animation = 'pulse 0.5s ease';
        }
    });

    // Start exam button
    startExamBtn.addEventListener('click', () => {
        if (agreementCheckbox.checked) {
            startExam();
        }
    });
}

// Start the exam
function startExam() {
    // Show confirmation
    const confirmed = confirm('Apakah Anda yakin siap untuk memulai ujian?\n\nSetelah memulai, Anda tidak dapat kembali ke halaman ini.');
    
    if (confirmed) {
        // Redirect to exam page
        window.location.href = 'ujian.html';
    }
}

// Add pulse animation
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);
