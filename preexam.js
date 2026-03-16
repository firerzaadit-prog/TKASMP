// preexam.js - Pre-Exam Page Logic
import { supabase } from './supabaseClient.js';
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
async function checkExamEligibility(userId) {
    try {
        const { data, error } = await supabase
            .from('exam_sessions')
            .select('id, total_score, created_at, status')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            // User has already taken the exam
            const lastScore = data[0].total_score;
            const examDate = new Date(data[0].created_at).toLocaleDateString('id-ID');

            document.body.innerHTML = `
                <div style="
                    display: flex; 
                    flex-direction: column;
                    justify-content: center; 
                    align-items: center; 
                    height: 100vh; 
                    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                    color: white;
                    font-family: 'Poppins', sans-serif;
                    text-align: center;
                    padding: 20px;
                ">
                    <i class="fas fa-check-circle" style="font-size: 5rem; color: #10b981; margin-bottom: 20px;"></i>
                    <h1 style="font-size: 2rem; margin-bottom: 10px;">Ujian Telah Selesai</h1>
                    <p style="font-size: 1.1rem; color: #9ca3af; max-width: 500px; line-height: 1.6;">
                        Anda sudah menyelesaikan ujian ini sebelumnya.<br>
                        Kesempatan mengerjakan hanya diberikan 1 kali.
                    </p>
                    
                    <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 15px; border: 1px solid rgba(255,255,255,0.1); min-width: 250px;">
                        <p style="margin:0; font-size: 0.9rem; color: #9ca3af;">Nilai Anda</p>
                        <p style="margin:5px 0 15px 0; font-size: 2.5rem; font-weight: 700; color: #f59e0b;">${lastScore}</p>
                        <div style="height: 1px; background: rgba(255,255,255,0.1); margin-bottom: 15px;"></div>
                        <p style="margin:0; font-size: 0.8rem; color: #6b7280;">Tanggal: ${examDate}</p>
                    </div>

                    <div style="margin-top: 40px;">
                        <a href="halamanpertama.html" style="
                            padding: 15px 40px;
                            background: #4f46e5;
                            color: white;
                            text-decoration: none;
                            border-radius: 50px;
                            font-weight: 600;
                            font-size: 1rem;
                            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);
                            transition: transform 0.2s;
                            display: inline-block;
                        ">
                            <i class="fas fa-home"></i> Kembali ke Menu Utama
                        </a>
                    </div>
                </div>
            `;
            return false;
        }

        return true;

    } catch (error) {
        console.error('Error checking eligibility:', error);
        return false;
    }
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

            // Calculate time limit (average time per question * question count)
            const avgTimePerQuestion = questionsData.reduce((sum, q) => sum + (q.time_limit_minutes || 30), 0) / questionsData.length;
            const totalTime = Math.round(avgTimePerQuestion * avgCount / 30); // Assuming 30 questions
            
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
