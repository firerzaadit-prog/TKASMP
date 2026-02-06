// halamanpertama.js - Dashboard functionality
import { getCurrentUser, logout } from './auth.js';
import { supabase } from './clientSupabase.js';

// Check if user is logged in and display info
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const result = await getCurrentUser();

        if (!result.success || !result.user) {
            alert('Anda belum login. Mengarahkan ke halaman login...');
            window.location.href = 'index.html';
            return;
        }

        // Get user profile data from Supabase - prioritize database data
        let profileData = null;
        try {
            // Try to get existing profile
            const { data, error } = await supabase
                .from('profiles')
                .select('nama_lengkap, email, avatar_url')
                .eq('id', result.user.id)
                .single();

            if (error && error.code === 'PGRST116') {
                // Profile doesn't exist, create it with available data
                console.log('Creating new user profile...');
                const userName = result.user.user_metadata?.full_name ||
                                result.user.user_metadata?.name ||
                                (result.user.email ? result.user.email.split('@')[0] : null) ||
                                'Siswa';

                const { data: newProfile, error: createError } = await supabase
                    .from('profiles')
                    .insert({
                        id: result.user.id,
                        nama_lengkap: userName,
                        email: result.user.email
                    })
                    .select('nama_lengkap, email, avatar_url')
                    .single();

                if (createError) {
                    console.error('Error creating profile:', createError);
                    // Continue with auth data only
                } else {
                    profileData = newProfile;
                    console.log('Profile created successfully:', profileData);
                }
            } else if (error) {
                console.error('Error fetching profile:', error);
                // Continue with auth data only
            } else {
                profileData = data;
                console.log('Profile loaded from database:', profileData);

                // If profile exists but nama_lengkap is empty, try to update it
                if (!profileData.nama_lengkap || profileData.nama_lengkap.trim() === '') {
                    console.log('Profile exists but nama_lengkap is empty, trying to update...');
                    const userName = result.user.user_metadata?.full_name ||
                                    result.user.user_metadata?.name ||
                                    (result.user.email ? result.user.email.split('@')[0] : null) ||
                                    'Siswa';

                    if (userName && userName !== 'Siswa') {
                        const { error: updateError } = await supabase
                            .from('profiles')
                            .update({ nama_lengkap: userName })
                            .eq('id', result.user.id);

                        if (!updateError) {
                            profileData.nama_lengkap = userName;
                            console.log('Profile nama_lengkap updated:', userName);
                        } else {
                            console.error('Failed to update nama_lengkap:', updateError);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Profile operation error:', err);
            // Continue with auth data only
        }

        // Determine display name - prioritize database profile data
        const displayName = profileData?.nama_lengkap ||
                           result.user.user_metadata?.full_name ||
                           result.user.user_metadata?.name ||
                           (result.user.email ? result.user.email.split('@')[0] : null) ||
                           'Siswa';

        // Determine display email with proper fallback
        const displayEmail = profileData?.email ||
                           result.user.email ||
                           'siswa@sch.id';

        console.log('User data for display:', {
            displayName,
            displayEmail,
            authUser: result.user,
            profileData,
            userMetadata: result.user?.user_metadata,
            authEmail: result.user?.email
        });

        // Update header profile section
        const profileName = document.querySelector('.profile-name');
        if (profileName) {
            profileName.textContent = displayName;
            console.log('Updated header profile name:', displayName);
        } else {
            console.error('Header profile name element not found');
        }

        // Update header profile avatar
        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar) {
            if (profileData?.avatar_url) {
                profileAvatar.src = profileData.avatar_url;
            } else {
                const firstLetter = displayName.charAt(0).toUpperCase();
                profileAvatar.src = `data:image/svg+xml;base64,${btoa(`<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" fill="#4F46E5"/><text x="20" y="25" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
            }
            profileAvatar.alt = `Avatar ${displayName}`;
            console.log('Updated header profile avatar');
        } else {
            console.error('Header profile avatar element not found');
        }

        // Update welcome message with user name
        const heroTitle = document.querySelector('.hero-section h1');
        if (heroTitle) {
            heroTitle.innerHTML = `<i class="fas fa-graduation-cap"></i> Selamat Datang, ${displayName}!`;
            console.log('Updated hero title with name:', displayName);
        } else {
            console.error('Hero title element not found');
        }

        // Update main profile card section (commented out as elements don't exist in halamanpertama.html)
        /*
        const profileLargeAvatar = document.querySelector('.profile-large-avatar');
        const profileCardName = document.querySelector('.profile-info h4');
        const profileCardEmail = document.querySelector('.profile-info p');

        if (profileLargeAvatar) {
            if (profileData?.avatar_url) {
                profileLargeAvatar.src = profileData.avatar_url;
            } else {
                const firstLetter = displayName.charAt(0).toUpperCase();
                profileLargeAvatar.src = `data:image/svg+xml;base64,${btoa(`<svg width="80" height="80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" fill="#4F46E5"/><text x="40" y="50" font-family="Arial" font-size="32" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
            }
            profileLargeAvatar.alt = `Avatar ${displayName}`;
            console.log('Updated main profile avatar');
        } else {
            console.error('Main profile avatar element not found');
        }

        if (profileCardName) {
            profileCardName.textContent = displayName;
            console.log('Updated main profile card name:', displayName);
        } else {
            console.error('Main profile card name element not found');
        }

        if (profileCardEmail) {
            profileCardEmail.textContent = displayEmail;
            console.log('Updated main profile card email:', displayEmail);
        } else {
            console.error('Main profile card email element not found');
        }
        */

        // Load user analytics/progress data
        await loadUserAnalytics(result.user.id);

        // Load recent activities
        await loadRecentActivities();

        console.log('User info displayed successfully:', {
            user: result.user,
            profile: profileData,
            displayName,
            displayEmail
        });

    } catch (error) {
        console.error('Error loading user info:', error);
        alert('Terjadi kesalahan saat memuat data pengguna.');
        window.location.href = 'index.html';
    }
});

// Logout function for global access
async function performLogout() {
    if (confirm('Apakah Anda ingin logout?')) {
        try {
            await logout();
            alert('Logout berhasil!');
            window.location.href = 'index.html';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Logout gagal: ' + error.message);
        }
    }
}

// Handle logout functionality
document.addEventListener('click', async (e) => {
    // Check if clicked on profile dropdown icon or logout button
    if (e.target.closest('.profile-dropdown-icon') || e.target.classList.contains('profile-dropdown-icon') ||
        e.target.closest('.logout') || e.target.classList.contains('logout')) {
        e.preventDefault();
        await performLogout();
    }
});

// Show recent activities function
function showRecentActivities() {
    // Scroll to activities section and highlight it
    const activitiesSection = document.querySelector('.activities-section');
    if (activitiesSection) {
        activitiesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add temporary highlight effect
        activitiesSection.style.transition = 'all 0.3s ease';
        activitiesSection.style.boxShadow = '0 0 20px rgba(79, 70, 229, 0.3)';
        activitiesSection.style.transform = 'scale(1.02)';

        // Remove highlight after 2 seconds
        setTimeout(() => {
            activitiesSection.style.boxShadow = '';
            activitiesSection.style.transform = '';
        }, 2000);
    }
}

// Load recent activities for dashboard
async function loadRecentActivities() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            console.warn('Cannot load activities: user not authenticated');
            return;
        }

        const userId = result.user.id;

        // Load multiple types of activities concurrently
        console.log('Loading exam_answers for user:', userId);
        const [examSessionsResult, examAnswersResult, materialViewsResult, materialProgressResult, profileResult, analyticsResult] = await Promise.allSettled([
            // Load recent exam sessions
            supabase
                .from('exam_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(3),

            // Load recent exam answers
            supabase
                .from('exam_answers')
                .select('*')
                .limit(5),

            // Load recent material views
            supabase
                .from('material_views')
                .select(`
                    *,
                    materials (
                        title,
                        chapter,
                        material_type
                    )
                `)
                .eq('user_id', userId)
                .order('viewed_at', { ascending: false })
                .limit(3),

            // Load recent material progress (fallback)
            supabase
                .from('material_progress')
                .select(`
                    *,
                    materials (
                        title,
                        chapter,
                        material_type
                    )
                `)
                .eq('user_id', userId)
                .eq('is_read', true)
                .order('read_at', { ascending: false })
                .limit(3),

            // Load profile updates
            supabase
                .from('profiles')
                .select('updated_at, nama_lengkap')
                .eq('id', userId)
                .single(),

            // Load recent analytics updates
            supabase
                .from('student_analytics')
                .select('*')
                .eq('user_id', userId)
                .order('last_updated', { ascending: false })
                .limit(2)
        ]);

        console.log('Query results:', {
            examSessionsResult: {
                status: examSessionsResult.status,
                data: examSessionsResult.value?.data,
                error: examSessionsResult.value?.error
            },
            examAnswersResult: {
                status: examAnswersResult.status,
                data: examAnswersResult.value?.data,
                error: examAnswersResult.value?.error,
                errorDetails: examAnswersResult.value?.error ? {
                    message: examAnswersResult.value.error.message,
                    details: examAnswersResult.value.error.details,
                    hint: examAnswersResult.value.error.hint,
                    code: examAnswersResult.value.error.code
                } : null
            },
            materialViewsResult: {
                status: materialViewsResult.status,
                data: materialViewsResult.value?.data,
                error: materialViewsResult.value?.error
            },
            materialProgressResult: {
                status: materialProgressResult.status,
                data: materialProgressResult.value?.data,
                error: materialProgressResult.value?.error
            },
            profileResult: {
                status: profileResult.status,
                data: profileResult.value?.data,
                error: profileResult.value?.error
            },
            analyticsResult: {
                status: analyticsResult.status,
                data: analyticsResult.value?.data,
                error: analyticsResult.value?.error
            }
        });

        // Combine and format activities
        const activities = [];

        // Add exam session activities
        if (examSessionsResult.status === 'fulfilled' && examSessionsResult.value.data) {
            examSessionsResult.value.data.forEach(session => {
                let activityType = 'exam';
                let icon = 'fas fa-brain';
                let title = 'Mengerjakan ujian';
                let description = `Status: ${session.status === 'completed' ? 'Selesai' : session.status}`;

                if (session.status === 'completed' && session.total_score !== null) {
                    description += ` • Skor: ${session.total_score}`;
                }

                const timeAgo = getTimeAgo(session.created_at);

                activities.push({
                    icon,
                    title,
                    description: `${description} • ${timeAgo}`,
                    type: activityType,
                    timestamp: new Date(session.created_at)
                });
            });
        }

        // Add recent question activities
        if (examAnswersResult.status === 'fulfilled' && examAnswersResult.value.data) {
            examAnswersResult.value.data.slice(0, 2).forEach(answer => { // Limit to 2 most recent
                const icon = answer.is_correct ? 'fas fa-check-circle' : 'fas fa-times-circle';
                const title = answer.is_correct ? 'Jawaban benar' : 'Jawaban salah';
                const description = `Soal ID: ${answer.question_id}`;
                const timeAgo = getTimeAgo(answer.created_at);

                activities.push({
                    icon,
                    title,
                    description: `${description} • ${timeAgo}`,
                    type: 'question',
                    timestamp: new Date(answer.created_at)
                });
            });
        }

        // Add material viewing activities (prefer material_views, fallback to material_progress)
        let materialActivities = [];

        if (materialViewsResult.status === 'fulfilled' && materialViewsResult.value.data && materialViewsResult.value.data.length > 0) {
            // Use material_views if available
            materialViewsResult.value.data.forEach(view => {
                const material = view.materials;
                if (material) {
                    const icon = 'fas fa-eye';
                    const title = 'Melihat materi';
                    const description = `${material.title} • ${material.chapter || 'N/A'}`;
                    const timeAgo = getTimeAgo(view.viewed_at);

                    materialActivities.push({
                        icon,
                        title,
                        description: `${description} • ${timeAgo}`,
                        type: 'material',
                        timestamp: new Date(view.viewed_at)
                    });
                }
            });
        } else if (materialProgressResult.status === 'fulfilled' && materialProgressResult.value.data) {
            // Fallback to material_progress
            materialProgressResult.value.data.forEach(progress => {
                const material = progress.materials;
                if (material) {
                    const icon = 'fas fa-book-open';
                    const title = 'Membaca materi';
                    const description = `${material.title} • ${material.chapter || 'N/A'}`;
                    const timeAgo = getTimeAgo(progress.read_at);

                    materialActivities.push({
                        icon,
                        title,
                        description: `${description} • ${timeAgo}`,
                        type: 'material',
                        timestamp: new Date(progress.read_at)
                    });
                }
            });
        }

        activities.push(...materialActivities);

        // Add profile update activity
        if (profileResult.status === 'fulfilled' && profileResult.value.data) {
            const profile = profileResult.value.data;
            if (profile.updated_at) {
                const icon = 'fas fa-user-edit';
                const title = 'Memperbarui profil';
                const description = `Profil ${profile.nama_lengkap || 'pengguna'} telah diperbarui`;
                const timeAgo = getTimeAgo(profile.updated_at);

                activities.push({
                    icon,
                    title,
                    description: `${description} • ${timeAgo}`,
                    type: 'profile',
                    timestamp: new Date(profile.updated_at)
                });
            }
        }

        // Add analytics milestone activities
        if (analyticsResult.status === 'fulfilled' && analyticsResult.value.data) {
            analyticsResult.value.data.forEach(analytic => {
                if (analytic.mastery_level >= 0.8) { // High mastery level
                    const icon = 'fas fa-trophy';
                    const title = 'Pencapaian baru';
                    const description = `Tingkat penguasaan ${Math.round(analytic.mastery_level * 100)}% di ${analytic.chapter}`;
                    const timeAgo = getTimeAgo(analytic.last_updated);

                    activities.push({
                        icon,
                        title,
                        description: `${description} • ${timeAgo}`,
                        type: 'achievement',
                        timestamp: new Date(analytic.last_updated)
                    });
                }
            });
        }

        // Sort activities by timestamp (most recent first)
        activities.sort((a, b) => b.timestamp - a.timestamp);

        // Limit to 5 most recent activities
        const recentActivities = activities.slice(0, 5);

        // If no activities, show helpful message
        if (recentActivities.length === 0) {
            const defaultActivities = [
                {
                    icon: 'fas fa-rocket',
                    title: 'Mulai perjalanan belajar Anda!',
                    description: 'Baca materi, kerjakan soal, atau ikuti ujian untuk melihat aktivitas di sini',
                    type: 'info'
                },
                {
                    icon: 'fas fa-book-open',
                    title: 'Jelajahi Materi Pembelajaran',
                    description: 'Akses berbagai materi interaktif di halaman Materi',
                    type: 'suggestion'
                },
                {
                    icon: 'fas fa-brain',
                    title: 'Latihan Soal TKA',
                    description: 'Uji pemahaman Anda dengan simulasi ujian',
                    type: 'suggestion'
                }
            ];
            updateActivitiesDisplay(defaultActivities);
            return;
        }

        // Update the activities display
        updateActivitiesDisplay(recentActivities);

    } catch (error) {
        console.error('Error loading recent activities:', error);
        // Show error state
        const errorActivities = [
            {
                icon: 'fas fa-exclamation-triangle',
                title: 'Gagal memuat aktivitas',
                description: 'Terjadi kesalahan saat memuat data aktivitas',
                type: 'error'
            }
        ];
        updateActivitiesDisplay(errorActivities);
    }
}

// Update activities display in the dashboard
function updateActivitiesDisplay(activities) {
    const activitiesList = document.querySelector('.activities-list');
    if (!activitiesList) {
        console.warn('Activities list element not found');
        return;
    }

    const activitiesHtml = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="${activity.icon}"></i>
            </div>
            <div class="activity-content">
                <h4>${activity.title}</h4>
                <p>${activity.description}</p>
            </div>
        </div>
    `).join('');

    activitiesList.innerHTML = activitiesHtml;
}

// Helper function to get time ago string
function getTimeAgo(dateString) {
    const now = new Date();
    const activityDate = new Date(dateString);
    const diffMs = now - activityDate;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) {
        return 'Baru saja';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} menit lalu`;
    } else if (diffHours < 24) {
        return `${diffHours} jam lalu`;
    } else if (diffDays < 7) {
        return `${diffDays} hari lalu`;
    } else {
        return activityDate.toLocaleDateString('id-ID');
    }
}

// Start exam function
function startExam() {
    if (confirm('Apakah Anda yakin ingin memulai ujian TKA Matematika? Pastikan koneksi internet stabil dan waktu cukup.')) {
        window.location.href = 'ujian.html';
    }
}

// Load user analytics and update dashboard
async function loadUserAnalytics(userId) {
    try {
        // Load user analytics data
        const { data: analytics, error } = await supabase
            .from('student_analytics')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error loading analytics:', error);
            return;
        }

        // Calculate totals
        const totalMaterials = analytics.length;
        const avgScore = analytics.length > 0
            ? Math.round(analytics.reduce((sum, a) => sum + (a.mastery_level || 0), 0) / analytics.length * 100)
            : 0;
        const totalHours = analytics.length > 0
            ? Math.round(analytics.reduce((sum, a) => sum + (a.average_time_seconds || 0), 0) / analytics.length / 3600)
            : 0;

        // Update achievement numbers
        updateAchievementNumbers(totalMaterials, avgScore, totalHours);

        console.log('Analytics loaded:', { analytics, totalMaterials, avgScore, totalHours });

    } catch (error) {
        console.error('Error in loadUserAnalytics:', error);
        // Continue with default values
    }
}

// Update achievement numbers on dashboard
function updateAchievementNumbers(materialsCompleted, avgScore, studyHours) {
    // Update materials completed
    const materialsElement = document.querySelector('.achievement-card:nth-child(1) .achievement-number');
    if (materialsElement) {
        materialsElement.textContent = materialsCompleted;
    }

    // Update average score
    const scoreElement = document.querySelector('.achievement-card:nth-child(2) .achievement-number');
    if (scoreElement) {
        scoreElement.textContent = `${avgScore}%`;
    }

    // Update study hours
    const hoursElement = document.querySelector('.achievement-card:nth-child(3) .achievement-number');
    if (hoursElement) {
        hoursElement.textContent = studyHours;
    }
}

// Progress Modal Functionality
let subjectProgressChart = null;
let performanceTrendChart = null;

// Show progress modal
function showProgressModal() {
    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.classList.add('show');
        loadDetailedProgress();
    }
}

// Hide progress modal
function hideProgressModal() {
    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.classList.remove('show');
        // Destroy charts to prevent memory leaks
        if (subjectProgressChart) {
            subjectProgressChart.destroy();
            subjectProgressChart = null;
        }
        if (performanceTrendChart) {
            performanceTrendChart.destroy();
            performanceTrendChart = null;
        }
    }
}

// Load detailed progress data
async function loadDetailedProgress() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            return;
        }

        const userId = result.user.id;

        // Load analytics data
        const { data: analytics, error } = await supabase
            .from('student_analytics')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error loading detailed analytics:', error);
            return;
        }

        // Load exam attempts for additional data
        const { data: examAttempts, error: attemptsError } = await supabase
            .from('exam_answers')
            .select(`
                *,
                questions (
                    question_text
                )
            `)
            .eq('user_id', userId);

        // Calculate comprehensive stats
        const stats = calculateProgressStats(analytics, examAttempts);

        // Update overview stats
        updateProgressOverview(stats);

        // Create charts
        createSubjectProgressChart(stats.subjectData);
        createPerformanceTrendChart(stats.trendData);

        // Populate detailed breakdown
        populateSubjectBreakdown(stats.subjectData);

        // Generate recommendations
        generateRecommendations(stats);


    } catch (error) {
        console.error('Error in loadDetailedProgress:', error);
        alert('Terjadi kesalahan saat memuat data progress.');
    }
}

// Calculate comprehensive progress statistics
function calculateProgressStats(analytics, examAttempts) {
    const stats = {
        totalMaterials: 0,
        totalQuestions: 0,
        averageScore: 0,
        totalStudyTime: 0,
        subjectData: {},
        trendData: []
    };

    // Process analytics data
    if (analytics && analytics.length > 0) {
        stats.totalMaterials = analytics.length;
        let totalScore = 0;
        let totalTime = 0;

        analytics.forEach(item => {
            totalScore += item.mastery_level || 0;
            totalTime += (item.average_time_seconds || 0) / 3600; // Convert to hours

            // Group by subject
            const subject = item.chapter;
            if (!stats.subjectData[subject]) {
                stats.subjectData[subject] = {
                    materials: 0,
                    questions: item.total_questions_attempted || 0,
                    correct: item.correct_answers || 0,
                    score: item.mastery_level || 0,
                    time: (item.average_time_seconds || 0) / 3600
                };
            }
            stats.subjectData[subject].materials += 1;
            stats.subjectData[subject].questions += item.total_questions_attempted || 0;
            stats.subjectData[subject].correct += item.correct_answers || 0;
        });

        stats.averageScore = Math.round((totalScore / analytics.length) * 100);
        stats.totalStudyTime = Math.round(totalTime);
    }

    // Process exam attempts
    if (examAttempts && examAttempts.length > 0) {
        stats.totalQuestions = examAttempts.length;
        const correctAnswers = examAttempts.filter(a => a.is_correct).length;
        if (stats.totalQuestions > 0) {
            stats.averageScore = Math.round((correctAnswers / stats.totalQuestions) * 100);
        }
    }


    // Mock trend data (last 7 days)
    stats.trendData = Array.from({ length: 7 }, (_, i) => ({
        day: `Day ${i + 1}`,
        score: Math.floor(Math.random() * 40) + 60, // 60-100 range
        questions: Math.floor(Math.random() * 10) + 5
    }));

    return stats;
}

// Update progress overview stats
function updateProgressOverview(stats) {
    document.getElementById('totalMaterialsCompleted').textContent = stats.totalMaterials;
    document.getElementById('totalQuestionsAnswered').textContent = stats.totalQuestions;
    document.getElementById('averageScore').textContent = `${stats.averageScore}%`;
    document.getElementById('totalStudyTime').textContent = `${stats.totalStudyTime}j`;
}

// Create subject progress chart
function createSubjectProgressChart(subjectData) {
    const ctx = document.getElementById('subjectProgressChart');
    if (!ctx) return;

    const subjects = Object.keys(subjectData);
    const scores = subjects.map(subject => subjectData[subject].score);

    if (subjectProgressChart) {
        subjectProgressChart.destroy();
    }

    subjectProgressChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: subjects,
            datasets: [{
                data: scores,
                backgroundColor: [
                    '#4F46E5', // Primary
                    '#7C3AED', // Secondary
                    '#10b981', // Success
                    '#F59E0B'  // Accent
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.parsed}%`;
                        }
                    }
                }
            }
        }
    });
}

// Create performance trend chart
function createPerformanceTrendChart(trendData) {
    const ctx = document.getElementById('performanceTrendChart');
    if (!ctx) return;

    if (performanceTrendChart) {
        performanceTrendChart.destroy();
    }

    performanceTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(d => d.day),
            datasets: [{
                label: 'Nilai Rata-rata (%)',
                data: trendData.map(d => d.score),
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#4F46E5',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Populate subject breakdown
function populateSubjectBreakdown(subjectData) {
    const container = document.getElementById('subjectBreakdown');
    if (!container) return;

    container.innerHTML = '';

    Object.entries(subjectData).forEach(([subject, data]) => {
        const accuracy = data.questions > 0 ? Math.round((data.correct / data.questions) * 100) : 0;

        const subjectItem = document.createElement('div');
        subjectItem.className = 'subject-item';
        subjectItem.innerHTML = `
            <div class="subject-info">
                <div class="subject-icon">
                    <i class="fas fa-book"></i>
                </div>
                <div class="subject-details">
                    <h4>${subject}</h4>
                    <p>${data.materials} materi • ${data.questions} soal</p>
                </div>
            </div>
            <div class="subject-stats">
                <span class="subject-score">${accuracy}%</span>
                <span class="subject-progress">${data.correct}/${data.questions} benar</span>
            </div>
        `;

        container.appendChild(subjectItem);
    });
}

// Generate personalized recommendations
function generateRecommendations(stats) {
    const container = document.getElementById('recommendations');
    if (!container) return;

    const recommendations = [];

    // Analyze performance and generate recommendations
    Object.entries(stats.subjectData).forEach(([subject, data]) => {
        const accuracy = data.questions > 0 ? (data.correct / data.questions) * 100 : 0;

        if (accuracy < 60) {
            recommendations.push({
                icon: 'fas fa-exclamation-triangle',
                title: `Perlu Perhatian: ${subject}`,
                description: `Nilai di ${subject} masih rendah (${accuracy}%). Fokus pada pemahaman konsep dasar dan latihan soal lebih banyak.`
            });
        } else if (accuracy >= 80) {
            recommendations.push({
                icon: 'fas fa-star',
                title: `Bagus! ${subject}`,
                description: `Performa Anda di ${subject} sangat baik. Lanjutkan dengan materi yang lebih advanced.`
            });
        }
    });

    // Add general recommendations
    if (stats.totalQuestions < 50) {
        recommendations.push({
            icon: 'fas fa-brain',
            title: 'Tingkatkan Volume Latihan',
            description: 'Anda perlu mengerjakan lebih banyak soal untuk meningkatkan kemampuan. Target: 10 soal per hari.'
        });
    }

    if (stats.averageScore < 70) {
        recommendations.push({
            icon: 'fas fa-chart-line',
            title: 'Fokus pada Akurasi',
            description: 'Prioritaskan pemahaman konsep daripada kecepatan. Akurasi yang baik akan meningkatkan nilai secara keseluruhan.'
        });
    }

    // Display recommendations
    container.innerHTML = recommendations.map(rec => `
        <div class="recommendation-item">
            <div class="recommendation-icon">
                <i class="${rec.icon}"></i>
            </div>
            <div class="recommendation-content">
                <h4>${rec.title}</h4>
                <p>${rec.description}</p>
            </div>
        </div>
    `).join('');
}


// Event listeners for progress modal
document.addEventListener('DOMContentLoaded', () => {
    // Progress modal triggers
    const progressButtons = document.querySelectorAll('[onclick*="progress"]');
    progressButtons.forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            showProgressModal();
        };
    });

    // Modal close functionality
    const modal = document.getElementById('progressModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) {
                hideProgressModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                hideProgressModal();
            }
        });
    }
});

// Profile Modal Functionality
let currentProfileData = null;

// Show profile modal
function showProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.add('show');
        loadProfileData();
    }
}

// Hide profile modal
function hideProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Load profile data
async function loadProfileData() {
    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Anda harus login terlebih dahulu!');
            return;
        }

        const userId = result.user.id;
        console.log('Loading profile for user:', userId);

        // First check if profiles table exists and get table info
        await checkProfilesTable();

        // Load profile data
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, nama_lengkap, email, phone, school, bio, avatar_url, created_at, updated_at')
            .eq('id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error loading profile:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
            alert('Gagal memuat data profil: ' + error.message);
            return;
        }

        console.log('Profile data loaded:', profile);
        currentProfileData = profile || {};

        // Populate form fields with database data first
        populateProfileForm(result.user, currentProfileData);

        // Load account statistics
        await loadAccountStatistics(userId);

        // Load settings
        loadUserSettings();

    } catch (error) {
        console.error('Error in loadProfileData:', error);
        alert('Terjadi kesalahan saat memuat data profil.');
    }
}

// Check if profiles table exists and has correct structure
async function checkProfilesTable() {
    try {
        console.log('Checking profiles table structure...');

        // Try to get a count to see if table exists
        const { count, error } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error('Profiles table check failed:', error);
            alert('Tabel profiles tidak ditemukan atau tidak dapat diakses. Silakan jalankan setup_profiles.sql di Supabase SQL Editor.');
            return false;
        }

        console.log('Profiles table exists, count:', count);

        // Try to get column info by attempting to select all columns
        const { data: testData, error: testError } = await supabase
            .from('profiles')
            .select('id, nama_lengkap, email, phone, school, bio, avatar_url')
            .limit(1);

        if (testError) {
            console.warn('Some columns may not exist:', testError);
            console.log('Please run the updated setup_profiles.sql to add missing columns');
        } else {
            console.log('All required columns exist');
        }

        return true;
    } catch (error) {
        console.error('Error checking profiles table:', error);
        return false;
    }
}

// Populate profile form
function populateProfileForm(user, profile) {
    // Basic info
    document.getElementById('profileFullName').value = profile.nama_lengkap || user.user_metadata?.full_name || user.user_metadata?.name || '';
    document.getElementById('profileEmail').value = profile.email || user.email || '';

    // Additional info
    document.getElementById('profilePhone').value = profile.phone || '';
    document.getElementById('profileSchool').value = profile.school || '';
    document.getElementById('profileBio').value = profile.bio || '';

    // Profile image
    const avatarUrl = profile.avatar_url || user.user_metadata?.avatar_url;
    const profileImage = document.getElementById('currentProfileImage');
    if (avatarUrl) {
        profileImage.src = avatarUrl;
    } else {
        // Generate avatar from name
        const displayName = profile.nama_lengkap || user.user_metadata?.full_name || user.email?.split('@')[0] || 'U';
        const firstLetter = displayName.charAt(0).toUpperCase();
        profileImage.src = `data:image/svg+xml;base64,${btoa(`<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#4F46E5"/><text x="60" y="75" font-family="Arial" font-size="48" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
    }
}

// Load account statistics
async function loadAccountStatistics(userId) {
    try {
        // Get user creation date
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser.user) {
            const joinDate = new Date(authUser.user.created_at).toLocaleDateString('id-ID');
            document.getElementById('joinDate').textContent = joinDate;
        }

        // Load analytics data
        const { data: analytics, error: analyticsError } = await supabase
            .from('student_analytics')
            .select('*')
            .eq('user_id', userId);

        if (!analyticsError && analytics) {
            const totalMaterials = analytics.length;
            const totalTime = analytics.reduce((sum, a) => sum + (a.average_time_seconds || 0), 0) / 3600;
            const avgScore = analytics.length > 0
                ? Math.round(analytics.reduce((sum, a) => sum + (a.mastery_level || 0), 0) / analytics.length * 100)
                : 0;

            document.getElementById('totalStudyTimeStat').textContent = `${Math.round(totalTime)} jam`;
            document.getElementById('materialsCompletedStat').textContent = totalMaterials;
            document.getElementById('averageScoreStat').textContent = `${avgScore}%`;
        }

        // Load exam attempts
        const { data: exams, error: examsError } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('user_id', userId);

        if (!examsError && exams) {
            document.getElementById('examsTakenStat').textContent = exams.length;
        }

    } catch (error) {
        console.error('Error loading account statistics:', error);
    }
}

// Load user settings
function loadUserSettings() {
    // Load settings from localStorage
    const emailNotifications = localStorage.getItem('emailNotifications') !== 'false'; // Default true
    const darkMode = localStorage.getItem('darkMode') === 'true'; // Default false

    document.getElementById('emailNotifications').checked = emailNotifications;
    document.getElementById('darkMode').checked = darkMode;
}

// Save profile data
async function saveProfile(event) {
    event.preventDefault();

    console.log('Starting profile save...');

    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Sesi login telah berakhir. Silakan login kembali.');
            return;
        }

        const userId = result.user.id;
        console.log('User ID:', userId);

        const formData = {
            nama_lengkap: document.getElementById('profileFullName').value.trim(),
            phone: document.getElementById('profilePhone').value.trim(),
            school: document.getElementById('profileSchool').value.trim(),
            bio: document.getElementById('profileBio').value.trim(),
            updated_at: new Date().toISOString()
        };

        console.log('Form data to save:', formData);

        // First try to update existing profile
        let { data, error } = await supabase
            .from('profiles')
            .update(formData)
            .eq('id', userId)
            .select();

        // If no rows were updated (profile doesn't exist), try to insert
        if (error || !data || data.length === 0) {
            console.log('Profile not found, trying to insert new profile...');
            const insertData = {
                id: userId,
                nama_lengkap: formData.nama_lengkap,
                email: result.user.email, // Always use auth email
                phone: formData.phone,
                school: formData.school,
                bio: formData.bio,
                avatar_url: currentProfileData?.avatar_url || null
            };

            const insertResult = await supabase
                .from('profiles')
                .insert([insertData])
                .select();

            data = insertResult.data;
            error = insertResult.error;
        }

        if (error) {
            console.error('Supabase error saving profile:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });

            // Provide helpful error messages
            let errorMessage = 'Gagal menyimpan profil: ' + error.message;
            if (error.code === '42P01') {
                errorMessage += '\n\nTabel profiles tidak ditemukan. Jalankan setup_profiles.sql di Supabase SQL Editor.';
            } else if (error.code === '42501') {
                errorMessage += '\n\nTidak memiliki izin untuk menyimpan data. Periksa RLS policies.';
            }

            alert(errorMessage);
            return;
        }

        console.log('Profile saved successfully:', data);

        // Save settings
        saveUserSettings();

        alert('Profil berhasil diperbarui!');
        hideProfileModal();

        // Refresh dashboard profile display
        location.reload();

    } catch (error) {
        console.error('Unexpected error in saveProfile:', error);
        console.error('Error stack:', error.stack);
        alert('Terjadi kesalahan tak terduga saat menyimpan profil: ' + error.message);
    }
}

// Save user settings
function saveUserSettings() {
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const darkMode = document.getElementById('darkMode').checked;

    localStorage.setItem('emailNotifications', emailNotifications);
    localStorage.setItem('darkMode', darkMode);

    // Apply dark mode if enabled
    if (darkMode) {
        document.body.classList.add('dark-mode');
    } else {
        document.body.classList.remove('dark-mode');
    }
}

// Handle avatar upload
document.addEventListener('DOMContentLoaded', () => {
    const avatarUpload = document.getElementById('avatarUpload');
    if (avatarUpload) {
        avatarUpload.addEventListener('change', handleAvatarUpload);
    }
});

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
        alert('File harus berupa gambar!');
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
        alert('Ukuran file maksimal 5MB!');
        return;
    }

    try {
        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { data, error } = await supabase.storage
            .from('images')
            .upload(filePath, file);

        if (error) {
            console.error('Error uploading avatar:', error);
            alert('Gagal upload foto profil: ' + error.message);
            return;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        // Update profile with new avatar URL
        const result = await getCurrentUser();
        if (result.success && result.user) {
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: urlData.publicUrl })
                .eq('id', result.user.id);

            if (updateError) {
                console.error('Error updating avatar URL:', updateError);
                alert('Foto profil berhasil diupload tetapi gagal disimpan.');
                return;
            }

            // Update preview
            document.getElementById('currentProfileImage').src = urlData.publicUrl;
            alert('Foto profil berhasil diperbarui!');
        }

    } catch (error) {
        console.error('Error in handleAvatarUpload:', error);
        alert('Terjadi kesalahan saat upload foto profil.');
    }
}

// Password Change Modal
function showPasswordChangeModal() {
    hideProfileModal();
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('passwordForm').reset();
    }
}

// Handle password change
async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validation
    if (newPassword.length < 8) {
        alert('Kata sandi baru harus minimal 8 karakter!');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('Konfirmasi kata sandi tidak cocok!');
        return;
    }

    try {
        // Update password using Supabase Auth
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            console.error('Error changing password:', error);
            alert('Gagal mengubah kata sandi: ' + error.message);
            return;
        }

        alert('Kata sandi berhasil diubah!');
        hidePasswordModal();

    } catch (error) {
        console.error('Error in changePassword:', error);
        alert('Terjadi kesalahan saat mengubah kata sandi.');
    }
}

// Delete Account Modal
function showDeleteAccountModal() {
    hideProfileModal();
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.add('show');
        setupDeleteConfirmation();
    }
}

function hideDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountModal');
    if (modal) {
        modal.classList.remove('show');
        document.getElementById('deleteConfirmation').value = '';
        document.getElementById('confirmDeleteBtn').disabled = true;
    }
}

function setupDeleteConfirmation() {
    const input = document.getElementById('deleteConfirmation');
    const button = document.getElementById('confirmDeleteBtn');

    input.addEventListener('input', () => {
        button.disabled = input.value !== 'HAPUS AKUN';
    });
}

// Delete account
async function deleteAccount() {
    if (!confirm('APAKAH ANDA YAKIN INGIN MENGHAPUS AKUN? Tindakan ini tidak dapat dibatalkan!')) {
        return;
    }

    try {
        const result = await getCurrentUser();
        if (!result.success || !result.user) {
            alert('Sesi login telah berakhir.');
            return;
        }

        // Delete user data (this will cascade delete due to foreign keys)
        // Note: In production, you might want to soft delete instead
        const { error } = await supabase.auth.admin.deleteUser(result.user.id);

        if (error) {
            console.error('Error deleting account:', error);
            alert('Gagal menghapus akun. Silakan hubungi administrator.');
            return;
        }

        alert('Akun berhasil dihapus. Anda akan diarahkan ke halaman login.');
        window.location.href = 'index.html';

    } catch (error) {
        console.error('Error in deleteAccount:', error);
        alert('Terjadi kesalahan saat menghapus akun.');
    }
}

// Event listeners for profile modal
document.addEventListener('DOMContentLoaded', () => {
    // Profile modal triggers
    const profileButtons = document.querySelectorAll('[onclick*="profile"]');
    profileButtons.forEach(button => {
        button.onclick = (e) => {
            e.preventDefault();
            showProfileModal();
        };
    });

    // Modal close functionality
    const modals = ['profileModal', 'passwordModal', 'deleteAccountModal'];
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-close')) {
                    if (modalId === 'profileModal') hideProfileModal();
                    else if (modalId === 'passwordModal') hidePasswordModal();
                    else if (modalId === 'deleteAccountModal') hideDeleteAccountModal();
                }
            });
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('profileModal').classList.contains('show')) hideProfileModal();
            if (document.getElementById('passwordModal').classList.contains('show')) hidePasswordModal();
            if (document.getElementById('deleteAccountModal').classList.contains('show')) hideDeleteAccountModal();
        }
    });

    // Form submissions
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', saveProfile);
    }

    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', changePassword);
    }
});

// Export functions for global access
window.startExam = startExam;
window.showProgressModal = showProgressModal;
window.hideProgressModal = hideProgressModal;
window.showProfileModal = showProfileModal;
window.hideProfileModal = hideProfileModal;
window.showPasswordChangeModal = showPasswordChangeModal;
window.hidePasswordModal = hidePasswordModal;
window.showDeleteAccountModal = showDeleteAccountModal;
window.hideDeleteAccountModal = hideDeleteAccountModal;
window.deleteAccount = deleteAccount;
window.logout = performLogout; // Make logout function globally accessible
window.showRecentActivities = showRecentActivities; // Make recent activities function globally accessible
window.loadRecentActivities = loadRecentActivities; // Export for potential future use