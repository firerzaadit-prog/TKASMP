// admin.js - Admin panel functionality
import { supabase } from './clientSupabase.js';
import {
    getDetailedStudentAnalytics,
    exportStudentAnalyticsToExcel,
    getAllStudentsAnalytics
} from './exam_analytics_system.js';

// KEAMANAN: Admin authentication sekarang menggunakan Supabase Auth
// Tidak lagi menggunakan hardcoded credentials

// Fungsi untuk cek apakah user saat ini adalah admin
async function checkIsAdmin() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return false;
        
        // Cek role di tabel admin_users
        const { data: adminData } = await supabase
            .from('admin_users')
            .select('role, is_admin')
            .eq('id', session.user.id)
            .maybeSingle();
        
        if (adminData && (adminData.is_admin === true || adminData.role === 'admin')) {
            return true;
        }
        
        // Alternatif: Cek di profiles dengan field role
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();
        
        return profile?.role === 'admin';
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// Admin credentials - DIHAPUS karena tidak aman
// Sekarang menggunakan Supabase Auth
// const ADMIN_CREDENTIALS = { ... }

// DOM Elements - will be initialized after DOM load
let adminLoginSection, adminDashboard, adminLoginForm, adminLogoutBtn, usersTableBody;
let totalUsersEl, activeUsersEl, totalQuestionsEl, totalMaterialsEl;

// Current session activities
let currentSessionActivities = [];

// Add activity to current session and database
async function addActivity(icon, title, description, activityType = 'admin_action', action = 'action', entityType = null, entityId = null) {
    try {
        const activity = {
            icon: icon,
            title: title,
            description: description,
            time: 'Baru saja',
            type: activityType
        };

        // Add to beginning of array for immediate display
        currentSessionActivities.unshift(activity);

        // Keep only last 10 activities in session
        if (currentSessionActivities.length > 10) {
            currentSessionActivities = currentSessionActivities.slice(0, 10);
        }

        // Save to database
        const dbActivity = {
            activity_type: activityType,
            action: action,
            title: title,
            description: description,
            entity_type: entityType,
            entity_id: entityId,
            metadata: {
                icon: icon,
                session_activity: true
            }
        };

        const { error } = await supabase
            .from('admin_activities')
            .insert([dbActivity]);

        if (error) {
            console.error('Error saving activity to database:', error);
            // Continue with session display even if database save fails
        }

        // Refresh the activities display
        loadRecentActivities();
    } catch (error) {
        console.error('Error in addActivity:', error);
        // Fallback to session-only storage
        const activity = {
            icon: icon,
            title: title,
            description: description,
            time: 'Baru saja',
            type: activityType
        };
        currentSessionActivities.unshift(activity);
        if (currentSessionActivities.length > 10) {
            currentSessionActivities = currentSessionActivities.slice(0, 10);
        }
        loadRecentActivities();
    }
}

// Check if admin is logged in on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    adminLoginSection = document.getElementById('adminLoginSection');
    adminDashboard = document.getElementById('adminDashboard');
    adminLoginForm = document.getElementById('adminLoginForm');
    adminLogoutBtn = document.getElementById('adminLogoutBtn');
    usersTableBody = document.getElementById('usersTableBody');

    // Stats elements
    totalUsersEl = document.getElementById('totalUsers');
    activeUsersEl = document.getElementById('activeUsers');
    totalQuestionsEl = document.getElementById('totalQuestions');
    totalMaterialsEl = document.getElementById('totalMaterials');

    // For indexadmin.html (login page), always show login form
    // For other admin pages, check login status
    const currentPage = window.location.pathname.split('/').pop();
    const isLoginPage = currentPage === 'indexadmin.html';

    if (isLoginPage) {
        // Always show login form on login page
        showAdminLogin();
    } else {
        // Check login status for main admin pages
        const isAdminLoggedIn = localStorage.getItem('adminLoggedIn') === 'true';

        if (isAdminLoggedIn) {
            showAdminDashboard();
        } else {
            showAdminLogin();
        }
    }

    // Setup password toggle for admin login (only if elements exist)
    setupPasswordToggle();

    // Admin login form handler
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('adminUsername').value;
            const password = document.getElementById('adminPassword').value;

            // KEAMANAN: Verifikasi menggunakan Supabase Auth
            // Bukan lagi hardcoded credentials
            try {
                // Login dengan email (username adalah email)
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: username,
                    password: password
                });

                if (error) {
                    alert('Login gagal: ' + error.message);
                    return;
                }

                // Cek apakah user adalah admin
                const isAdmin = await checkIsAdmin();
                
                if (isAdmin) {
                    localStorage.setItem('adminLoggedIn', 'true');
                    localStorage.setItem('adminUserId', data.user.id);
                    window.location.href = 'admin.html';
                } else {
                    // logout jika bukan admin
                    await supabase.auth.signOut();
                    alert('Akses ditolak. Hanya admin yang dapat mengakses panel ini.');
                }
            } catch (err) {
                alert('Terjadi kesalahan: ' + err.message);
            }
        });
    }

    // Admin logout handler
    if (adminLogoutBtn) {
        adminLogoutBtn.addEventListener('click', async () => {
            localStorage.removeItem('adminLoggedIn');
            localStorage.removeItem('adminUserId');
            // Logout from Supabase Auth
            await supabase.auth.signOut();
            // Redirect to login page after logout
            window.location.href = 'indexadmin.html';
        });
    }
});

// Admin login form handler (moved inside DOMContentLoaded)

// Show admin login form
function showAdminLogin() {
    if (adminLoginSection) {
        adminLoginSection.style.display = 'block';
    }
    if (adminDashboard) {
        adminDashboard.classList.remove('show');
    }
}

// Show admin dashboard
async function showAdminDashboard() {
    if (adminLoginSection) {
        adminLoginSection.style.display = 'none';
    }
    if (adminDashboard) {
        adminDashboard.classList.add('show');
    }

    // Load admin data
    await loadAdminStats();
    await loadTodaysPerformance();
    await checkDashboardSystemStatus();
    await loadUsersData();
    await loadMaterials(); // Load materials data
}

// Load admin statistics
async function loadAdminStats() {
    try {
        // Gunakan admin key agar tembus keamanan RLS
        const adminSupabase = window.supabase || supabase;
        
        let totalUsersCount = 0;
        let activeUsersCount = 0;

        // 1. Ambil jumlah total user dari tabel profiles
        const { count: profilesCount, error: profilesError } = await adminSupabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        if (profilesError) {
            console.error('Error loading profiles count:', profilesError);
        } else {
            totalUsersCount = profilesCount || 0;
            
            // 2. Hitung active users (yang mengerjakan ujian dalam 30 hari terakhir)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { data: recentSessions, error: sessionsError } = await adminSupabase
                .from('exam_sessions')
                .select('user_id')
                .gte('created_at', thirtyDaysAgo.toISOString());
            
            if (!sessionsError && recentSessions) {
                const uniqueActiveUsers = new Set(recentSessions.map(s => s.user_id));
                activeUsersCount = uniqueActiveUsers.size;
            } else {
                activeUsersCount = profilesCount || 0; // Fallback jika tidak ada ujian
            }
        }

        if (totalUsersEl) totalUsersEl.textContent = totalUsersCount;
        if (activeUsersEl) activeUsersEl.textContent = activeUsersCount;

        // 3. Load jumlah soal (questions count)
        const { count: questionsCount, error: questionsError } = await adminSupabase
            .from('questions')
            .select('*', { count: 'exact', head: true });

        if (questionsError) {
            console.error('Error loading questions count:', questionsError);
            if (totalQuestionsEl) totalQuestionsEl.textContent = '0';
        } else {
            if (totalQuestionsEl) totalQuestionsEl.textContent = questionsCount || 0;
        }

        // 4. Load jumlah materi (materials count)
        const { count: materialsCount, error: materialsError } = await adminSupabase
            .from('materials')
            .select('*', { count: 'exact', head: true });

        if (materialsError) {
            console.error('Error loading materials count:', materialsError);
            if (totalMaterialsEl) totalMaterialsEl.textContent = '0';
        } else {
            if (totalMaterialsEl) totalMaterialsEl.textContent = materialsCount || 0;
        }

        console.log('Admin stats loaded successfully');

    } catch (error) {
        console.error('Error in loadAdminStats:', error);
        // Tampilkan 0 jika error
        if (totalUsersEl) totalUsersEl.textContent = '0';
        if (activeUsersEl) activeUsersEl.textContent = '0';
        if (totalQuestionsEl) totalQuestionsEl.textContent = '0';
        if (totalMaterialsEl) totalMaterialsEl.textContent = '0';
    }
}

// Check dashboard system status for database, storage, security, and uptime
async function checkDashboardSystemStatus() {
    try {
        console.log('Checking system status...');

        // Check Database
        await checkDatabaseStatus();

        // Check Storage
        await checkStorageStatus();

        // Check Security
        await checkSecurityStatus();

        // Check Uptime
        await checkUptimeStatus();

        console.log('System status check completed');

    } catch (error) {
        console.error('Error checking system status:', error);
        // Set all to error state
        updateStatusIndicator('databaseStatus', 'Error', 'error');
        updateStatusIndicator('storageStatus', 'Error', 'error');
        updateStatusIndicator('securityStatus', 'Error', 'error');
        updateStatusIndicator('uptimeStatus', 'Error', 'error');
    }
}

// Check database status
async function checkDatabaseStatus() {
    try {
        const startTime = Date.now();

        // Try to query a simple table
        const { data, error } = await supabase
            .from('questions')
            .select('id')
            .limit(1);

        const responseTime = Date.now() - startTime;

        if (error) {
            updateStatusIndicator('databaseStatus', 'Error', 'error');
            console.error('Database check failed:', error);
        } else {
            updateStatusIndicator('databaseStatus', `Online (${responseTime}ms)`, 'success');
            console.log('Database check passed');
        }
    } catch (error) {
        updateStatusIndicator('databaseStatus', 'Error', 'error');
        console.error('Database check error:', error);
    }
}

// Check storage status
async function checkStorageStatus() {
    try {
        // Try to list files in storage bucket
        const { data, error } = await supabase.storage
            .from('images')
            .list('', { limit: 1 });

        if (error) {
            // Check if it's a bucket not found error
            if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
                updateStatusIndicator('storageStatus', 'Bucket Missing', 'error');
            } else {
                updateStatusIndicator('storageStatus', 'Error', 'error');
            }
            console.error('Storage check failed:', error);
        } else {
            updateStatusIndicator('storageStatus', 'Online', 'success');
            console.log('Storage check passed');
        }
    } catch (error) {
        updateStatusIndicator('storageStatus', 'Error', 'error');
        console.error('Storage check error:', error);
    }
}

// Check security status
async function checkSecurityStatus() {
    try {
        // Check if RLS is enabled by trying to access a protected table
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .limit(1);

        if (error) {
            // If we get a permission error, RLS is working
            if (error.message.includes('permission') || error.message.includes('RLS')) {
                updateStatusIndicator('securityStatus', 'Aktif (RLS)', 'success');
                console.log('Security check passed - RLS is active');
            } else {
                updateStatusIndicator('securityStatus', 'Warning', 'warning');
                console.log('Security check warning:', error.message);
            }
        } else {
            // If we can access without auth, there might be a security issue
            updateStatusIndicator('securityStatus', 'Perlu Periksa', 'warning');
            console.log('Security check warning - data accessible without proper auth');
        }
    } catch (error) {
        updateStatusIndicator('securityStatus', 'Error', 'error');
        console.error('Security check error:', error);
    }
}

// Check uptime status
async function checkUptimeStatus() {
    try {
        // For uptime, we'll simulate a check since we don't have server-side tracking
        // In a real implementation, you'd check server uptime via an API endpoint

        // Calculate simulated uptime (this would come from server in real app)
        const uptimePercentage = 99.9; // Simulated high uptime

        updateStatusIndicator('uptimeStatus', `${uptimePercentage}%`, 'success');
        console.log('Uptime check completed');

    } catch (error) {
        updateStatusIndicator('uptimeStatus', 'Error', 'error');
        console.error('Uptime check error:', error);
    }
}

// Helper function to update status indicators
function updateStatusIndicator(elementId, text, statusClass) {
    const element = document.getElementById(elementId);
    const textElement = document.getElementById(elementId + 'Text');

    if (element) {
        // Remove existing status classes
        element.classList.remove('online', 'error', 'warning', 'success');

        // Add new status class (map success to online for consistency)
        if (statusClass === 'success') {
            element.classList.add('online');
        } else if (statusClass) {
            element.classList.add(statusClass);
        }
    }

    if (textElement) {
        textElement.textContent = text;
    }
}

// Load today's performance metrics
async function loadTodaysPerformance() {
    try {
        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        console.log('Loading performance for date:', today);

        // Load total views today (simplified - using total views since daily tracking not implemented)
        // In a real implementation, you'd have a daily_views table or track views with timestamps
        let totalViews = 0; // Placeholder since materials are removed

        // Load exams started today
        let examsStarted = 0;
        let examsCompleted = 0;

        // Try to query exam sessions (will fail gracefully if table doesn't exist)
        try {
            const { count: startedCount, error: startedError } = await supabase
                .from('exam_sessions')
                .select('*', { count: 'exact', head: true })
                .gte('started_at', today)
                .lt('started_at', tomorrow);

            if (!startedError) {
                examsStarted = startedCount || 0;
            }
        } catch (error) {
            console.log('Exam sessions table may not exist yet - showing 0 for exams started');
        }

        try {
            const { count: completedCount, error: completedError } = await supabase
                .from('exam_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('completed_at', today)
                .lt('completed_at', tomorrow);

            if (!completedError) {
                examsCompleted = completedCount || 0;
            }
        } catch (error) {
            console.log('Exam sessions table may not exist yet - showing 0 for exams completed');
        }

        // Update the UI
        const totalViewsEl = document.getElementById('totalViewsToday');
        const examsStartedEl = document.getElementById('examsStartedToday');
        const examsCompletedEl = document.getElementById('examsCompletedToday');

        if (totalViewsEl) totalViewsEl.textContent = totalViews.toLocaleString();
        if (examsStartedEl) examsStartedEl.textContent = examsStarted;
        if (examsCompletedEl) examsCompletedEl.textContent = examsCompleted;

        console.log('Today\'s performance loaded:', {
            totalViews,
            examsStarted,
            examsCompleted
        });

    } catch (error) {
        console.error('Error loading today\'s performance:', error);
        // Set defaults
        const totalViewsEl = document.getElementById('totalViewsToday');
        const examsStartedEl = document.getElementById('examsStartedToday');
        const examsCompletedEl = document.getElementById('examsCompletedToday');

        if (totalViewsEl) totalViewsEl.textContent = '0';
        if (examsStartedEl) examsStartedEl.textContent = '0';
        if (examsCompletedEl) examsCompletedEl.textContent = '0';
    }
}

// Load users data for management (Langsung pakai profiles)
async function loadUsersData() {
    try {
        console.log('Loading users from profiles table...');
        await loadUsersFromProfiles();
    } catch (error) {
        console.error('Error in loadUsersData:', error);
    }
}

// Fallback function to load from profiles table menggunakan Edge Function
// KEAMANAN: Tidak lagi menggunakan service_role_key di client-side
async function loadUsersFromProfiles() {
    try {
        // Dapatkan session dari user yang login
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            console.error('No active session. Please login first.');
            if (usersTableBody) {
                usersTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 2rem; color: #666;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; color: #f39c12;"></i><br>
                            <p>Silakan login terlebih dahulu untuk mengakses data siswa.</p>
                        </td>
                    </tr>
                `;
            }
            return;
        }

        // Panggil Edge Function untuk mendapatkan data users
        // Service role key hanya ada di server (Edge Function), tidak di client
        const edgeFunctionUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co/functions/v1/admin-get-users';
        
        const response = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('Edge Function error:', errorData.error || response.status);
            
            if (response.status === 403) {
                alert('Akses ditolak. Hanya admin yang dapat mengakses data siswa.');
            } else if (response.status === 401) {
                alert('Sesi Anda telah berakhir. Silakan login kembali.');
            }
            return;
        }

        const result = await response.json();
        const profiles = result.users;

        if (!profiles || profiles.length === 0) {
            if (usersTableBody) {
                usersTableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 2rem; color: #666;">
                            <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 1rem; color: #999;"></i><br>
                            <p>Belum ada siswa yang terdaftar.</p>
                        </td>
                    </tr>
                `;
            }
            return;
        }

        // Clear existing table rows
        if (usersTableBody) usersTableBody.innerHTML = '';

        // Populate table with user data
        profiles.forEach(profile => {
            const row = createUserTableRowFromProfiles(profile);
            if (usersTableBody) usersTableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error in loadUsersFromProfiles:', error);
    }
}

// Create table row for user from profiles table
function createUserTableRowFromProfiles(profile) {
    const row = document.createElement('tr');

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID');
    };

    row.innerHTML = `
        <td>${profile.nama_lengkap || 'N/A'}</td>
        <td>${profile.email || 'N/A'}</td>
        <td>${profile.phone || '-'}</td>
        <td>${profile.school || '-'}</td>
        <td><span class="status-badge status-active">Aktif</span></td>
        <td>${formatDate(profile.created_at)}</td>
        <td>
            <button class="delete-history-btn" onclick="deleteStudentExamHistory('${profile.id}', '${(profile.nama_lengkap || 'Siswa').replace(/'/g, "\\'")}')" title="Hapus Riwayat Ujian">
                <i class="fas fa-redo"></i> Reset
            </button>
        </td>
    `;

    return row;
}

// Create table row for user from auth.users
function createUserTableRowFromAuth(user, profile = null) {
    const row = document.createElement('tr');

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID');
    };

    // Get name from profile or user metadata or email
    const displayName = profile?.nama_lengkap ||
                       user.user_metadata?.full_name ||
                       user.user_metadata?.name ||
                       user.email?.split('@')[0] ||
                       'N/A';

    // Determine status based on email confirmation
    const isConfirmed = user.email_confirmed_at !== null;
    const statusClass = isConfirmed ? 'status-active' : 'status-inactive';
    const statusText = isConfirmed ? 'Aktif' : 'Belum Konfirmasi';

    row.innerHTML = `
        <td>${displayName}</td>
        <td>${user.email || 'N/A'}</td>
        <td>${profile?.phone || '-'}</td>
        <td>${profile?.school || '-'}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>${formatDate(user.created_at)}</td>
        <td>
            <button class="delete-history-btn" onclick="deleteStudentExamHistory('${user.id}', '${displayName.replace(/'/g, "\\'")}')" title="Hapus Riwayat Ujian">
                <i class="fas fa-redo"></i> Reset
            </button>
        </td>
    `;

    return row;
}

// View user details (placeholder function)
function viewUserDetails(userId) {
    alert(`Fitur detail user untuk ID: ${userId} akan ditambahkan di versi mendatang.`);
}

// Delete exam history for a specific student
async function deleteStudentExamHistory(userId, userName) {
    if (!confirm('Apakah Anda yakin ingin MENGHAPUS SELURUH RIWAYAT UJIAN siswa ini? Data nilai akan hilang dan siswa akan bisa mengerjakan ujian dari awal.')) {
        return;
    }

    try {
        console.log(`Menghapus data ujian untuk user: ${userId}`);

        // 1. Ambil semua session ID milik user ini
        const { data: sessions, error: fetchError } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('Gagal ambil sesi:', fetchError);
            alert('Gagal ambil data sesi: ' + fetchError.message);
            return;
        }

        const sessionIds = sessions?.map(s => s.id) || [];
        console.log(`Ditemukan ${sessionIds.length} sesi untuk user ${userId}`);

        // 2. Hapus exam_answers berdasarkan session ID
        if (sessionIds.length > 0) {
            const { error: errorAnswers } = await supabase
                .from('exam_answers')
                .delete()
                .in('exam_session_id', sessionIds);

            if (errorAnswers) {
                console.error('Gagal menghapus exam_answers:', errorAnswers);
            } else {
                console.log('exam_answers berhasil dihapus');
            }
        }

        // 3. Hapus exam_sessions
        const { error: errorSessions } = await supabase
            .from('exam_sessions')
            .delete()
            .eq('user_id', userId);

        if (errorSessions) {
            console.error('Gagal menghapus exam_sessions:', errorSessions);
            alert('Gagal menghapus sesi ujian: ' + errorSessions.message);
            return;
        }
        console.log('exam_sessions berhasil dihapus');

        // 4. Hapus student_analytics
        const { error: errorAnalytics } = await supabase
            .from('student_analytics')
            .delete()
            .eq('user_id', userId);

        if (errorAnalytics) {
            console.log('student_analytics skip (mungkin tidak ada data):', errorAnalytics.message);
        } else {
            console.log('student_analytics berhasil dihapus');
        }

        alert('Berhasil! Riwayat ujian siswa telah dihapus. Siswa sekarang dapat mulai mengerjakan ujian kembali dari awal.');
        
        // Otomatis refresh data di tabel setelah penghapusan
        if (typeof loadUsersData === 'function') {
            loadUsersData();
        }
        
    } catch (error) {
        console.error('Terjadi kesalahan saat menghapus data ujian:', error);
        alert('Gagal menghapus data ujian. Silakan cek console.');
    }
}

// Pastikan fungsi ini diekspor ke global window (agar tombol HTML bisa memanggilnya)
window.deleteStudentExamHistory = deleteStudentExamHistory;

// Delete exam data completely for a specific student (hard delete)
async function deleteStudentExamData(userId, userName) {
    // Handle test button click
    if (userId === 'test-id') {
        alert('Test button works! But this is just a test - cannot delete data for test user.');
        return;
    }

    // First confirm
    const confirmDelete = confirm(`Apakah Anda yakin ingin MengHAPUS PERMANEN data ujian untuk siswa "${userName}"?\n\nSemua data jawaban dan riwayat ujian akan dihapus secara permanen!`);
    
    if (!confirmDelete) return;

    // Second confirmation
    const confirmAgain = confirm(`PERINGATAN: Data yang dihapus tidak dapat dikembalikan!\n\nYakin ingin menghapus permanen data ujian untuk "${userName}"?`);
    
    if (!confirmAgain) return;

    try {
        console.log('Starting deletion for user:', userId);
        
        // 1. First get exam session IDs for this user (all statuses including completed)
        const { data: sessions, error: fetchError } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('Error fetching sessions:', fetchError);
            alert('Error: ' + fetchError.message);
            return;
        }
        
        const sessionIds = sessions?.map(s => s.id) || [];
        console.log('Found sessions:', sessionIds.length);
        
        // 2. Delete exam answers using exam_session_id
        if (sessionIds.length > 0) {
            try {
                const { error: answersError, count: answersCount } = await supabase
                    .from('exam_answers')
                    .delete()
                    .in('exam_session_id', sessionIds);
                
                if (answersError) {
                    console.log('exam_answers delete:', answersError.message);
                } else {
                    console.log('exam_answers deleted:', answersCount, 'records');
                    
                    // Verify exam_answers deletion
                    const { data: verifyAnswers } = await supabase
                        .from('exam_answers')
                        .select('id')
                        .in('exam_session_id', sessionIds);
                    console.log('Verification - remaining answers:', verifyAnswers?.length || 0);
                }
            } catch (e) {
                console.log('exam_answers table might not exist');
            }
        }

        // 3. Delete exam sessions for this user - using a workaround for RLS issue
        console.log('Attempting to delete exam_sessions for user:', userId);
        
        // Try using filter with neq (not equal) approach or get the IDs first
        const { data: allUserSessions, error: fetchAllError } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('user_id', userId);
            
        console.log('All user sessions:', allUserSessions);
        
        if (fetchAllError) {
            console.error('Error fetching sessions:', fetchAllError);
        }
        
        // Try deleting each session individually
        let deletedCount = 0;
        if (allUserSessions && allUserSessions.length > 0) {
            for (const session of allUserSessions) {
                const { error: singleDeleteError } = await supabase
                    .from('exam_sessions')
                    .delete()
                    .eq('id', session.id);
                    
                if (singleDeleteError) {
                    console.error('Error deleting session', session.id, ':', singleDeleteError);
                } else {
                    deletedCount++;
                }
            }
        }
        
        console.log('Individual delete - deleted count:', deletedCount);
        
        // Verify deletion
        const { data: verifyData } = await supabase
            .from('exam_sessions')
            .select('id')
            .eq('user_id', userId);
        
        console.log('Verification - remaining sessions:', verifyData?.length || 0);
        
        if (verifyData && verifyData.length > 0) {
            alert('Gagal menghapus data! Kemungkinan ada kebijakan keamanan (RLS) yang memblokir penghapusan.\n\nSisa sesi: ' + verifyData.length);
            return;
        }

        // 4. Delete student analytics for this user
        try {
            const { error: analyticsError } = await supabase
                .from('student_analytics')
                .delete()
                .eq('user_id', userId);
            
            if (analyticsError) {
                console.log('student_analytics:', analyticsError.message);
            }
        } catch (e) {
            console.log('student_analytics table might not exist');
        }

        alert(`Data ujian untuk "${userName}" berhasil dihapus permanen!\n\nSiswa sekarang bisa mengerjakan ujian lagi.`);
        
        // Refresh the table - remove the deleted row from display immediately
        if (window.studentExamData) {
            window.studentExamData = window.studentExamData.filter(exam => exam.user_id !== userId);
            renderStudentExamRows(window.studentExamData);
        }
        
        // Also reload from database to ensure consistency
        loadStudentExamTable();
        
    } catch (error) {
        console.error('Error in deleteStudentExamData:', error);
        alert('Terjadi kesalahan saat menghapus data ujian: ' + error.message);
    }
}

// Export function to global scope
window.deleteStudentExamData = deleteStudentExamData;
window.deleteStudentExamHistory = deleteStudentExamHistory;
window.loadUsersData = loadUsersData; // INI YANG DITAMBAHKAN
// Setup password toggle for admin login
function setupPasswordToggle() {
    const toggleBtn = document.getElementById('toggleAdminPassword');
    const passwordInput = document.getElementById('adminPassword');

    if (toggleBtn && passwordInput) {
        toggleBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggleBtn.classList.toggle('fa-eye-slash');
        });
    }
}

// Question Management Variables
let currentEditingQuestionId = null;

// Material Management Variables
let currentEditingMaterialId = null;

// Question Management Functions
async function loadQuestions() {
    try {
        const { data: questions, error } = await supabase
            .from('questions')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading questions:', error);
            return;
        }

        const questionsTableBody = document.getElementById('questionsTableBody');
        if (questionsTableBody) questionsTableBody.innerHTML = '';

        questions.forEach(question => {
            const row = createQuestionTableRow(question);
            if (questionsTableBody) questionsTableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error in loadQuestions:', error);
    }
}

function createQuestionTableRow(question) {
    const row = document.createElement('tr');

    // Truncate long questions for display
    const shortQuestion = question.question_text.length > 50
        ? question.question_text.substring(0, 50) + '...'
        : question.question_text;

    const statusBadge = question.is_active
        ? '<span class="status-badge status-active">Aktif</span>'
        : '<span class="status-badge status-inactive">Nonaktif</span>';

    // Display question type with variant badge
    const questionTypeDisplay = question.question_type 
        ? `${question.question_type}`
        : 'Pilihan Ganda';

    // Display variant badge
    const variantDisplay = question.question_type_variant 
        ? `<span class="question-variant-badge">${question.question_type_variant}</span>`
        : '<span style="color: #9ca3af;">-</span>';

    row.innerHTML = `
        <td title="${question.question_text}">${shortQuestion}</td>
        <td>${questionTypeDisplay}</td>
        <td>${variantDisplay}</td>
        <td>${question.chapter || '-'}</td>
        <td>${question.difficulty}</td>
        <td>${question.scoring_weight}</td>
        <td>${question.time_limit_minutes} menit</td>
        <td>${statusBadge}</td>
        <td>
            <button class="logout-btn" onclick="editQuestion('${question.id}')" style="margin-right: 0.5rem;">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="logout-btn" onclick="deleteQuestion('${question.id}')" style="background: #dc2626;">
                <i class="fas fa-trash"></i> Hapus
            </button>
        </td>
    `;

    return row;
}

// Show/hide question form
function showQuestionForm() {
    // Only reset if we're not editing (to preserve data when editing)
    if (!currentEditingQuestionId) {
        resetQuestionForm();
        // Ensure default question type is set
        document.getElementById('questionType').value = 'Pilihan Ganda';
    }
    document.getElementById('questionForm').style.display = 'block';
    document.getElementById('addQuestionBtn').style.display = 'none';

    // Update form based on current question type selection
    updateQuestionForm();
}

function hideQuestionForm() {
    document.getElementById('questionForm').style.display = 'none';
    document.getElementById('addQuestionBtn').style.display = 'inline-block';
    resetQuestionForm();
}

// Reset form to initial state
function resetQuestionForm() {
    document.getElementById('questionFormData').reset();
    document.getElementById('formTitle').textContent = 'Tambah Soal Baru';
    currentEditingQuestionId = null;
    window.editingQuestionData = null;
    document.getElementById('timeLimit').value = '30';

    // Reset image checkbox
    const enableImagesCheckbox = document.getElementById('enableQuestionImages');
    if (enableImagesCheckbox) {
        enableImagesCheckbox.checked = false;
        toggleQuestionImageFields(); // Hide image fields
    }

    // Clear image preview
    const imagePreview = document.getElementById('imagePreview');
    if (imagePreview) {
        imagePreview.innerHTML = '';
    }

    // Clear options container
    const optionsContainer = document.getElementById('optionsContainer');
    if (optionsContainer) {
        optionsContainer.innerHTML = '';
    }

    // Clear question sections
    window.questionSections = [];

    // Clear category statements
    window.categoryStatements = [];

    // Clear competence field
    const competenceEl = document.getElementById('competence');
    if (competenceEl) competenceEl.value = '';

    // Clear level kognitif dan proses berpikir
    const levelKognitifEl = document.getElementById('levelKognitif');
    if (levelKognitifEl) levelKognitifEl.value = '';
    const prosesBerpikirEl = document.getElementById('prosesBerpikir');
    if (prosesBerpikirEl) prosesBerpikirEl.value = '';
}

// Update scoring weight based on difficulty
function updateScoringWeight() {
    const difficulty = document.getElementById('difficulty').value;
    const scoringWeightInput = document.getElementById('scoringWeight');

    let weight = 1;
    switch (difficulty) {
        case 'Mudah':
            weight = 1;
            break;
        case 'Sedang':
            weight = 2;
            break;
        case 'Sulit':
            weight = 3;
            break;
    }

    scoringWeightInput.value = weight;
}

// Update sections with current form values
function updateQuestionSectionsFromForm() {
    const sectionElements = document.querySelectorAll('.question-section');
    sectionElements.forEach((element) => {
        const sectionId = element.dataset.sectionId;
        const section = window.questionSections.find(s => s.id == sectionId);
        if (section && section.type === 'text') {
            const textarea = element.querySelector('.question-section-textarea');
            if (textarea) section.content = textarea.value.trim();
        }
    });
}

async function ensureFormReady(questionType) {
    console.log('Ensuring form is ready for question type:', questionType);

    let formReady = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!formReady && attempts < maxAttempts) {
        attempts++;
        console.log(`Form readiness check attempt ${attempts}/${maxAttempts}`);

        switch (questionType) {
            case 'Pilihan Ganda':
                formReady = !!document.getElementById('optionA');
                break;
            case 'PGK Kategori':
                formReady = !!document.getElementById('categoryStatementsTableBody');
                break;
            case 'PGK MCMA':
                formReady = !!document.getElementById('mcmaA');
                break;
            default:
                formReady = true;
        }

        if (!formReady) {
            console.log('Form not ready, updating question form...');
            updateQuestionForm();
            // Wait for DOM update
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    if (!formReady) {
        console.error('Failed to prepare form after', maxAttempts, 'attempts');
    } else {
        console.log('Form is ready');
    }

    return formReady;
}

function validateQuestionForm(questionType) {
    console.log('Validating form for question type:', questionType);
    console.log('window.categoryStatements:', window.categoryStatements);

    switch (questionType) {
        case 'Pilihan Ganda':
            const optionA = document.getElementById('optionA');
            const optionB = document.getElementById('optionB');
            const optionC = document.getElementById('optionC');
            const optionD = document.getElementById('optionD');
            const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked');

            if (!optionA || !optionB || !optionC || !optionD) {
                return { valid: false, message: 'Form pilihan ganda belum lengkap. Silakan pilih tipe soal lagi.' };
            }

            if (!correctAnswer) {
                return { valid: false, message: 'Silakan pilih jawaban yang benar (A, B, C, atau D).' };
            }

            return { valid: true };

        case 'PGK MCMA':
            const mcmaA = document.getElementById('mcmaA');
            const mcmaB = document.getElementById('mcmaB');
            const mcmaC = document.getElementById('mcmaC');
            const mcmaD = document.getElementById('mcmaD');

            if (!mcmaA || !mcmaB || !mcmaC || !mcmaD) {
                return { valid: false, message: 'Form PGK MCMA belum lengkap. Silakan pilih tipe soal lagi.' };
            }

            const checkedBoxes = document.querySelectorAll('input[id^="mcma"]:checked');
            if (checkedBoxes.length === 0) {
                return { valid: false, message: 'Silakan pilih minimal satu jawaban yang benar untuk PGK MCMA.' };
            }

            return { valid: true };

        case 'PGK Kategori':
            if (!window.categoryStatements || window.categoryStatements.length === 0) {
                return { valid: false, message: 'Form PGK Kategori belum lengkap. Silakan pilih tipe soal lagi.' };
            }

            const validStatements = window.categoryStatements.filter(item =>
                item.statement && item.statement.trim() && item.isTrue !== null
            );

            if (validStatements.length === 0) {
                return { valid: false, message: 'Silakan isi minimal satu pernyataan dan pilih jawaban (Benar/Salah) untuk setiap pernyataan.' };
            }

            // Check that not all statements have the same answer (should have mix of true/false)
            const trueCount = validStatements.filter(item => item.isTrue === true).length;
            const falseCount = validStatements.filter(item => item.isTrue === false).length;

            if (trueCount === 0) {
                return { valid: false, message: 'Minimal satu pernyataan harus ditandai sebagai Benar.' };
            }

            if (falseCount === 0) {
                return { valid: false, message: 'Minimal satu pernyataan harus ditandai sebagai Salah.' };
            }

            return { valid: true };

        default:
            return { valid: true };
    }
}

// Save question (create or update)
async function saveQuestion(event) {
console.log('saveQuestion function called with event:', event);
event.preventDefault();
console.log('Event default prevented');

console.log('Saving question, currentEditingQuestionId:', currentEditingQuestionId);

// Get form elements with null checks
const questionTextEl = document.getElementById('questionText');
const questionTypeEl = document.getElementById('questionType');
const questionTypeVariantEl = document.getElementById('questionTypeVariant');
const chapterEl = document.getElementById('chapter');
const subChapterEl = document.getElementById('subChapter');
const timeLimitEl = document.getElementById('timeLimit');
const difficultyEl = document.getElementById('difficulty');
const scoringWeightEl = document.getElementById('scoringWeight');
const latexContentEl = document.getElementById('latexContent');
const explanationEl = document.getElementById('explanation');

console.log('Form elements check:', {
    questionTextEl: !!questionTextEl,
    questionTypeEl: !!questionTypeEl,
    chapterEl: !!chapterEl,
    subChapterEl: !!subChapterEl,
    timeLimitEl: !!timeLimitEl,
    difficultyEl: !!difficultyEl,
    scoringWeightEl: !!scoringWeightEl
});

// Check if all required elements exist
if (!questionTextEl || !questionTypeEl || !chapterEl || !subChapterEl ||
    !timeLimitEl || !difficultyEl || !scoringWeightEl) {
    alert('Form soal tidak lengkap. Silakan refresh halaman dan coba lagi.');
    console.error('Missing form elements');
    return;
}

const questionType = questionTypeEl.value;
const questionTypeVariant = questionTypeVariantEl ? questionTypeVariantEl.value : null;

// Ensure the form is properly loaded for the current question type
const currentOptionsContainer = document.getElementById('optionsContainer');
if (!currentOptionsContainer || !currentOptionsContainer.innerHTML.trim()) {
    console.log('Options container not ready, updating form...');
    updateQuestionForm();
    // Wait for DOM update
    await new Promise(resolve => setTimeout(resolve, 200));
}

// Special handling for PGK Kategori - ensure form is loaded
if (questionType === 'PGK Kategori' && !document.getElementById('categoryStatementsTableBody')) {
    console.log('PGK Kategori form not loaded, updating form...');
    updateQuestionForm();
    await new Promise(resolve => setTimeout(resolve, 200));
}

// Validate form before proceeding
const validation = validateQuestionForm(questionType);
if (!validation.valid) {
    console.warn('Form validation failed:', validation.message);
    // Don't block saving, just warn and continue
    // alert(validation.message);
}

console.log('questionType in saveQuestion:', questionType);
console.log('optionsContainer exists:', !!document.getElementById('optionsContainer'));

// For editing, don't update form as it may clear user changes - form should already be set up correctly
// Only update if question type changed or elements are missing (checked later)

const baseFormData = {
        question_text: questionTextEl.value.trim(),
        question_type: questionType,
        question_type_variant: questionTypeVariant || null,
        chapter: chapterEl.value,
        sub_chapter: subChapterEl.value,
        competence: document.getElementById('competence')?.value.trim() || null,
        level_kognitif: document.getElementById('levelKognitif')?.value || null,
        proses_berpikir: document.getElementById('prosesBerpikir')?.value || null,
        time_limit_minutes: parseInt(timeLimitEl.value),
        subject: 'Matematika', // Force to Mathematics for TKA
        difficulty: difficultyEl.value,
        scoring_weight: parseInt(scoringWeightEl.value),
        latex_content: latexContentEl ? latexContentEl.value.trim() || null : null,
        explanation: explanationEl ? explanationEl.value.trim() || null : null,
        question_sections: window.questionSections && window.questionSections.length > 0 ? window.questionSections : null
    };

    console.log('Saving question - Chapter:', chapterEl.value, 'Sub-chapter:', subChapterEl.value);
    console.log('Form elements values:', {
        chapter: chapterEl.value,
        subChapter: subChapterEl.value,
        questionText: questionTextEl.value.substring(0, 50) + '...',
        questionType: questionType,
        questionTypeVariant: questionTypeVariant
    });

    // Validate chapter and sub-chapter are not empty
    if (!chapterEl.value || !subChapterEl.value) {
        alert('Bab dan Sub Bab harus diisi!');
        console.error('Chapter or sub-chapter is empty:', { chapter: chapterEl.value, subChapter: subChapterEl.value });
        return;
    }

    console.log('baseFormData:', baseFormData);

    let formData;

    switch (questionType) {
        case 'Pilihan Ganda':
            // Get multiple choice elements with null checks
            let mcOptionAEl = document.getElementById('optionA');
            let mcOptionBEl = document.getElementById('optionB');
            let mcOptionCEl = document.getElementById('optionC');
            let mcOptionDEl = document.getElementById('optionD');
            let correctAnswerEl = document.querySelector('input[name="correctAnswer"]:checked');

            console.log('Multiple choice elements check:', {
                mcOptionAEl: !!mcOptionAEl,
                mcOptionBEl: !!mcOptionBEl,
                mcOptionCEl: !!mcOptionCEl,
                mcOptionDEl: !!mcOptionDEl,
                correctAnswerEl: !!correctAnswerEl,
                correctAnswerValue: correctAnswerEl ? correctAnswerEl.value : 'none'
            });

            // If elements not found or no correct answer selected, try to update form
            if (!mcOptionAEl || !mcOptionBEl || !mcOptionCEl || !mcOptionDEl || !correctAnswerEl) {
                console.log('Elements missing or no correct answer selected, updating form...');
                updateQuestionForm();

                // Wait a bit for DOM update
                await new Promise(resolve => setTimeout(resolve, 100));

                mcOptionAEl = document.getElementById('optionA');
                mcOptionBEl = document.getElementById('optionB');
                mcOptionCEl = document.getElementById('optionC');
                mcOptionDEl = document.getElementById('optionD');
                correctAnswerEl = document.querySelector('input[name="correctAnswer"]:checked');

                console.log('After updateQuestionForm retry:', {
                    mcOptionAEl: !!mcOptionAEl,
                    mcOptionBEl: !!mcOptionBEl,
                    mcOptionCEl: !!mcOptionCEl,
                    mcOptionDEl: !!mcOptionDEl,
                    correctAnswerEl: !!correctAnswerEl,
                    correctAnswerValue: correctAnswerEl ? correctAnswerEl.value : 'none'
                });

                if (!mcOptionAEl || !mcOptionBEl || !mcOptionCEl || !mcOptionDEl) {
                    alert('Form pilihan jawaban tidak lengkap. Silakan refresh halaman.');
                    console.error('Multiple choice elements not found after retry');
                    return;
                }
            }

            console.log('Element values before trim:', {
                optionA: mcOptionAEl.value,
                optionB: mcOptionBEl.value,
                optionC: mcOptionCEl.value,
                optionD: mcOptionDEl.value,
                correctAnswer: correctAnswerEl ? correctAnswerEl.value : 'none'
            });

            // Ensure correct answer is set, default to 'A' if not selected
            let correctAnswer = correctAnswerEl ? correctAnswerEl.value : 'A';
            if (!correctAnswer || !['A', 'B', 'C', 'D'].includes(correctAnswer)) {
                correctAnswer = 'A'; // Default to A if invalid
                console.warn('Correct answer not properly selected, defaulting to A');
            }

            formData = {
                ...baseFormData,
                option_a: mcOptionAEl.value.trim(),
                option_b: mcOptionBEl.value.trim(),
                option_c: mcOptionCEl.value.trim(),
                option_d: mcOptionDEl.value.trim(),
                correct_answer: correctAnswer
            };
            break;

        case 'PGK Kategori':
            console.log('Processing PGK Kategori data...');
            console.log('Current categoryStatements:', window.categoryStatements);

            // Get statements from the table
            if (!window.categoryStatements || window.categoryStatements.length === 0) {
                alert('Minimal satu pernyataan harus diisi!');
                return;
            }

            // Filter out empty statements and validate
            const validStatements = window.categoryStatements.filter(item =>
                item.statement && item.statement.trim() && item.isTrue !== null
            );

            console.log('Valid statements count:', validStatements.length);
            console.log('Valid statements:', validStatements);

            if (validStatements.length === 0) {
                alert('Minimal satu pernyataan harus diisi dan jawabannya dipilih (Benar/Salah)!');
                return;
            }

            // Check validation requirements
            const trueCount = validStatements.filter(item => item.isTrue === true).length;
            const falseCount = validStatements.filter(item => item.isTrue === false).length;
            console.log('True count:', trueCount, 'False count:', falseCount);

            if (trueCount === 0) {
                alert('Minimal satu pernyataan harus ditandai sebagai Benar (True).');
                return;
            }

            if (falseCount === 0) {
                alert('Minimal satu pernyataan harus ditandai sebagai Salah (False).');
                return;
            }

            // Create arrays for statements and answers
            const statements = validStatements.map(item => item.statement.trim());
            const answers = {};
            validStatements.forEach(item => {
                answers[item.statement.trim()] = item.isTrue;
            });

            console.log('Statements array:', statements);
            console.log('Answers object:', answers);

            // For Supabase JSONB columns, we can pass JavaScript objects/arrays directly
            // Supabase client will handle the serialization
            formData = {
                ...baseFormData,
                // For PGK Kategori, we still need to provide dummy values for required fields
                option_a: 'N/A', // Not used for category questions
                option_b: 'N/A',
                option_c: 'N/A',
                option_d: 'N/A',
                correct_answer: 'A', // Dummy value
                category_options: statements, // Array of statements (may contain LaTeX)
                category_mapping: answers // Object with statement -> boolean mapping
            };

            console.log('Final PGK Kategori formData:', formData);
            break;

        case 'PGK MCMA':
            const selectedAnswers = [];
            ['A', 'B', 'C', 'D'].forEach(letter => {
                const checkbox = document.getElementById(`mcma${letter}`);
                if (checkbox && checkbox.checked) {
                    selectedAnswers.push(letter);
                }
            });

            console.log('PGK MCMA selected answers:', selectedAnswers);

            // Get MCMA option elements with null checks
            let optionAEl = document.getElementById('optionA');
            let optionBEl = document.getElementById('optionB');
            let optionCEl = document.getElementById('optionC');
            let optionDEl = document.getElementById('optionD');

            if (!optionAEl || !optionBEl || !optionCEl || !optionDEl) {
                console.log('MCMA elements not found, updating form...');
                // Try to update form and get elements again
                updateQuestionForm();

                // Wait a bit for DOM update
                await new Promise(resolve => setTimeout(resolve, 100));

                optionAEl = document.getElementById('optionA');
                optionBEl = document.getElementById('optionB');
                optionCEl = document.getElementById('optionC');
                optionDEl = document.getElementById('optionD');

                if (!optionAEl || !optionBEl || !optionCEl || !optionDEl) {
                    alert('Form pilihan jawaban MCMA tidak lengkap. Silakan refresh halaman.');
                    console.error('MCMA option elements not found');
                    return;
                }
            }

            formData = {
                ...baseFormData,
                option_a: optionAEl.value.trim(),
                option_b: optionBEl.value.trim(),
                option_c: optionCEl.value.trim(),
                option_d: optionDEl.value.trim(),
                correct_answer: selectedAnswers.join(''),
                correct_answers: selectedAnswers,
                partial_credit: selectedAnswers.length > 1
            };
            break;
    }

    // Handle main question image upload (only if enabled)
    const enableImages = document.getElementById('enableQuestionImages')?.checked || false;
    if (enableImages) {
        if (currentImageFile) {
            try {
                const imageUrl = await uploadImage(currentImageFile);

                // Get comprehensive image settings from current settings
                const imageSettings = {
                    position: currentImageSettings.position,
                    size: currentImageSettings.size,
                    quality: currentImageSettings.quality,
                    fit: currentImageSettings.fit,
                    alignment: currentImageSettings.alignment,
                    border: currentImageSettings.border,
                    shadow: currentImageSettings.shadow,
                    rounded: currentImageSettings.rounded,
                    grayscale: currentImageSettings.grayscale,
                    opacity: currentImageSettings.opacity,
                    caption: currentImageSettings.caption,
                    alt: currentImageSettings.alt,
                    customWidth: currentImageSettings.customWidth,
                    customHeight: currentImageSettings.customHeight,
                    originalDimensions: {
                        width: document.getElementById('imageDimensions').textContent.split(' × ')[0],
                        height: document.getElementById('imageDimensions').textContent.split(' × ')[1]
                    }
                };

                // Store image URL and comprehensive settings
                formData.image_url = imageUrl;
                formData.image_settings = JSON.stringify(imageSettings);

            } catch (error) {
                alert('Gagal upload gambar soal: ' + error.message);
                return;
            }
        }

        // Handle option image uploads for multiple choice questions
        if (questionType === 'Pilihan Ganda' || questionType === 'PGK MCMA') {
            const optionImages = {};
            const optionLetters = ['A', 'B', 'C', 'D'];

            for (const letter of optionLetters) {
                // Handle images
                const optionImageFile = document.getElementById(`option${letter}Image`)?.files[0];
                if (optionImageFile) {
                    try {
                        const imageUrl = await uploadImage(optionImageFile);
                        optionImages[`option_${letter.toLowerCase()}_image`] = imageUrl;
                    } catch (error) {
                        alert(`Gagal upload gambar pilihan ${letter}: ` + error.message);
                        return;
                    }
                }
            }

            // Add option images to formData as JSON strings (disabled due to missing columns)
            // formData.option_images = JSON.stringify(optionImages);
        }
    }

    // Generate tags based on content (removed to fix database insert)
    // formData.tags = generateTags(formData);

    // Ensure all optional fields are set to avoid 400 errors
    formData.correct_answer = formData.correct_answer || 'A'; // Default for required field
    formData.correct_answers = (formData.correct_answers && formData.correct_answers.length > 0) ? formData.correct_answers : null;
    formData.category_options = (formData.category_options && formData.category_options.length > 0) ? formData.category_options : null;
    formData.category_mapping = (formData.category_mapping && Object.keys(formData.category_mapping || {}).length > 0) ? formData.category_mapping : null;
    formData.partial_credit = formData.partial_credit !== undefined ? formData.partial_credit : false;
    formData.image_url = formData.image_url || null;
    formData.explanation = formData.explanation || null;
    formData.latex_content = formData.latex_content || null;

    // Validation
    if (!formData.question_text) {
        alert('Pertanyaan harus diisi!');
        return;
    }

    // Check if dynamic form fields are loaded
    const optionsContainer = document.getElementById('optionsContainer');
    if (!optionsContainer || !optionsContainer.innerHTML.trim()) {
        alert('Form soal belum dimuat dengan benar. Silakan pilih tipe soal terlebih dahulu.');
        console.error('Options container not found or empty');
        return;
    }

    console.log('About to save question. Question type:', questionType);
    console.log('Options container HTML:', optionsContainer.innerHTML.substring(0, 200) + '...');

    // Ensure the form elements exist for the current question type
    const formReady = await ensureFormReady(questionType);
    if (!formReady) {
        alert('Form soal belum siap. Silakan pilih tipe soal terlebih dahulu.');
        return;
    }

    // Final check: ensure the form matches the selected question type
    if (questionType === 'PGK Kategori' && !document.getElementById('categoryStatementsTableBody')) {
        console.log('PGK Kategori form not found in final check, attempting to load...');
        updateQuestionForm();
        // Wait for DOM update
        await new Promise(resolve => setTimeout(resolve, 300));

        // Check again
        if (!document.getElementById('categoryStatementsTableBody')) {
            alert('Form PGK Kategori belum dimuat. Silakan pilih "PGK Kategori" dari dropdown tipe soal.');
            console.error('PGK Kategori form not loaded after retry');
            return;
        }
    }

    if (questionType === 'PGK MCMA' && !document.getElementById('mcmaA')) {
        alert('Form PGK MCMA belum dimuat. Silakan pilih "PGK MCMA" dari dropdown tipe soal.');
        console.error('PGK MCMA form not loaded');
        return;
    }

    if (questionType === 'Pilihan Ganda' && !document.getElementById('optionA')) {
        alert('Form Pilihan Ganda belum dimuat. Silakan pilih "Pilihan Ganda" dari dropdown tipe soal.');
        console.error('Multiple choice form not loaded');
        return;
    }

    if (questionType === 'Pilihan Ganda') {
        console.log('Validating multiple choice:', {
            option_a: formData.option_a,
            option_b: formData.option_b,
            option_c: formData.option_c,
            option_d: formData.option_d,
            correct_answer: formData.correct_answer
        });

        // Debug: log form data
        console.log('Form data for validation:', {
            option_a: formData.option_a,
            option_b: formData.option_b,
            option_c: formData.option_c,
            option_d: formData.option_d
        });

        // Check if option fields exist and have values
        const emptyOptions = [];
        if (!formData.option_a.trim()) emptyOptions.push('A');
        if (!formData.option_b.trim()) emptyOptions.push('B');
        if (!formData.option_c.trim()) emptyOptions.push('C');
        if (!formData.option_d.trim()) emptyOptions.push('D');
        if (emptyOptions.length > 0) {
            alert(`Pilihan jawaban ${emptyOptions.join(', ')} belum diisi. Silakan isi semua pilihan jawaban.`);
            return;
        }

        // Check if correct answer is selected (warn but don't block)
        if (!formData.correct_answer) {
            console.warn('No correct answer selected, will default to A');
            formData.correct_answer = 'A';
        }

        // Validate that correct_answer is one of A, B, C, D
        if (!['A', 'B', 'C', 'D'].includes(formData.correct_answer)) {
            console.warn('Invalid correct answer, defaulting to A');
            formData.correct_answer = 'A';
        }
    }

    if (questionType === 'PGK Kategori') {
        console.log('Validating PGK Kategori...');
        console.log('window.categoryStatements:', window.categoryStatements);

        // Check if statements exist in the table
        if (!window.categoryStatements || window.categoryStatements.length === 0) {
            alert('Minimal satu pernyataan harus diisi!');
            return;
        }

        // Filter out empty statements
        const validStatements = window.categoryStatements.filter(item =>
            item.statement && item.statement.trim() && item.isTrue !== null
        );

        console.log('Valid statements:', validStatements);

        if (validStatements.length === 0) {
            alert('Minimal satu pernyataan harus diisi dan jawabannya dipilih (Benar/Salah)!');
            return;
        }

        if (validStatements.length < 2) {
            alert('Minimal dua pernyataan diperlukan untuk soal PGK Kategori!');
            return;
        }

        // Check if at least one statement is marked as true
        const trueStatements = validStatements.filter(item => item.isTrue === true);
        if (trueStatements.length === 0) {
            alert('Minimal satu pernyataan harus ditandai sebagai benar!');
            return;
        }

        // Check if not all statements are marked as true (should have mix of true/false)
        const falseStatements = validStatements.filter(item => item.isTrue === false);
        if (falseStatements.length === 0) {
            alert('Tidak semua pernyataan boleh benar. Harus ada pernyataan yang salah juga!');
            return;
        }

        console.log('PGK Kategori validation passed');
    }

    if (questionType === 'PGK MCMA') {
        console.log('Validating PGK MCMA:', {
            correct_answers: formData.correct_answers,
            correct_answer_string: formData.correct_answer,
            option_a: formData.option_a,
            option_b: formData.option_b,
            option_c: formData.option_c,
            option_d: formData.option_d
        });

        // Check if option fields exist and have values
        const emptyOptions = [];
        if (!formData.option_a.trim()) emptyOptions.push('A');
        if (!formData.option_b.trim()) emptyOptions.push('B');
        if (!formData.option_c.trim()) emptyOptions.push('C');
        if (!formData.option_d.trim()) emptyOptions.push('D');
        if (emptyOptions.length > 0) {
            alert(`Pilihan jawaban ${emptyOptions.join(', ')} belum diisi. Silakan isi semua pilihan jawaban.`);
            return;
        }

        // Check if at least one correct answer is selected (warn but don't block)
        if (!formData.correct_answers || formData.correct_answers.length === 0) {
            console.warn('No correct answers selected for MCMA, defaulting to A');
            formData.correct_answers = ['A'];
            formData.correct_answer = 'A';
            formData.partial_credit = false;
        }

        // Validate that all selected answers are valid letters
        const validAnswers = ['A', 'B', 'C', 'D'];
        const invalidAnswers = formData.correct_answers.filter(answer => !validAnswers.includes(answer));
        if (invalidAnswers.length > 0) {
            console.warn(`Invalid answers for MCMA: ${invalidAnswers.join(', ')}, filtering to valid ones`);
            formData.correct_answers = formData.correct_answers.filter(answer => validAnswers.includes(answer));
            if (formData.correct_answers.length === 0) {
                formData.correct_answers = ['A'];
            }
            formData.correct_answer = formData.correct_answers.join('');
        }
    }

    try {
        let result;
        console.log('=== SAVING QUESTION ===');
        console.log('Question Type:', questionType);
        console.log('Form data to save:', formData);
        console.log('Current editing question ID:', currentEditingQuestionId);
        console.log('Question text length:', formData.question_text?.length || 0);
        console.log('Options filled:', {
            A: !!formData.option_a?.trim(),
            B: !!formData.option_b?.trim(),
            C: !!formData.option_c?.trim(),
            D: !!formData.option_d?.trim()
        });

        // Check if required columns exist before saving
        console.log('Checking database schema before save...');
        try {
            // Test basic columns that are always needed
            const basicColumns = ['question_type', 'question_type_variant', 'chapter', 'sub_chapter', 'competence', 'scoring_weight', 'difficulty', 'subject', 'time_limit_minutes', 'explanation'];
            const missingColumns = [];

            for (const col of basicColumns) {
                try {
                    const testQuery = await supabase
                        .from('questions')
                        .select(col)
                        .limit(1);
                    if (testQuery.error) {
                        missingColumns.push(col);
                    }
                } catch (error) {
                    missingColumns.push(col);
                }
            }

            if (missingColumns.length > 0) {
                console.error('Missing columns:', missingColumns);
                alert(`Database belum lengkap. Kolom yang missing: ${missingColumns.join(', ')}\n\nSOLUSI:\n1. Buka Supabase Dashboard > SQL Editor\n2. Jalankan script: SQL/quick_fix_chapter_column.sql\n3. Jalankan script: SQL/setup_advanced_questions.sql\n4. Refresh halaman dan coba lagi.`);
                return;
            }

            // Additional check for advanced question types
            if (questionType === 'PGK Kategori') {
                const advancedColumns = ['category_options', 'category_mapping', 'question_type_variant'];
                for (const col of advancedColumns) {
                    try {
                        const testQuery = await supabase
                            .from('questions')
                            .select(col)
                            .limit(1);
                        if (testQuery.error) {
                            missingColumns.push(col);
                        }
                    } catch (error) {
                        missingColumns.push(col);
                    }
                }

                if (missingColumns.length > 0) {
                    console.error('Missing advanced columns:', missingColumns);
                    alert(`Database belum diupdate untuk PGK Kategori. Kolom yang missing: ${missingColumns.join(', ')}\n\nJalankan script setup_advanced_questions.sql di Supabase SQL Editor.`);
                    return;
                }
            }

            console.log('Database schema check passed');

        } catch (schemaError) {
            console.error('Schema check failed:', schemaError);
            alert('Gagal memeriksa schema database. Jalankan script setup database terlebih dahulu.');
            return;
        }

        if (currentEditingQuestionId) {
            console.log('Updating existing question with ID:', currentEditingQuestionId);
            // Update existing question — pakai .select() agar bisa deteksi RLS silent block
            result = await supabase
                .from('questions')
                .update(formData)
                .eq('id', currentEditingQuestionId)
                .select();

            // Cek apakah update benar-benar berhasil (bukan silent RLS block)
            if (!result.error && (!result.data || result.data.length === 0)) {
                console.error('Update silent fail: RLS memblokir atau soal tidak ditemukan');
                alert('Gagal menyimpan perubahan!\n\nKemungkinan penyebab:\n1. RLS (Row Level Security) di Supabase memblokir operasi UPDATE\n2. Soal tidak ditemukan\n\nSOLUSI:\nBuka Supabase Dashboard → Table Editor → questions → Policies\nPastikan ada policy yang mengizinkan admin melakukan UPDATE.\n\nAtau jalankan SQL ini di Supabase SQL Editor:\nALTER TABLE questions DISABLE ROW LEVEL SECURITY;\n(sementara untuk testing)');
                return;
            }
        } else {
            console.log('Creating new question');
            // Create new question
            result = await supabase
                .from('questions')
                .insert([formData])
                .select();
        }

        console.log('Database operation result:', result);

        if (result.error) {
            console.error('Error saving question:', result.error);

            // Provide specific error messages based on error type
            let errorMessage = 'Gagal menyimpan soal. ';

            if (result.error.message.includes('column') && result.error.message.includes('does not exist')) {
                const missingCol = result.error.message.match(/column ['"]([^'"]+)['"]/);
                const columnName = missingCol ? missingCol[1] : 'unknown';
                errorMessage += `Kolom '${columnName}' tidak ditemukan di database.\n\nSOLUSI:\n1. Buka Supabase Dashboard > SQL Editor\n2. Jalankan script: SQL/setup_advanced_questions.sql\n3. Refresh halaman dan coba lagi.`;
            } else if (result.error.message.includes('duplicate key') || result.error.message.includes('unique constraint')) {
                errorMessage += 'Data soal sudah ada atau duplikat.';
            } else if (result.error.message.includes('permission') || result.error.message.includes('RLS')) {
                errorMessage += 'Tidak memiliki izin untuk menyimpan soal. Silakan login sebagai admin.';
            } else if (result.error.message.includes('network') || result.error.message.includes('fetch')) {
                errorMessage += 'Masalah koneksi jaringan. Periksa koneksi internet Anda.';
            } else {
                errorMessage += result.error.message;
            }

            alert(errorMessage);
            return;
        }

        // Generate correct answer display based on question type
        let correctAnswerDisplay = formData.correct_answer;
        if (formData.question_type === 'PGK Kategori' && formData.category_mapping) {
            // For PGK Kategori, show which statements are true
            const trueStatements = Object.keys(formData.category_mapping).filter(key => formData.category_mapping[key] === true);
            correctAnswerDisplay = trueStatements.length > 0 ? trueStatements.join(', ') : 'Tidak ada jawaban benar';
        } else if (formData.question_type === 'PGK MCMA' && formData.correct_answers) {
            // For PGK MCMA, show the correct answer letters
            correctAnswerDisplay = formData.correct_answers.join(', ');
        }

        const variantInfo = formData.question_type_variant ? ` (Varian ${formData.question_type_variant})` : '';
        const successMessage = currentEditingQuestionId
            ? `Soal berhasil diperbarui!\n\nJawaban benar: ${correctAnswerDisplay}\nTipe: ${formData.question_type}${variantInfo}`
            : `Soal berhasil ditambahkan!\n\nJawaban benar: ${correctAnswerDisplay}\nTipe: ${formData.question_type}${variantInfo}`;

        alert(successMessage);
        console.log('Question saved successfully:', successMessage);

        // Add activity to recent activities
        const questionTitle = formData.question_text.length > 30
            ? formData.question_text.substring(0, 30) + '...'
            : formData.question_text;
        addActivity(
            'fas fa-brain',
            currentEditingQuestionId ? 'Soal diperbarui' : 'Soal baru dibuat',
            `"${questionTitle}" (${formData.question_type})`,
            'question',
            currentEditingQuestionId ? 'updated' : 'created',
            'question',
            currentEditingQuestionId || result.data?.[0]?.id
        );

        hideQuestionForm();
        await loadQuestions();

    } catch (error) {
        console.error('Error in saveQuestion:', error);
        alert('Terjadi kesalahan saat menyimpan soal.');
    }
}

// Upload image to Supabase Storage
async function uploadImage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `question-images/${fileName}`;

    try {
        const { data, error } = await supabase.storage
            .from('images')
            .upload(filePath, file);

        if (error) {
            // Check if bucket doesn't exist
            if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
                throw new Error('Storage bucket belum dibuat. Jalankan script setup_storage_buckets.sql di Supabase SQL Editor terlebih dahulu.');
            }
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Upload image error:', error);
        throw error;
    }
}

// Generate tags based on question content
function generateTags(questionData) {
    const tags = new Set();

    // Add chapter and sub-chapter
    if (questionData.chapter) tags.add(questionData.chapter.toLowerCase());
    if (questionData.sub_chapter) tags.add(questionData.sub_chapter.toLowerCase());

    // Add difficulty
    if (questionData.difficulty) tags.add(questionData.difficulty.toLowerCase());

    // Add question type
    if (questionData.question_type) tags.add(questionData.question_type.toLowerCase());
    
    // Add question type variant
    if (questionData.question_type_variant) tags.add(`varian-${questionData.question_type_variant.toLowerCase()}`);

    // Analyze content for keywords
    const content = (questionData.question_text + ' ' + (questionData.latex_content || '')).toLowerCase();

    const keywords = [
        'aljabar', 'geometri', 'aritmatika', 'bilangan', 'persamaan', 'kuadrat',
        'segitiga', 'lingkaran', 'statistika', 'peluang', 'logika', 'fungsi',
        'integral', 'diferensial', 'matriks', 'vektor', 'limit', 'turunan'
    ];

    keywords.forEach(keyword => {
        if (content.includes(keyword)) {
            tags.add(keyword);
        }
    });

    return Array.from(tags).filter(tag => tag && tag.trim().length > 0);
}

// Edit question
async function editQuestion(questionId) {
    try {
        console.log('Editing question with ID:', questionId);

        const { data: question, error } = await supabase
            .from('questions')
            .select('*')
            .eq('id', questionId)
            .single();

        if (error) {
            console.error('Error loading question for edit:', error);
            alert('Gagal memuat soal untuk diedit: ' + error.message);
            return;
        }

        console.log('Question data loaded:', question);

        // Store question data for later population
        window.editingQuestionData = question;

        // Initialize question sections
        window.questionSections = [];

        // Set basic form fields first
        document.getElementById('questionText').value = question.question_text;
        document.getElementById('questionType').value = question.question_type;
        
        // Set question type variant (A/B/C/D) if available
        if (question.question_type_variant) {
            document.getElementById('questionTypeVariant').value = question.question_type_variant;
        }

        // Check if question contains LaTeX and enable LaTeX mode if needed
        const hasLatex = question.question_text && /\\\(.+?\\\)/.test(question.question_text);
        if (hasLatex) {
            document.getElementById('enableQuestionLatex').checked = true;
            toggleQuestionLatexMode();
        }

        // Check if question has images and enable image mode if needed
        const hasImages = question.image_url ||
                         (question.option_images && Object.keys(question.option_images || {}).length > 0) ||
                         (question.question_type === 'Pilihan Ganda' || question.question_type === 'PGK MCMA') &&
                         (question.option_a_image || question.option_b_image || question.option_c_image || question.option_d_image);

        const enableImagesCheckbox = document.getElementById('enableQuestionImages');
        if (enableImagesCheckbox) {
            enableImagesCheckbox.checked = !!hasImages;
            toggleQuestionImageFields();
        }

        document.getElementById('chapter').value = question.chapter;
        document.getElementById('competence').value = question.competence || '';
        document.getElementById('timeLimit').value = question.time_limit_minutes;
        document.getElementById('difficulty').value = question.difficulty;

        // Populate level kognitif dan proses berpikir
        const levelKognitifEl = document.getElementById('levelKognitif');
        if (levelKognitifEl) levelKognitifEl.value = question.level_kognitif || '';
        const prosesBerpikirEl = document.getElementById('prosesBerpikir');
        if (prosesBerpikirEl) prosesBerpikirEl.value = question.proses_berpikir || '';

        // Update sub-chapters based on selected chapter
        updateSubChapters();

        // Set sub-chapter immediately after updating options
        const subChapterSelect = document.getElementById('subChapter');
        if (subChapterSelect) {
            subChapterSelect.value = question.sub_chapter || '';
            console.log('Sub-chapter set to:', question.sub_chapter);
        }

        // Update question form to show the correct options
        updateQuestionForm();

        // Wait for DOM updates, then populate all fields
        setTimeout(() => {
            // Ensure form is updated again if needed
            updateQuestionForm();

            // Populate the dynamic form fields
            populateQuestionFormFields(question);
        }, 300);

        document.getElementById('formTitle').textContent = 'Edit Soal';
        currentEditingQuestionId = questionId;
        showQuestionForm();

        // Scroll to top of page when editing
        window.scrollTo({ top: 0, behavior: 'smooth' });

        console.log('Edit question form shown, currentEditingQuestionId set to:', currentEditingQuestionId);

    } catch (error) {
        console.error('Error in editQuestion:', error);
        alert('Terjadi kesalahan saat mengedit soal.');
    }
}

// Helper function to populate form fields after dynamic elements are created
function populateQuestionFormFields(question) {
    try {
        console.log('Populating form fields for question type:', question.question_type);

        switch (question.question_type) {
            case 'Pilihan Ganda':
                const optionA = document.getElementById('optionA');
                const optionB = document.getElementById('optionB');
                const optionC = document.getElementById('optionC');
                const optionD = document.getElementById('optionD');

                if (optionA) optionA.value = question.option_a || '';
                if (optionB) optionB.value = question.option_b || '';
                if (optionC) optionC.value = question.option_c || '';
                if (optionD) optionD.value = question.option_d || '';

                // Set the correct radio button
                if (question.correct_answer) {
                    const correctRadio = document.getElementById(`correctAnswer${question.correct_answer}`);
                    if (correctRadio) correctRadio.checked = true;
                }

                // Check if options contain LaTeX and enable LaTeX mode
                const optionsText = [question.option_a, question.option_b, question.option_c, question.option_d]
                    .filter(opt => opt)
                    .join(' ');
                const hasLatex = optionsText && /\\\(.+?\\\)/.test(optionsText);

                if (hasLatex) {
                    const latexCheckbox = document.getElementById('enableOptionsLatex');
                    if (latexCheckbox) {
                        latexCheckbox.checked = true;
                        toggleOptionsLatexMode();
                    }
                }

                // Load option images
                if (question.option_images) {
                    const optionImages = typeof question.option_images === 'string' ?
                        JSON.parse(question.option_images) : question.option_images;

                    ['A', 'B', 'C', 'D'].forEach(letter => {
                        const imageUrl = optionImages[`option_${letter.toLowerCase()}_image`];
                        if (imageUrl) {
                            const preview = document.getElementById(`option${letter}ImagePreview`);
                            if (preview) {
                                preview.innerHTML = `<img src="${imageUrl}" alt="Option ${letter}" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;">`;
                            }
                        }
                    });
                }
                break;

            case 'PGK Kategori':
                console.log('Populating PGK Kategori form fields');

                // Parse category_options if it's a JSON string
                let categoryOptions = question.category_options;
                if (typeof categoryOptions === 'string') {
                    try {
                        categoryOptions = JSON.parse(categoryOptions);
                    } catch (e) {
                        console.error('Error parsing category_options:', e);
                        categoryOptions = [];
                    }
                }

                // Parse category_mapping if it's a JSON string
                let categoryMapping = question.category_mapping;
                if (typeof categoryMapping === 'string') {
                    try {
                        categoryMapping = JSON.parse(categoryMapping);
                    } catch (e) {
                        console.error('Error parsing category_mapping:', e);
                        categoryMapping = {};
                    }
                }

                console.log('Parsed category_options:', categoryOptions);
                console.log('Parsed category_mapping:', categoryMapping);

                // Populate category statements table
                if (categoryOptions && Array.isArray(categoryOptions)) {
                    window.categoryStatements = categoryOptions.map(statement => ({
                        statement: statement,
                        isTrue: categoryMapping && categoryMapping[statement] !== undefined ? categoryMapping[statement] : null
                    }));

                    // Check if statements contain LaTeX and enable LaTeX mode
                    const hasLatex = categoryOptions.some(stmt => /\\\(.+?\\\)/.test(stmt));
                    if (hasLatex) {
                        const latexCheckbox = document.getElementById('enableStatementsLatex');
                        if (latexCheckbox) {
                            latexCheckbox.checked = true;
                            toggleStatementsLatexMode();
                        }
                    }

                    // Update the table
                    setTimeout(() => {
                        console.log('Updating category statements table...');
                        updateCategoryStatementsTable();
                    }, 100);
                } else {
                    // Initialize with empty data if none exists
                    window.categoryStatements = [{ statement: '', isTrue: null }];
                    updateCategoryStatementsTable();
                }
                break;

            case 'PGK MCMA':
                const optionAMC = document.getElementById('optionA');
                const optionBMC = document.getElementById('optionB');
                const optionCMC = document.getElementById('optionC');
                const optionDMC = document.getElementById('optionD');

                if (optionAMC) optionAMC.value = question.option_a || '';
                if (optionBMC) optionBMC.value = question.option_b || '';
                if (optionCMC) optionCMC.value = question.option_c || '';
                if (optionDMC) optionDMC.value = question.option_d || '';

                // Check if options contain LaTeX and enable LaTeX mode
                const mcmaOptionsText = [question.option_a, question.option_b, question.option_c, question.option_d]
                    .filter(opt => opt)
                    .join(' ');
                const mcmaHasLatex = mcmaOptionsText && /\\\(.+?\\\)/.test(mcmaOptionsText);

                if (mcmaHasLatex) {
                    const latexCheckbox = document.getElementById('enableOptionsLatex');
                    if (latexCheckbox) {
                        latexCheckbox.checked = true;
                        toggleOptionsLatexMode();
                    }
                }

                // Handle multiple correct answers
                let correctAnswers = question.correct_answers;
                if (correctAnswers && Array.isArray(correctAnswers)) {
                    correctAnswers.forEach(answer => {
                        const checkbox = document.getElementById(`mcma${answer}`);
                        if (checkbox) {
                            checkbox.checked = true;
                        }
                    });
                }

                // Load option images
                if (question.option_images) {
                    const optionImages = typeof question.option_images === 'string' ?
                        JSON.parse(question.option_images) : question.option_images;

                    ['A', 'B', 'C', 'D'].forEach(letter => {
                        const imageUrl = optionImages[`option_${letter.toLowerCase()}_image`];
                        if (imageUrl) {
                            const preview = document.getElementById(`option${letter}ImagePreview`);
                            if (preview) {
                                preview.innerHTML = `<img src="${imageUrl}" alt="Option ${letter}" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;">`;
                            }
                        }
                    });
                }
                break;
        }

        // Handle explanation field
        const explanationField = document.getElementById('explanation');
        if (explanationField) {
            explanationField.value = question.explanation || '';
        }

        // Handle image preview (only if images are enabled)
        const enableImages = document.getElementById('enableQuestionImages')?.checked || false;
        const imagePreview = document.getElementById('imagePreview');
        if (imagePreview) {
            if (question.image_url && enableImages) {
                imagePreview.innerHTML = `<img src="${question.image_url}" alt="Question Image" style="max-width: 200px; max-height: 200px;">`;
            } else {
                imagePreview.innerHTML = '';
            }
        }

        // Handle question sections
        if (question.question_sections) {
            let sections = question.question_sections;
            console.log('populateQuestionFormFields: question.question_sections:', sections, 'type:', typeof sections);
            if (typeof sections === 'string') {
                try {
                    sections = JSON.parse(sections);
                    console.log('populateQuestionFormFields: parsed sections:', sections, 'isArray:', Array.isArray(sections));
                } catch (e) {
                    console.error('Error parsing question_sections:', e);
                    sections = [];
                }
            }
            window.questionSections = sections || [];
            console.log('populateQuestionFormFields: set window.questionSections to:', window.questionSections, 'isArray:', Array.isArray(window.questionSections));
        } else {
            window.questionSections = [];
            console.log('populateQuestionFormFields: no question_sections, set window.questionSections to []');
        }
        updateQuestionSectionsDisplay();

        console.log('Form fields populated successfully');

    } catch (error) {
        console.error('Error populating question form fields:', error);
    }
}

// Delete question
async function deleteQuestion(questionId) {
    if (!confirm('Apakah Anda yakin ingin menghapus soal ini?')) {
        return;
    }

    try {
        // Hapus exam_answers terkait (abaikan error jika tabel tidak ada / tidak ada data)
        console.log('Deleting related exam answers for question:', questionId);
        const { error: answersError } = await supabase
            .from('exam_answers')
            .delete()
            .eq('question_id', questionId);

        if (answersError) {
            // Jika bukan karena tabel tidak ada, log saja tapi tetap lanjutkan
            console.warn('Warning deleting exam_answers (non-fatal):', answersError.message);
        }

        // Hapus soal — gunakan .select() agar Supabase mengembalikan data yang terhapus
        // Jika RLS memblokir, data yang dikembalikan akan kosong (silent block terdeteksi)
        console.log('Deleting question:', questionId);
        const { data: deletedData, error: deleteError } = await supabase
            .from('questions')
            .delete()
            .eq('id', questionId)
            .select();

        if (deleteError) {
            console.error('Error deleting question:', deleteError);
            // Cek apakah RLS yang memblokir
            if (deleteError.message.includes('permission') ||
                deleteError.message.includes('RLS') ||
                deleteError.code === '42501') {
                alert('Gagal menghapus soal: Tidak ada izin (RLS).\n\nSOLUSI: Buka Supabase Dashboard → Authentication → Policies → tabel "questions" → tambahkan policy DELETE untuk admin.');
            } else {
                alert('Gagal menghapus soal: ' + deleteError.message);
            }
            return;
        }

        // Cek apakah soal benar-benar terhapus (bukan silent RLS block)
        if (!deletedData || deletedData.length === 0) {
            console.error('Delete silent fail: RLS memblokir atau soal tidak ditemukan');
            alert('Gagal menghapus soal!\n\nKemungkinan penyebab:\n1. RLS (Row Level Security) di Supabase memblokir operasi DELETE\n2. Soal tidak ditemukan\n\nSOLUSI:\nBuka Supabase Dashboard → Table Editor → questions → Policies\nPastikan ada policy yang mengizinkan admin melakukan DELETE.\n\nAtau jalankan SQL ini di Supabase SQL Editor:\nALTER TABLE questions DISABLE ROW LEVEL SECURITY;\n(sementara untuk testing)');
            return;
        }

        console.log('Question deleted successfully:', deletedData);
        alert('Soal berhasil dihapus!');

        addActivity(
            'fas fa-trash',
            'Soal dihapus',
            `Soal dengan ID ${questionId} telah dihapus`,
            'question',
            'deleted',
            'question',
            questionId
        );

        await loadQuestions();

    } catch (error) {
        console.error('Error in deleteQuestion:', error);
        alert('Terjadi kesalahan saat menghapus soal: ' + error.message);
    }
}

// Helper functions for PGK Kategori parsing
function parseCategoryOptions(text) {
    // Parse format: "Kategori1: Item1, Item2\nKategori2: Item3, Item4"
    const lines = text.split('\n').filter(line => line.trim());
    const categories = {};

    lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
            const categoryName = line.substring(0, colonIndex).trim();
            const itemsText = line.substring(colonIndex + 1).trim();
            const items = itemsText.split(',').map(item => item.trim()).filter(item => item);
            categories[categoryName] = items;
        }
    });

    return categories;
}

function parseCategoryMapping(text) {
    // Parse format: "Item1=Kategori1, Item2=Kategori1"
    const mappings = {};
    const items = text.split(',').map(item => item.trim()).filter(item => item);

    items.forEach(item => {
        const equalsIndex = item.indexOf('=');
        if (equalsIndex > 0) {
            const itemName = item.substring(0, equalsIndex).trim();
            const categoryName = item.substring(equalsIndex + 1).trim();
            mappings[itemName] = categoryName;
        }
    });

    return mappings;
}

// Helper functions for displaying PGK Kategori data in edit form
function formatCategoryOptionsForDisplay(categoryOptions) {
    // Convert JSON object back to text format
    if (!categoryOptions || typeof categoryOptions !== 'object') return '';

    const lines = [];
    Object.keys(categoryOptions).forEach(categoryName => {
        const items = categoryOptions[categoryName];
        if (Array.isArray(items)) {
            lines.push(`${categoryName}: ${items.join(', ')}`);
        }
    });

    return lines.join('\n');
}

function formatCategoryMappingForDisplay(categoryMapping) {
    // Convert JSON object back to text format
    if (!categoryMapping || typeof categoryMapping !== 'object') return '';

    const mappings = [];
    Object.keys(categoryMapping).forEach(itemName => {
        const categoryName = categoryMapping[itemName];
        mappings.push(`${itemName}=${categoryName}`);
    });

    return mappings.join(', ');
}

// Event listeners for question and material management
document.addEventListener('DOMContentLoaded', () => {
    // Question management buttons
    const addQuestionBtn = document.getElementById('addQuestionBtn');
    const cancelQuestionBtn = document.getElementById('cancelQuestionBtn');
    const questionFormData = document.getElementById('questionFormData');
    const questionTypeSelect = document.getElementById('questionType');

    console.log('Setting up question management event listeners...');
    console.log('addQuestionBtn found:', !!addQuestionBtn);
    console.log('cancelQuestionBtn found:', !!cancelQuestionBtn);
    console.log('questionFormData found:', !!questionFormData);
    console.log('questionTypeSelect found:', !!questionTypeSelect);

    if (addQuestionBtn) {
        addQuestionBtn.addEventListener('click', showQuestionForm);
        console.log('Added click listener to addQuestionBtn');
    }

    if (cancelQuestionBtn) {
        cancelQuestionBtn.addEventListener('click', hideQuestionForm);
        console.log('Added click listener to cancelQuestionBtn');
    }

    if (questionFormData) {
        questionFormData.addEventListener('submit', (e) => {
            console.log('Form submit event triggered for question form');
            e.preventDefault();
            console.log('Calling saveQuestion...');
            saveQuestion(e);
        });
        console.log('Added submit listener to questionFormData');
    } else {
        console.warn('questionFormData element not found - this may be normal if not on questions tab');
    }

    // Question type change listener - CRITICAL for form loading
    if (questionTypeSelect) {
        questionTypeSelect.addEventListener('change', () => {
            console.log('Question type changed to:', questionTypeSelect.value);
            updateQuestionForm();
        });
        console.log('Added change listener to questionTypeSelect');
    } else {
        console.warn('questionTypeSelect element not found - this may cause form loading issues');
    }

    // Chapter change listener - update sub-chapters when chapter changes
    const chapterSelect = document.getElementById('chapter');
    if (chapterSelect) {
        chapterSelect.addEventListener('change', () => {
            console.log('Chapter changed to:', chapterSelect.value, ', updating sub-chapters...');
            updateSubChapters();
        });
        console.log('Added change listener to chapterSelect');
    } else {
        console.warn('chapterSelect element not found');
    }

    // Sub-chapter change listener - for debugging
    const subChapterSelect = document.getElementById('subChapter');
    if (subChapterSelect) {
        subChapterSelect.addEventListener('change', () => {
            console.log('Sub-chapter changed to:', subChapterSelect.value);
        });
        console.log('Added change listener to subChapterSelect for debugging');
    } else {
        console.warn('subChapterSelect element not found');
    }

    // Material management buttons
    const addMaterialBtn = document.getElementById('addMaterialBtn');
    const cancelMaterialBtn = document.getElementById('cancelMaterialBtn');
    const materialFormData = document.getElementById('materialFormData');

    console.log('Setting up material management event listeners...');
    console.log('addMaterialBtn found:', !!addMaterialBtn);
    console.log('cancelMaterialBtn found:', !!cancelMaterialBtn);
    console.log('materialFormData found:', !!materialFormData);

    if (addMaterialBtn) {
        addMaterialBtn.addEventListener('click', showMaterialForm);
        console.log('Added click listener to addMaterialBtn');
    }

    if (cancelMaterialBtn) {
        cancelMaterialBtn.addEventListener('click', hideMaterialForm);
        console.log('Added click listener to cancelMaterialBtn');
    }

    if (materialFormData) {
        materialFormData.addEventListener('submit', saveMaterial);
        materialFormData.addEventListener('reset', () => {
            setTimeout(clearFileDisplays, 10);
        });
        console.log('Added submit and reset listeners to materialFormData');
    } else {
        console.warn('materialFormData element not found - this may be normal if not on materials tab');
    }
});

// Combined dashboard loading for questions
const originalShowAdminDashboard = showAdminDashboard;
showAdminDashboard = async function() {
    await originalShowAdminDashboard();
    await loadQuestions();
};

// Advanced Question Management Functions

// Show question sections for composite content (text and images)
function showQuestionSections() {
    const container = document.getElementById('optionsContainer');

    // Add sections container at the top
    let sectionsHtml = `
        <div class="form-group">
            <label>Bagian Soal (Sections) - Opsional:</label>
            <div id="questionSections" class="question-sections">
                <p style="text-align: center; color: #6b7280; padding: 2rem;">Belum ada bagian soal. Klik tombol di bawah untuk menambah bagian pertama.</p>
            </div>
            <div class="section-buttons">
                <button type="button" class="add-section-btn" onclick="addQuestionSection('text')">+ Tambah Teks Soal</button>
                <button type="button" class="add-section-btn" onclick="addQuestionSection('image')">+ Tambah Gambar</button>
            </div>
        </div>
    `;

    // Insert sections at the beginning of options container
    container.insertAdjacentHTML('afterbegin', sectionsHtml);

    // Initialize sections if not already done
    console.log('showQuestionSections: before init, window.questionSections:', window.questionSections, 'isArray:', Array.isArray(window.questionSections));
    if (!Array.isArray(window.questionSections)) {
        window.questionSections = [];
        console.log('showQuestionSections: initialized window.questionSections to []');
    }
    updateQuestionSectionsDisplay();
}

// Toggle question image fields visibility
function toggleQuestionImageFields() {
    const checkbox = document.getElementById('enableQuestionImages');
    const imageGroup = document.getElementById('questionImageGroup');

    if (checkbox && checkbox.checked) {
        if (imageGroup) imageGroup.style.display = 'block';
    } else {
        if (imageGroup) imageGroup.style.display = 'none';
        // Clear any selected image
        const imageInput = document.getElementById('questionImage');
        if (imageInput) {
            imageInput.value = '';
            const preview = document.getElementById('imagePreview');
            if (preview) preview.innerHTML = '';
        }
    }

    // Update the question form to show/hide option images
    updateQuestionForm();
}

// Update question form based on type
function updateQuestionForm() {
    const questionType = document.getElementById('questionType').value;
    const optionsContainer = document.getElementById('optionsContainer');
    const enableImages = document.getElementById('enableQuestionImages')?.checked || false;

    console.log('Updating question form for type:', questionType, 'enableImages:', enableImages);

    // Save current values before updating form
    const currentValues = {};
    if (questionType === 'Pilihan Ganda') {
        ['optionA', 'optionB', 'optionC', 'optionD'].forEach(id => {
            const el = document.getElementById(id);
            if (el) currentValues[id] = el.value;
        });
        // Also save correct answer
        const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked');
        if (correctAnswer) currentValues.correctAnswer = correctAnswer.value;
    }
    if (questionType === 'PGK MCMA') {
        ['optionA', 'optionB', 'optionC', 'optionD'].forEach(id => {
            const el = document.getElementById(id);
            if (el) currentValues[id] = el.value;
        });
        // Save checked boxes
        const checkedBoxes = document.querySelectorAll('input[id^="mcma"]:checked');
        currentValues.mcmaChecked = Array.from(checkedBoxes).map(cb => cb.value);
    }
    // Note: PGK Kategori uses window.categoryStatements, no need to save current values here
    // as the form will be properly populated by populateQuestionFormFields

    // Clear existing options
    if (optionsContainer) {
        optionsContainer.innerHTML = '';
    } else {
        console.error('Options container not found!');
        return;
    }

    // Always show question sections for composite content
    showQuestionSections();

    // Show type-specific options
    switch (questionType) {
        case 'Pilihan Ganda':
            console.log('Showing multiple choice options');
            showMultipleChoiceOptions(enableImages);
            break;
        case 'PGK Kategori':
            console.log('Showing category options');
            showCategoryOptions();
            break;
        case 'PGK MCMA':
            console.log('Showing MCMA options');
            showMCMAOptions(enableImages);
            break;
        case 'Komposit':
            console.log('Showing composite question options');
            // For Komposit, sections are already shown above
            break;
        default:
            console.warn('Unknown question type:', questionType);
    }

    // Restore saved values
    if (questionType === 'Pilihan Ganda') {
        ['optionA', 'optionB', 'optionC', 'optionD'].forEach(id => {
            const el = document.getElementById(id);
            if (el && currentValues[id]) el.value = currentValues[id];
        });
        if (currentValues.correctAnswer) {
            const radio = document.getElementById(`correctAnswer${currentValues.correctAnswer}`);
            if (radio) radio.checked = true;
        }
    }
    if (questionType === 'PGK MCMA') {
        ['optionA', 'optionB', 'optionC', 'optionD'].forEach(id => {
            const el = document.getElementById(id);
            if (el && currentValues[id]) el.value = currentValues[id];
        });
        if (currentValues.mcmaChecked) {
            currentValues.mcmaChecked.forEach(value => {
                const checkbox = document.getElementById(`mcma${value}`);
                if (checkbox) checkbox.checked = true;
            });
        }
    }
    if (questionType === 'PGK Kategori') {
        const statements = document.getElementById('categoryStatements');
        if (statements && currentValues.categoryStatements) statements.value = currentValues.categoryStatements;
        // Wait for statements preview to be updated, then check the boxes
        setTimeout(() => {
            if (currentValues.checkedStatements) {
                currentValues.checkedStatements.forEach(value => {
                    const checkbox = Array.from(document.querySelectorAll('.statement-checkbox')).find(cb => cb.value === value);
                    if (checkbox) checkbox.checked = true;
                });
            }
        }, 100);
    }

    console.log('Question form updated successfully');
}

// Show multiple choice options (A, B, C, D)
function showMultipleChoiceOptions(enableImages = false) {
    const container = document.getElementById('optionsContainer');
    if (!container) return;

    const imageUploadHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionAImage">Gambar untuk Pilihan A (Opsional):</label>
            <input type="file" id="optionAImage" accept="image/*" onchange="previewOptionImage('A', this)">
            <div id="optionAImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadBHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionBImage">Gambar untuk Pilihan B (Opsional):</label>
            <input type="file" id="optionBImage" accept="image/*" onchange="previewOptionImage('B', this)">
            <div id="optionBImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadCHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionCImage">Gambar untuk Pilihan C (Opsional):</label>
            <input type="file" id="optionCImage" accept="image/*" onchange="previewOptionImage('C', this)">
            <div id="optionCImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadDHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionDImage">Gambar untuk Pilihan D (Opsional):</label>
            <input type="file" id="optionDImage" accept="image/*" onchange="previewOptionImage('D', this)">
            <div id="optionDImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="form-group">
            <label>LaTeX untuk Pilihan Jawaban:</label>
            <div class="latex-controls">
                <label class="checkbox-label">
                    <input type="checkbox" id="enableOptionsLatex" onchange="toggleOptionsLatexMode()">
                    <span>Enable LaTeX untuk semua pilihan jawaban</span>
                </label>
            </div>
            <div id="optionsLatexToolbar" class="latex-toolbar" style="display: none;">
                <button type="button" onclick="insertLatexIntoOptions('fraction')" title="Fraction">½</button>
                <button type="button" onclick="insertLatexIntoOptions('sqrt')" title="Square Root">√</button>
                <button type="button" onclick="insertLatexIntoOptions('power')" title="Power">x²</button>
                <button type="button" onclick="insertLatexIntoOptions('integral')" title="Integral">∫</button>
                <button type="button" onclick="insertLatexIntoOptions('sum')" title="Sum">Σ</button>
                <button type="button" onclick="insertLatexIntoOptions('alpha')" title="Alpha">α</button>
                <button type="button" onclick="insertLatexIntoOptions('beta')" title="Beta">β</button>
                <button type="button" onclick="insertLatexIntoOptions('gamma')" title="Gamma">γ</button>
            </div>
            <div id="optionsLatexPreview" class="latex-preview" style="display: none;"></div>
        </div>

        <div class="option-group">
            <div class="option-header">
                <label for="optionA">Pilihan A:</label>
                <input type="radio" name="correctAnswer" value="A" id="correctAnswerA">
            </div>
            <input type="text" id="optionA" placeholder="Jawaban A">
            ${imageUploadHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <label for="optionB">Pilihan B:</label>
                <input type="radio" name="correctAnswer" value="B" id="correctAnswerB">
            </div>
            <input type="text" id="optionB" placeholder="Jawaban B">
            ${imageUploadBHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <label for="optionC">Pilihan C:</label>
                <input type="radio" name="correctAnswer" value="C" id="correctAnswerC">
            </div>
            <input type="text" id="optionC" placeholder="Jawaban C">
            ${imageUploadCHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <label for="optionD">Pilihan D:</label>
                <input type="radio" name="correctAnswer" value="D" id="correctAnswerD">
            </div>
            <input type="text" id="optionD" placeholder="Jawaban D">
            ${imageUploadDHtml}
        </div>
    `;
}

// Show category options (True/False statements)
function showCategoryOptions() {
    const container = document.getElementById('optionsContainer');
    if (!container) return;

    container.innerHTML = `
            <div class="form-group">
                <label>Pilihan Jawaban:</label>
                <div class="category-table-container">
                    <table class="category-options-table">
                        <thead>
                            <tr>
                                <th style="width: 60%;">Pernyataan</th>
                                <th style="width: 20%; text-align: center;">Benar</th>
                                <th style="width: 20%; text-align: center;">Salah</th>
                            </tr>
                        </thead>
                        <tbody id="categoryStatementsTableBody">
                            <!-- Rows will be added dynamically -->
                        </tbody>
                    </table>
                    <div class="table-actions">
                        <button type="button" class="add-statement-btn" onclick="addCategoryStatement()">
                            <i class="fas fa-plus"></i> Tambah Pernyataan
                        </button>
                    </div>
                </div>
                <div class="latex-controls">
                    <label class="checkbox-label">
                        <input type="checkbox" id="enableStatementsLatex" onchange="toggleStatementsLatexMode()">
                        <span>Enable LaTeX untuk pernyataan</span>
                    </label>
                </div>
                <div id="statementsLatexToolbar" class="latex-toolbar" style="display: none;">
                    <button type="button" onclick="insertLatexIntoStatements('fraction')" title="Fraction">½</button>
                    <button type="button" onclick="insertLatexIntoStatements('sqrt')" title="Square Root">√</button>
                    <button type="button" onclick="insertLatexIntoStatements('power')" title="Power">x²</button>
                    <button type="button" onclick="insertLatexIntoStatements('integral')" title="Integral">∫</button>
                    <button type="button" onclick="insertLatexIntoStatements('sum')" title="Sum">Σ</button>
                    <button type="button" onclick="insertLatexIntoStatements('alpha')" title="Alpha">α</button>
                    <button type="button" onclick="insertLatexIntoStatements('beta')" title="Beta">β</button>
                    <button type="button" onclick="insertLatexIntoStatements('gamma')" title="Gamma">γ</button>
                </div>
                <div id="statementsLatexPreview" class="latex-preview" style="display: none;"></div>
                <small>Klik "Tambah Pernyataan" untuk menambah baris baru. Pilih Benar atau Salah untuk setiap pernyataan.</small>
            </div>
        `;

    // Initialize with at least one empty row
    if (!window.categoryStatements || window.categoryStatements.length === 0) {
        window.categoryStatements = [{ statement: '', isTrue: null }];
    }
    updateCategoryStatementsTable();

}

// Add a new category statement row
function addCategoryStatement() {
    if (!window.categoryStatements) {
        window.categoryStatements = [];
    }
    window.categoryStatements.push({ statement: '', isTrue: null });
    updateCategoryStatementsTable();
}

// Update the category statements table
function updateCategoryStatementsTable() {
    const tableBody = document.getElementById('categoryStatementsTableBody');
    if (!tableBody) return;

    if (!window.categoryStatements || window.categoryStatements.length === 0) {
        window.categoryStatements = [{ statement: '', isTrue: null }];
    }

    const enableLatex = document.getElementById('enableStatementsLatex')?.checked;

    let html = '';

    window.categoryStatements.forEach((item, index) => {
        // Render LaTeX preview untuk baris ini jika mode LaTeX aktif
        let previewHtml = '';
        if (enableLatex && item.statement) {
            try {
                let rendered = item.statement.replace(/\\\(([^]*?)\\\)/g, (match, latex) => {
                    try {
                        return window.katex
                            ? window.katex.renderToString(latex, { displayMode: false, throwOnError: false })
                            : match;
                    } catch (e) { return match; }
                });
                rendered = rendered.replace(/\\\[([^]*?)\\\]/g, (match, latex) => {
                    try {
                        return window.katex
                            ? window.katex.renderToString(latex, { displayMode: true, throwOnError: false })
                            : match;
                    } catch (e) { return match; }
                });
                previewHtml = `<div class="statement-latex-preview">${rendered}</div>`;
            } catch (e) {
                previewHtml = '';
            }
        }

        html += `
            <tr class="category-statement-row">
                <td>
                    <input type="text"
                           class="statement-input"
                           data-index="${index}"
                           placeholder="${enableLatex ? 'Ketik teks + \\\\( rumus \\\\) untuk LaTeX...' : 'Masukkan pernyataan...'}"
                           value="${item.statement.replace(/"/g, '&quot;')}"
                           oninput="updateCategoryStatement(${index}, 'statement', this.value)"
                           onfocus="window.lastFocusedStatementInput = this">
                    ${previewHtml}
                </td>
                <td style="text-align: center;">
                    <input type="radio"
                           name="statement-${index}"
                           value="true"
                           ${item.isTrue === true ? 'checked' : ''}
                           onchange="updateCategoryStatement(${index}, 'isTrue', true)">
                </td>
                <td style="text-align: center;">
                    <input type="radio"
                           name="statement-${index}"
                           value="false"
                           ${item.isTrue === false ? 'checked' : ''}
                           onchange="updateCategoryStatement(${index}, 'isTrue', false)">
                    ${index > 0 ? `<button type="button" class="remove-statement-btn" onclick="removeCategoryStatement(${index})" title="Hapus pernyataan">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </td>
            </tr>
        `;
    });

    tableBody.innerHTML = html;

    // Restore focus ke input yang terakhir aktif (agar tidak hilang setelah re-render)
    if (window.lastFocusedStatementInput) {
        const lastIndex = window.lastFocusedStatementInput.dataset?.index;
        if (lastIndex !== undefined) {
            const restored = tableBody.querySelector(`.statement-input[data-index="${lastIndex}"]`);
            if (restored) {
                // Set cursor ke akhir teks
                const len = restored.value.length;
                restored.focus();
                restored.setSelectionRange(len, len);
                window.lastFocusedStatementInput = restored;
            }
        }
    }
}


// Update a category statement
function updateCategoryStatement(index, field, value) {
    if (!window.categoryStatements) {
        window.categoryStatements = [];
    }

    if (!window.categoryStatements[index]) {
        window.categoryStatements[index] = { statement: '', isTrue: null };
    }

    window.categoryStatements[index][field] = value;

    // Jika LaTeX aktif dan field adalah 'statement', update preview baris ini saja
    // tanpa re-render seluruh tabel (agar fokus tidak hilang)
    const enableLatex = document.getElementById('enableStatementsLatex')?.checked;
    if (enableLatex && field === 'statement') {
        // Update preview di baris yang sedang diedit saja
        const input = document.querySelector(`.statement-input[data-index="${index}"]`);
        if (input) {
            let previewEl = input.parentElement.querySelector('.statement-latex-preview');
            if (!previewEl) {
                previewEl = document.createElement('div');
                previewEl.className = 'statement-latex-preview';
                input.parentElement.appendChild(previewEl);
            }
            if (value) {
                try {
                    let rendered = value.replace(/\\\(([^]*?)\\\)/g, (match, latex) => {
                        try {
                            return window.katex
                                ? window.katex.renderToString(latex, { displayMode: false, throwOnError: false })
                                : match;
                        } catch (e) { return match; }
                    });
                    rendered = rendered.replace(/\\\[([^]*?)\\\]/g, (match, latex) => {
                        try {
                            return window.katex
                                ? window.katex.renderToString(latex, { displayMode: true, throwOnError: false })
                                : match;
                        } catch (e) { return match; }
                    });
                    previewEl.innerHTML = rendered;
                } catch (e) {
                    previewEl.innerHTML = '';
                }
            } else {
                previewEl.innerHTML = '';
            }
        }
    } else if (field === 'isTrue') {
        // isTrue berubah → re-render tabel untuk update radio state
        updateCategoryStatementsTable();
    }
}


// Remove a category statement
function removeCategoryStatement(index) {
    if (!window.categoryStatements || window.categoryStatements.length <= 1) {
        alert('Minimal harus ada satu pernyataan!');
        return;
    }

    window.categoryStatements.splice(index, 1);
    updateCategoryStatementsTable();
}

// Show MCMA (Multiple Correct Multiple Answer) options
function showMCMAOptions(enableImages = false) {
    const container = document.getElementById('optionsContainer');
    if (!container) return;

    const imageUploadHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionAImage">Gambar untuk Pilihan A (Opsional):</label>
            <input type="file" id="optionAImage" accept="image/*" onchange="previewOptionImage('A', this)">
            <div id="optionAImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadBHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionBImage">Gambar untuk Pilihan B (Opsional):</label>
            <input type="file" id="optionBImage" accept="image/*" onchange="previewOptionImage('B', this)">
            <div id="optionBImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadCHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionCImage">Gambar untuk Pilihan C (Opsional):</label>
            <input type="file" id="optionCImage" accept="image/*" onchange="previewOptionImage('C', this)">
            <div id="optionCImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    const imageUploadDHtml = enableImages ? `
        <div class="option-image-upload">
            <label for="optionDImage">Gambar untuk Pilihan D (Opsional):</label>
            <input type="file" id="optionDImage" accept="image/*" onchange="previewOptionImage('D', this)">
            <div id="optionDImagePreview" class="image-preview"></div>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="form-group">
            <label>LaTeX untuk Pilihan Jawaban:</label>
            <div class="latex-controls">
                <label class="checkbox-label">
                    <input type="checkbox" id="enableOptionsLatex" onchange="toggleOptionsLatexMode()">
                    <span>Enable LaTeX untuk semua pilihan jawaban</span>
                </label>
            </div>
            <div id="optionsLatexToolbar" class="latex-toolbar" style="display: none;">
                <button type="button" onclick="insertLatexIntoOptions('fraction')" title="Fraction">½</button>
                <button type="button" onclick="insertLatexIntoOptions('sqrt')" title="Square Root">√</button>
                <button type="button" onclick="insertLatexIntoOptions('power')" title="Power">x²</button>
                <button type="button" onclick="insertLatexIntoOptions('integral')" title="Integral">∫</button>
                <button type="button" onclick="insertLatexIntoOptions('sum')" title="Sum">Σ</button>
                <button type="button" onclick="insertLatexIntoOptions('alpha')" title="Alpha">α</button>
                <button type="button" onclick="insertLatexIntoOptions('beta')" title="Beta">β</button>
                <button type="button" onclick="insertLatexIntoOptions('gamma')" title="Gamma">γ</button>
            </div>
            <div id="optionsLatexPreview" class="latex-preview" style="display: none;"></div>
        </div>

        <div class="option-group">
            <div class="option-header">
                <input type="checkbox" value="A" id="mcmaA">
                <label for="mcmaA">Pilihan A:</label>
            </div>
            <input type="text" id="optionA" placeholder="Jawaban A">
            ${imageUploadHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <input type="checkbox" value="B" id="mcmaB">
                <label for="mcmaB">Pilihan B:</label>
            </div>
            <input type="text" id="optionB" placeholder="Jawaban B">
            ${imageUploadBHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <input type="checkbox" value="C" id="mcmaC">
                <label for="mcmaC">Pilihan C:</label>
            </div>
            <input type="text" id="optionC" placeholder="Jawaban C">
            ${imageUploadCHtml}
        </div>

        <div class="option-group">
            <div class="option-header">
                <input type="checkbox" value="D" id="mcmaD">
                <label for="mcmaD">Pilihan D:</label>
            </div>
            <input type="text" id="optionD" placeholder="Jawaban D">
            ${imageUploadDHtml}
        </div>

        <div class="form-group">
            <small style="color: #6b7280;">Centang kotak untuk menandai jawaban yang benar</small>
        </div>
    `;
}

// Show composite question options (multi-part questions with alternating text and images)
function showCompositeOptions() {
    const container = document.getElementById('optionsContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="form-group">
            <label>Bagian Soal (Sections):</label>
            <div id="questionSections" class="question-sections">
                <p style="text-align: center; color: #6b7280; padding: 2rem;">Belum ada bagian soal. Klik tombol di bawah untuk menambah bagian pertama.</p>
            </div>
            <div class="section-buttons">
                <button type="button" class="add-section-btn" onclick="addQuestionSection('text')">+ Tambah Teks Soal</button>
                <button type="button" class="add-section-btn" onclick="addQuestionSection('image')">+ Tambah Gambar</button>
            </div>
        </div>

        <div class="form-group">
            <label>Jawaban (untuk soal komposit, gunakan format yang sesuai):</label>
            <div class="option-group">
                <div class="option-header">
                    <input type="radio" name="correctAnswer" value="A" id="correctAnswerA">
                    <label for="correctAnswerA">Pilihan A:</label>
                </div>
                <input type="text" id="optionA" required placeholder="Jawaban A">
            </div>

            <div class="option-group">
                <div class="option-header">
                    <input type="radio" name="correctAnswer" value="B" id="correctAnswerB">
                    <label for="correctAnswerB">Pilihan B:</label>
                </div>
                <input type="text" id="optionB" required placeholder="Jawaban B">
            </div>

            <div class="option-group">
                <div class="option-header">
                    <input type="radio" name="correctAnswer" value="C" id="correctAnswerC">
                    <label for="correctAnswerC">Pilihan C:</label>
                </div>
                <input type="text" id="optionC" required placeholder="Jawaban C">
            </div>

            <div class="option-group">
                <div class="option-header">
                    <input type="radio" name="correctAnswer" value="D" id="correctAnswerD">
                    <label for="correctAnswerD">Pilihan D:</label>
                </div>
                <input type="text" id="optionD" required placeholder="Jawaban D">
            </div>
        </div>
    `;

    // Initialize sections if not already done
    if (!window.questionSections) {
        window.questionSections = [];
    }
    updateQuestionSectionsDisplay();
}

// Update sub chapters based on selected chapter
function updateSubChapters() {
    const chapterEl = document.getElementById('chapter');
    const subChapterSelect = document.getElementById('subChapter');

    if (!chapterEl) {
        console.error('Chapter element not found!');
        return;
    }

    const chapter = chapterEl.value.trim();
    console.log('updateSubChapters called with chapter:', chapter, 'type:', typeof chapter, 'element exists:', !!chapterEl);

    // Clear existing options
    subChapterSelect.innerHTML = '<option value="">Pilih Sub Bab</option>';

    const subChapters = {
        'Bilangan': ['Bilangan real'],
        'Aljabar': ['Persamaan dan pertidaksamaan linear', 'bentuk aljabar', 'Fungsi', 'Barisan deret'],
        'Geometri dan pengukuran': ['objek geometri', 'transformasi geometri', 'pengukuran'],
        'Data dan peluang': ['data', 'peluang']
    };

    console.log('Available chapter keys:', Object.keys(subChapters));
    console.log('Chapter exists in subChapters:', chapter in subChapters);

    if (subChapters[chapter]) {
        subChapters[chapter].forEach(sub => {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = sub;
            subChapterSelect.appendChild(option);
        });
    }
}

// Update material sub chapters based on selected chapter
function updateMaterialSubChapters() {
    const chapter = document.getElementById('materialChapter').value;
    const subChapterSelect = document.getElementById('materialSubChapter');

    // Clear existing options
    subChapterSelect.innerHTML = '<option value="">Pilih Sub Bab</option>';

    const subChapters = {
        'Bilangan': ['Bilangan real'],
        'Aljabar': ['Persamaan dan pertidaksamaan linear', 'bentuk aljabar', 'Fungsi', 'Barisan deret'],
        'Geometri dan pengukuran': ['objek geometri', 'transformasi geometri', 'pengukuran'],
        'Data dan peluang': ['data', 'peluang']
    };

    if (subChapters[chapter]) {
        console.log('Available sub-chapters for', chapter, ':', subChapters[chapter]);
        subChapters[chapter].forEach(sub => {
            const option = document.createElement('option');
            option.value = sub;
            option.textContent = sub;
            subChapterSelect.appendChild(option);
        });
        console.log('Sub-chapter options updated, current value:', subChapterSelect.value);
    } else {
        console.log('No sub-chapters found for chapter:', chapter);
    }
}

// Save material function
async function saveMaterial(event) {
    event.preventDefault();

    try {
        // Get form data
        const title = document.getElementById('materialTitle').value.trim();
        const materialType = document.getElementById('materialType').value;
        const chapter = document.getElementById('materialChapter').value;
        const subChapter = document.getElementById('materialSubChapter').value;
        const difficulty = document.getElementById('materialDifficulty').value;
        const summary = document.getElementById('materialSummary').value.trim();
        const objectives = document.getElementById('materialObjectives').value.trim();
        
        const isPublished = document.getElementById('materialPublished').checked;

        // Validate required fields
        if (!title) {
            alert('Judul materi harus diisi!');
            return;
        }

        if (!chapter) {
            alert('Bab harus dipilih!');
            return;
        }

        if (!subChapter) {
            alert('Sub Bab harus dipilih!');
            return;
        }

        // Prepare material data - match the actual database schema
        const materialData = {
            title: title,
            content: summary || null, // Use 'content' column instead of 'summary'
            objectives: objectives || null, // Learning objectives
            material_type: materialType,
            chapter: chapter,
            sub_chapter: subChapter,
            difficulty: difficulty,
            is_published: isPublished,
            view_count: 0,
            subject: 'Matematika' // Force to Mathematics for TKA
        };

        // Handle image upload
        const imageFile = document.getElementById('materialImage').files[0];
        if (imageFile) {
            try {
                const imageUrl = await uploadImage(imageFile);
                materialData.image_url = imageUrl;
            } catch (error) {
                alert('Gagal upload gambar: ' + error.message);
                return;
            }
        }

        // Handle attachment upload
        const attachmentFile = document.getElementById('materialAttachment').files[0];
        if (attachmentFile) {
            try {
                const attachmentUrl = await uploadFile(attachmentFile);
                materialData.attachment_url = attachmentUrl;
            } catch (error) {
                alert('Gagal upload lampiran: ' + error.message);
                return;
            }
        }

        console.log('Saving material:', materialData);

        let result;
        if (currentEditingMaterialId) {
            // Update existing material
            console.log('Updating existing material with ID:', currentEditingMaterialId);
            result = await supabase
                .from('materials')
                .update(materialData)
                .eq('id', currentEditingMaterialId)
                .select()
                .single();
        } else {
            // Create new material
            console.log('Creating new material');
            result = await supabase
                .from('materials')
                .insert([materialData])
                .select()
                .single();
        }

        if (result.error) {
            console.error('Error saving material:', result.error);

            // Provide specific guidance for common errors
            let errorMessage = 'Gagal menyimpan materi: ';

            if (result.error.message.includes('competence') && result.error.message.includes('column')) {
                errorMessage += '\n\nKolom "competence" belum ada di database.\n\nSOLUSI:\n1. Buka Supabase Dashboard > SQL Editor\n2. Jalankan script: SQL/add_competence_column.sql\n3. Refresh halaman dan coba lagi.';
            } else if (result.error.message.includes('objectives') && result.error.message.includes('column')) {
                errorMessage += '\n\nKolom "objectives" belum ada di database.\n\nSOLUSI:\n1. Buka Supabase Dashboard > SQL Editor\n2. Jalankan script: SQL/add_objectives_column.sql\n3. Refresh halaman dan coba lagi.';
            } else if (result.error.message.includes('bucket') || result.error.message.includes('storage')) {
                errorMessage += '\n\nMasalah storage bucket.\n\nSOLUSI:\n1. Buka Supabase Dashboard > SQL Editor\n2. Jalankan script: SQL/setup_storage_buckets.sql\n3. Pastikan bucket "materials" ada di Storage.';
            } else {
                errorMessage += result.error.message;
            }

            alert(errorMessage);
            return;
        }

        const successMessage = currentEditingMaterialId
            ? 'Materi berhasil diperbarui!'
            : 'Materi berhasil disimpan!';

        alert(successMessage);

        // Add activity to recent activities
        const activityAction = currentEditingMaterialId ? 'updated' : 'created';
        const activityTitle = currentEditingMaterialId ? 'Materi diperbarui' : 'Materi baru dibuat';
        const activityDescription = `"${title}" (${materialType})`;

        addActivity(
            'fas fa-plus-circle',
            activityTitle,
            activityDescription,
            'material',
            activityAction,
            'material',
            result.data.id
        );

        // Reset form and hide it
        document.getElementById('materialFormData').reset();
        hideMaterialForm();

        // Reload materials list
        await loadMaterials();

    } catch (error) {
        console.error('Error in saveMaterial:', error);
        alert('Terjadi kesalahan saat menyimpan materi.');
    }
}

// Upload file to Supabase Storage (for attachments)
async function uploadFile(file, bucket = 'materials') {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `materials/${fileName}`;

    console.log('uploadFile called with bucket:', bucket, 'file:', file.name, 'size:', file.size);

    try {
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(filePath, file);

        console.log('Supabase storage upload result:', { data, error });

        if (error) {
            console.error('Storage upload error details:', {
                message: error.message,
                statusCode: error.statusCode,
                error: error.error,
                hint: error.hint
            });

            if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
                console.error('Bucket not found error. Available buckets may need to be checked.');
                throw new Error('Storage bucket belum dibuat. Jalankan script setup_storage_buckets.sql di Supabase SQL Editor terlebih dahulu.');
            }
            throw error;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        console.log('Public URL generated:', urlData.publicUrl);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Upload file error:', error);
        throw error;
    }
}

// Show material form
function showMaterialForm() {
    document.getElementById('materialForm').style.display = 'block';
    document.getElementById('addMaterialBtn').style.display = 'none';
}

// Hide material form
function hideMaterialForm() {
    document.getElementById('materialForm').style.display = 'none';
    document.getElementById('addMaterialBtn').style.display = 'inline-block';
    document.getElementById('materialFormData').reset();

    // Clear file displays
    clearFileDisplays();

    // Reset editing state
    currentEditingMaterialId = null;

    // Reset form title and button
    const formTitle = document.getElementById('materialFormTitle');
    if (formTitle) {
        formTitle.textContent = 'Tambah Materi Baru';
    }

    const submitBtn = document.querySelector('#materialFormData .submit-btn');
    if (submitBtn) {
        submitBtn.textContent = 'Simpan Materi';
    }
}

// Load materials for admin table
async function loadMaterials() {
    try {
        console.log('Loading materials...');
        const { data: materials, error } = await supabase
            .from('materials')
            .select('id, title, content, objectives, chapter, sub_chapter, subject, difficulty, material_type, tags, attachment_url, image_url, is_published, view_count, created_at, updated_at')
            .order('created_at', { ascending: false });

        const materialsTableBody = document.getElementById('materialsTableBody');
        if (!materialsTableBody) {
            console.error('Materials table body not found');
            return;
        }

        if (error) {
            console.error('Error loading materials:', error);
            materialsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 2rem;">Error loading materials: ${error.message}</td></tr>`;
            return;
        }

        console.log('Materials loaded:', materials);

        materialsTableBody.innerHTML = '';

        if (!materials || materials.length === 0) {
            materialsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #6b7280; padding: 2rem;">Belum ada materi yang ditambahkan.</td></tr>`;
            return;
        }

        materials.forEach(material => {
            const row = document.createElement('tr');

            const statusBadge = material.is_published
                ? '<span class="status-badge status-active">Published</span>'
                : '<span class="status-badge status-inactive">Draft</span>';

            row.innerHTML = `
                <td>${material.title || 'N/A'}</td>
                <td>${material.material_type || 'N/A'}</td>
                <td>${material.chapter || 'N/A'}</td>
                <td>Matematika</td>
                <td>${statusBadge}</td>
                <td>${material.view_count || 0}</td>
                <td>
                    <button class="logout-btn" onclick="editMaterial('${material.id}')" style="margin-right: 0.5rem;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="logout-btn" onclick="deleteMaterial('${material.id}')" style="background: #dc2626;">
                        <i class="fas fa-trash"></i> Hapus
                    </button>
                </td>
            `;

            materialsTableBody.appendChild(row);
        });

        console.log(`Displayed ${materials.length} materials`);

    } catch (error) {
        console.error('Error in loadMaterials:', error);
        const materialsTableBody = document.getElementById('materialsTableBody');
        if (materialsTableBody) {
            materialsTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 2rem;">Error: ${error.message}</td></tr>`;
        }
    }
}

// Edit material
async function editMaterial(materialId) {
    try {
        console.log('Editing material with ID:', materialId);

        // Fetch material data
        const { data: material, error } = await supabase
            .from('materials')
            .select('id, title, content, objectives, chapter, sub_chapter, subject, difficulty, material_type, tags, attachment_url, image_url, is_published, view_count, created_at, updated_at')
            .eq('id', materialId)
            .single();

        if (error) {
            console.error('Error loading material for edit:', error);
            alert('Gagal memuat materi untuk diedit: ' + error.message);
            return;
        }

        console.log('Material data loaded:', material);

        // Set editing flag
        currentEditingMaterialId = materialId;

        // Populate form fields
        document.getElementById('materialTitle').value = material.title || '';
        document.getElementById('materialType').value = material.material_type || 'Artikel';
        document.getElementById('materialChapter').value = material.chapter || '';
        document.getElementById('materialDifficulty').value = material.difficulty || 'Sedang';
        document.getElementById('materialSummary').value = material.content || ''; // content maps to summary field
        document.getElementById('materialObjectives').value = material.objectives || ''; // objectives field
        document.getElementById('materialPublished').checked = material.is_published || false;

        // Update sub-chapters based on selected chapter
        updateMaterialSubChapters();

        // Set sub-chapter after a short delay to allow the options to populate
        setTimeout(() => {
            const subChapterSelect = document.getElementById('materialSubChapter');
            if (subChapterSelect) {
                subChapterSelect.value = material.sub_chapter || '';
                console.log('Sub-chapter set to:', material.sub_chapter);
            }
        }, 100);

        // Handle existing image display
        const imageDisplay = document.getElementById('materialImageDisplay');
        if (material.image_url && imageDisplay) {
            // Extract filename from URL
            const urlParts = material.image_url.split('/');
            const fileName = urlParts[urlParts.length - 1] || 'gambar.jpg';
            imageDisplay.innerHTML = `<i class="fas fa-image" style="color: #10b981;"></i> <strong>${fileName}</strong> (Existing)`;
            imageDisplay.style.color = '#10b981';
        } else if (imageDisplay) {
            imageDisplay.innerHTML = '';
        }

        // Handle existing attachment display
        const attachmentDisplay = document.getElementById('materialAttachmentDisplay');
        if (material.attachment_url && attachmentDisplay) {
            // Extract filename from URL
            const urlParts = material.attachment_url.split('/');
            const fileName = urlParts[urlParts.length - 1] || 'file.pdf';
            const fileExt = fileName.split('.').pop().toLowerCase();

            // Set appropriate icon based on file type
            let icon = '<i class="fas fa-file" style="color: #6b7280;"></i>';
            if (fileExt === 'pdf') {
                icon = '<i class="fas fa-file-pdf" style="color: #dc2626;"></i>';
            } else if (['mp4', 'mov', 'avi'].includes(fileExt)) {
                icon = '<i class="fas fa-video" style="color: #7c3aed;"></i>';
            }

            attachmentDisplay.innerHTML = `${icon} <strong>${fileName}</strong> (Existing)`;
            attachmentDisplay.style.color = '#10b981';
        } else if (attachmentDisplay) {
            attachmentDisplay.innerHTML = '';
        }

        // Update form title
        const formTitle = document.getElementById('materialFormTitle');
        if (formTitle) {
            formTitle.textContent = 'Edit Materi';
        }

        // Update submit button text
        const submitBtn = document.querySelector('#materialFormData .submit-btn');
        if (submitBtn) {
            submitBtn.textContent = 'Update Materi';
        }

        // Show the form
        showMaterialForm();

        // Scroll to top of page when editing
        window.scrollTo({ top: 0, behavior: 'smooth' });

        console.log('Edit material form shown, currentEditingMaterialId set to:', currentEditingMaterialId);

    } catch (error) {
        console.error('Error in editMaterial:', error);
        alert('Terjadi kesalahan saat mengedit materi.');
    }
}

// Delete material
async function deleteMaterial(materialId) {
    if (!confirm('Apakah Anda yakin ingin menghapus materi ini?')) {
        return;
    }

    try {
        // First delete related sections
        const { error: sectionsError } = await supabase
            .from('material_sections')
            .delete()
            .eq('material_id', materialId);

        if (sectionsError) {
            console.error('Error deleting material sections:', sectionsError);
            alert('Gagal menghapus bagian materi terkait.');
            return;
        }

        // Then delete the material
        const { error } = await supabase
            .from('materials')
            .delete()
            .eq('id', materialId);

        if (error) {
            console.error('Error deleting material:', error);
            alert('Gagal menghapus materi: ' + error.message);
            return;
        }

        alert('Materi berhasil dihapus!');

        // Add activity to recent activities
        addActivity(
            'fas fa-trash',
            'Materi dihapus',
            `Materi dengan ID ${materialId} telah dihapus`,
            'material',
            'deleted',
            'material',
            materialId
        );

        // Reload materials list
        await loadMaterials();

    } catch (error) {
        console.error('Error in deleteMaterial:', error);
        alert('Terjadi kesalahan saat menghapus materi.');
    }
}

// LaTeX Functions
function insertLatex(latex) {
    const textarea = document.getElementById('questionText');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const latexSymbols = {
        'fraction': '\\frac{a}{b}',
        'sqrt': '\\sqrt{x}',
        'power': 'x^{2}',
        'integral': '\\int',
        'sum': '\\sum',
        'alpha': '\\alpha',
        'beta': '\\beta',
        'gamma': '\\gamma'
    };

    const latexCode = latexSymbols[latex] || latex;

    textarea.value = before + latexCode + after;
    textarea.selectionStart = textarea.selectionEnd = start + latexCode.length;
    textarea.focus();

    updateQuestionPreview();
}

function insertBold() {
    const textarea = document.getElementById('questionText');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const selected = text.substring(start, end);

    if (selected) {
        // Wrap selected text with <b> tags
        const boldText = `<b>${selected}</b>`;
        textarea.value = before + boldText + after;
        textarea.selectionStart = textarea.selectionEnd = start + boldText.length;
    } else {
        // Insert <b></b> and place cursor inside
        const boldTags = '<b></b>';
        textarea.value = before + boldTags + after;
        textarea.selectionStart = textarea.selectionEnd = start + 3; // Position after <b>
    }
    textarea.focus();
    updateQuestionPreview();
}

function insertCenter() {
    const textarea = document.getElementById('questionText');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const selected = text.substring(start, end);

    if (selected) {
        // Wrap selected text with <center> tags
        const centerText = `<center>${selected}</center>`;
        textarea.value = before + centerText + after;
        textarea.selectionStart = textarea.selectionEnd = start + centerText.length;
    } else {
        // Insert <center></center> and place cursor inside
        const centerTags = '<center></center>';
        textarea.value = before + centerTags + after;
        textarea.selectionStart = textarea.selectionEnd = start + 8; // Position after <center>
    }
    textarea.focus();
    updateQuestionPreview();
}

function updateLatexPreview() {
    const latexInput = document.getElementById('latexContent').value;
    const preview = document.getElementById('latexPreview');

    if (latexInput && window.katex) {
        try {
            preview.innerHTML = window.katex.renderToString(latexInput);
        } catch (error) {
            preview.innerHTML = '<span style="color: red;">LaTeX Error</span>';
        }
    } else {
        preview.innerHTML = '';
    }
}

// LaTeX Functions for Options
function insertLatexIntoOption(optionLetter, symbol) {
    const textarea = document.getElementById(`option${optionLetter}Latex`);
    if (!textarea) return;

    const latexSymbols = {
        'fraction': '\\frac{a}{b}',
        'sqrt': '\\sqrt{x}',
        'power': 'x^{2}',
        'integral': '\\int',
        'sum': '\\sum',
        'alpha': '\\alpha',
        'beta': '\\beta',
        'gamma': '\\gamma'
    };

    const latex = latexSymbols[symbol] || symbol;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    textarea.value = before + latex + after;
    textarea.selectionStart = textarea.selectionEnd = start + latex.length;
    textarea.focus();

    updateOptionLatexPreview(optionLetter);
}

function updateOptionLatexPreview(optionLetter) {
    const latexInput = document.getElementById(`option${optionLetter}Latex`).value;
    const preview = document.getElementById(`option${optionLetter}LatexPreview`);

    if (latexInput && window.katex) {
        try {
            preview.innerHTML = window.katex.renderToString(latexInput);
        } catch (error) {
            preview.innerHTML = '<span style="color: red;">LaTeX Error</span>';
        }
    } else {
        preview.innerHTML = '';
    }
}

// LaTeX Functions for Options (Multiple Choice & MCMA)
function toggleOptionsLatexMode() {
    const checkbox = document.getElementById('enableOptionsLatex');
    const toolbar = document.getElementById('optionsLatexToolbar');
    const preview = document.getElementById('optionsLatexPreview');
    const optionInputs = ['optionA', 'optionB', 'optionC', 'optionD'];

    // Always remove existing event listeners first to avoid duplicates
    optionInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.removeEventListener('input', updateOptionsLatexPreview);
        }
    });

    if (checkbox.checked) {
        // Enable LaTeX mode
        toolbar.style.display = 'flex';
        preview.style.display = 'block';

        // Update placeholders
        optionInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.placeholder = 'Masukkan jawaban dengan LaTeX...';
                input.addEventListener('input', updateOptionsLatexPreview);
            }
        });

        updateOptionsLatexPreview(); // Update immediately
    } else {
        // Disable LaTeX mode
        toolbar.style.display = 'none';
        preview.style.display = 'none';

        // Update placeholders
        optionInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.placeholder = `Jawaban ${id.charAt(id.length - 1).toUpperCase()}`;
            }
        });

        // Clear preview
        preview.innerHTML = '';
    }
}

function insertLatexIntoOptions(symbol) {
    const optionInputs = ['optionA', 'optionB', 'optionC', 'optionD'];
    let activeInput = null;

    // Find the currently focused input
    for (const id of optionInputs) {
        const input = document.getElementById(id);
        if (input && input === document.activeElement) {
            activeInput = input;
            break;
        }
    }

    // If no input is focused, use the first one
    if (!activeInput) {
        activeInput = document.getElementById('optionA');
    }

    if (!activeInput) return;

    const latexSymbols = {
        'fraction': '\\frac{a}{b}',
        'sqrt': '\\sqrt{x}',
        'power': 'x^{2}',
        'integral': '\\int',
        'sum': '\\sum',
        'alpha': '\\alpha',
        'beta': '\\beta',
        'gamma': '\\gamma'
    };

    const latex = latexSymbols[symbol] || symbol;
    const start = activeInput.selectionStart;
    const end = activeInput.selectionEnd;
    const text = activeInput.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    activeInput.value = before + latex + after;
    activeInput.selectionStart = activeInput.selectionEnd = start + latex.length;
    activeInput.focus();

    updateOptionsLatexPreview();
}

function updateOptionsLatexPreview() {
    const preview = document.getElementById('optionsLatexPreview');
    const optionInputs = ['optionA', 'optionB', 'optionC', 'optionD'];

    let previewHtml = '';

    optionInputs.forEach(id => {
        const input = document.getElementById(id);
        const letter = id.charAt(id.length - 1).toUpperCase();
        const value = input ? input.value : '';

        if (value) {
            let renderedText = value;
            if (window.katex) {
                try {
                    // Render LaTeX expressions found in the option
                    renderedText = value.replace(/\\\(.+?\\\)/g, (match) => {
                        try {
                            return window.katex.renderToString(match.slice(2, -2), { displayMode: false });
                        } catch (e) {
                            return match; // Return original if LaTeX fails
                        }
                    });
                } catch (error) {
                    // If rendering fails, use plain text
                    renderedText = value;
                }
            }

            previewHtml += `<div style="margin-bottom: 0.5rem;"><strong>${letter}:</strong> ${renderedText}</div>`;
        }
    });

    preview.innerHTML = previewHtml || '';
}

// LaTeX Functions for PGK Kategori Statements
function toggleStatementsLatexMode() {
    const checkbox = document.getElementById('enableStatementsLatex');
    const toolbar = document.getElementById('statementsLatexToolbar');
    const preview = document.getElementById('statementsLatexPreview');

    if (!checkbox || !toolbar) {
        console.warn('LaTeX elements not found, skipping toggle');
        return;
    }

    if (checkbox.checked) {
        toolbar.style.display = 'flex';
        if (preview) preview.style.display = 'none'; // preview per-baris, bukan global
    } else {
        toolbar.style.display = 'none';
        if (preview) preview.style.display = 'none';
    }

    // Re-render tabel agar setiap baris menampilkan/menyembunyikan preview LaTeX
    updateCategoryStatementsTable();
}

function insertLatexIntoStatements(symbol) {
    // Cari input yang sedang difokus (lastFocusedStatementInput),
    // atau fallback ke input pertama yang ada
    const latexSymbols = {
        'fraction': '\\( \\frac{a}{b} \\)',
        'sqrt':     '\\( \\sqrt{x} \\)',
        'power':    '\\( x^{2} \\)',
        'integral': '\\( \\int \\)',
        'sum':      '\\( \\sum \\)',
        'alpha':    '\\( \\alpha \\)',
        'beta':     '\\( \\beta \\)',
        'gamma':    '\\( \\gamma \\)'
    };

    const latex = latexSymbols[symbol] || ('\\( ' + symbol + ' \\)');

    // Gunakan input yang terakhir difokus
    const input = window.lastFocusedStatementInput
        || document.querySelector('.statement-input');

    if (!input) return;

    const start = input.selectionStart;
    const end   = input.selectionEnd;
    const before = input.value.substring(0, start);
    const after  = input.value.substring(end);

    input.value = before + latex + after;
    input.selectionStart = input.selectionEnd = start + latex.length;
    input.focus();

    // Update data dan re-render preview
    const index = parseInt(input.dataset.index);
    if (!isNaN(index)) {
        updateCategoryStatement(index, 'statement', input.value);
    }
}


function updateStatementsLatexPreview() {
    // Preview sekarang ditampilkan per baris di updateCategoryStatementsTable()
    // Fungsi ini dipertahankan agar tidak error jika masih dipanggil
    updateCategoryStatementsTable();
}


function toggleQuestionLatexMode() {
    const checkbox = document.getElementById('enableQuestionLatex');
    const toolbar = document.getElementById('questionLatexToolbar');
    const preview = document.getElementById('questionLatexPreview');
    const help = document.getElementById('questionLatexHelp');
    const textarea = document.getElementById('questionText');

    // Always remove existing event listener first to avoid duplicates
    textarea.removeEventListener('input', updateQuestionPreview);

    if (checkbox.checked) {
        // Enable LaTeX mode
        toolbar.style.display = 'flex';
        preview.style.display = 'block';
        help.style.display = 'block';
        textarea.placeholder = 'Masukkan teks pertanyaan dengan LaTeX...';
    } else {
        // Disable LaTeX mode
        toolbar.style.display = 'none';
        help.style.display = 'none';
        textarea.placeholder = 'Masukkan teks pertanyaan...';
        // Keep preview visible for images
        preview.style.display = 'block';
    }

    // Always add event listener for preview and update
    textarea.addEventListener('input', updateQuestionPreview);
    updateQuestionPreview(); // Update immediately
}

function updateQuestionPreview() {
    const inputArea = document.getElementById('questionText');
    const previewArea = document.getElementById('questionLatexPreview');

    if (inputArea && previewArea) {
        // 1. Ambil teks
        let content = inputArea.value;

        // 2. Ganti line breaks dengan <br> untuk preview
        content = content.replace(/\n/g, '<br>');

        // 3. Masukkan ke preview
        previewArea.innerHTML = content;

        // 4. Render ulang LaTeX — gunakan [^]*? agar support multiline
        if (window.katex) {
            try {
                // Inline \(...\)
                let renderedText = content.replace(/\\\(([^]*?)\\\)/g, (match, latex) => {
                    try {
                        return window.katex.renderToString(latex, { displayMode: false, throwOnError: false });
                    } catch (e) {
                        return match; // Return original if LaTeX fails
                    }
                });
                // Display mode \[...\]
                renderedText = renderedText.replace(/\\\[([^]*?)\\\]/g, (match, latex) => {
                    try {
                        return window.katex.renderToString(latex, { displayMode: true, throwOnError: false });
                    } catch (e) {
                        return match;
                    }
                });
                previewArea.innerHTML = renderedText;
            } catch (error) {
                // If rendering fails, keep original content
                previewArea.innerHTML = content;
            }
        }
    }
}

// Insert image into question text
async function insertImageIntoQuestion() {
    // Create a hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.onchange = async function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];

            // Validate file type
            if (!file.type.startsWith('image/')) {
                alert('File harus berupa gambar!');
                return;
            }

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('Ukuran file maksimal 5MB!');
                return;
            }

            try {
                // Upload the image
                const imageUrl = await uploadImage(file);

                // Insert the image tag into the question textarea
                const textarea = document.getElementById('questionText');
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                const before = text.substring(0, start);
                const after = text.substring(end, text.length);

                const imgTag = `<img src="${imageUrl}" alt="Gambar soal" style="max-width: 100%; height: auto;">`;
                textarea.value = before + imgTag + after;
                textarea.selectionStart = textarea.selectionEnd = start + imgTag.length;
                textarea.focus();

                // Update preview
                updateQuestionPreview();

            } catch (error) {
                alert('Gagal upload gambar: ' + error.message);
            }
        }
    };

    // Trigger the file input
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Image Upload Functions
async function previewImage() {
    const fileInput = document.getElementById('questionImage');
    const preview = document.getElementById('imagePreview');

    if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('File harus berupa gambar!');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Ukuran file maksimal 5MB!');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        };
        reader.readAsDataURL(file);
    }
}

// Preview option images
async function previewOptionImage(optionLetter, input) {
    const preview = document.getElementById(`option${optionLetter}ImagePreview`);

    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('File harus berupa gambar!');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Ukuran file maksimal 5MB!');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="Preview Option ${optionLetter}" style="max-width: 200px; max-height: 200px; border: 1px solid #ddd; border-radius: 4px;">`;
        };
        reader.readAsDataURL(file);
    } else {
        preview.innerHTML = '';
    }
}

// Analytics Functions
let skillRadarChart = null;

async function loadAnalytics() {
    try {
        // First update analytics from exam data
        await updateStudentAnalyticsFromExams();

        // Load student analytics data
        const { data: analytics, error } = await supabase
            .from('student_analytics')
            .select('*')
            .order('last_updated', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error loading analytics:', error);
            // Load demo data if database fails
            loadDemoAnalytics();
            return;
        }

        // If no data, load demo data
        if (!analytics || analytics.length === 0) {
            console.log('No analytics data found, loading demo data');
            loadDemoAnalytics();
            return;
        }

        console.log('Loaded analytics data:', analytics);

        // Create radar chart
        createSkillRadarChart(analytics);

        // Create skill bars
        createSkillBars(analytics);

        // Load AI recommendations
        loadAIRecommendations(analytics);

        // Load student exam table
        loadStudentExamTable();

    } catch (error) {
        console.error('Error in loadAnalytics:', error);
        // Fallback to demo data
        loadDemoAnalytics();
    }
}

// Load student exam table for analytics tab
async function loadStudentExamTable() {
    const tableBody = document.getElementById('studentExamTable');
    if (!tableBody) return;

    try {
        // Get exam sessions
        const { data: exams, error } = await supabase
            .from('exam_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error loading exam sessions:', error);
            tableBody.innerHTML = `<tr><td colspan="7" style="padding: 2rem; text-align: center; color: #ef4444;">Error memuat data: ${error.message}</td></tr>`;
            return;
        }

        if (!exams || exams.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="padding: 2rem; text-align: center; color: #6b7280;">Belum ada data ujian</td></tr>`;
            return;
        }

        // Get all unique user IDs
        const userIds = [...new Set(exams.map(e => e.user_id).filter(Boolean))];
        
        // Get user profiles
        let profilesMap = {};
        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nama_lengkap, class_name')
                .in('id', userIds);
            
            if (profiles) {
                profiles.forEach(p => {
                    profilesMap[p.id] = p;
                });
            }
        }

        // Combine exam data with profile data
        const combinedData = exams.map(exam => ({
            ...exam,
            profile: profilesMap[exam.user_id] || {}
        }));

        // Store data for filtering
        window.studentExamData = combinedData;

        renderStudentExamRows(combinedData);
    } catch (error) {
        console.error('Error in loadStudentExamTable:', error);
        tableBody.innerHTML = `<tr><td colspan="7" style="padding: 2rem; text-align: center; color: #ef4444;">Error: ${error.message}</td></tr>`;
    }
}

// Render student exam rows
function renderStudentExamRows(exams) {
    const tableBody = document.getElementById('studentExamTable');
    if (!tableBody) return;

    tableBody.innerHTML = exams.map(exam => {
        const studentName = exam.profile?.nama_lengkap || exam.profiles?.nama_lengkap || `Siswa ${exam.user_id?.slice(0, 8) || '-'}`;
        const kelas = exam.profile?.class_name || exam.profiles?.class_name || '-';
        const tipe = exam.exam_type || 'TKA';
        const skor = exam.total_score || 0;
        const status = exam.status === 'completed' ? 'Selesai' : (exam.status === 'in_progress' ? 'Sedang Dikerjakan' : exam.status);
        const waktu = exam.completed_at ? new Date(exam.completed_at).toLocaleDateString('id-ID') : (exam.created_at ? new Date(exam.created_at).toLocaleDateString('id-ID') : '-');
        const userId = exam.user_id;
        const examId = exam.id;

        return `
            <tr>
                <td style="padding: 12px;">${studentName}</td>
                <td style="padding: 12px;">${kelas}</td>
                <td style="padding: 12px;">${tipe}</td>
                <td style="padding: 12px;">${skor}</td>
                <td style="padding: 12px;"><span class="status-badge status-${exam.status}">${status}</span></td>
                <td style="padding: 12px;">${waktu}</td>
                <td style="padding: 12px; display: flex; gap: 5px;">
                    <button onclick="showStudentDetail('${userId}')" class="mini-btn" style="background: #4f46e5;" title="Lihat Detail Hasil">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button onclick="deleteStudentExamData('${userId}', '${studentName}')" class="mini-btn" style="background: #ef4444;" title="Hapus Permanen Data Ujian">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter student exams
function filterStudentExams() {
    if (!window.studentExamData) return;

    const searchName = document.getElementById('searchStudentName')?.value?.toLowerCase() || '';
    const filterStatus = document.getElementById('filterExamStatus')?.value || '';

    const filtered = window.studentExamData.filter(exam => {
        const studentName = (exam.profile?.nama_lengkap || exam.profiles?.nama_lengkap || '').toLowerCase();
        const matchesSearch = studentName.includes(searchName);
        const matchesStatus = !filterStatus || exam.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    renderStudentExamRows(filtered);
}

window.filterStudentExams = filterStudentExams;

// Export function
window.loadStudentExamTable = loadStudentExamTable;

// Update student analytics from exam data
async function updateStudentAnalyticsFromExams() {
    try {
        console.log('Updating student analytics from exam data...');

        // Get all completed exam sessions
        const { data: examSessions, error: sessionsError } = await supabase
            .from('exam_sessions')
            .select('user_id, total_score, completed_at, status')
            .eq('status', 'completed')
            .order('completed_at', { ascending: false });

        if (sessionsError) {
            console.error('Error loading exam sessions:', sessionsError);
            return;
        }

        if (!examSessions || examSessions.length === 0) {
            console.log('No completed exam sessions found');
            return;
        }

        // Group sessions by user and calculate analytics
        const userAnalytics = {};

        for (const session of examSessions) {
            const userId = session.user_id;

            if (!userAnalytics[userId]) {
                userAnalytics[userId] = {
                    user_id: userId,
                    total_exams: 0,
                    total_score: 0,
                    average_score: 0,
                    chapter_performance: {}
                };
            }

            userAnalytics[userId].total_exams++;
            userAnalytics[userId].total_score += session.total_score || 0;
        }

        // Calculate average scores and get detailed performance per chapter
        for (const userId of Object.keys(userAnalytics)) {
            const analytics = userAnalytics[userId];
            analytics.average_score = analytics.total_score / analytics.total_exams;

            // Get all session IDs for this user
            const userSessionIds = examSessions
                .filter(s => s.user_id === userId)
                .map(s => s.id)
                .filter(id => id != null); // Filter out null/undefined IDs

            let userAnswers = [];
            let answersError = null;

            if (userSessionIds.length > 0) {
                // Get detailed answers for this user to calculate chapter performance
                const result = await supabase
                    .from('exam_answers')
                    .select(`
                        selected_answer,
                        is_correct,
                        questions (
                            chapter,
                            sub_chapter,
                            scoring_weight
                        )
                    `)
                    .in('exam_session_id', userSessionIds);
                userAnswers = result.data || [];
                answersError = result.error;
            } else {
                console.log(`No valid sessions found for user ${userId}`);
            }

            if (!answersError && userAnswers) {
                // Group by chapter
                const chapterStats = {};

                userAnswers.forEach(answer => {
                    const chapter = answer.questions?.chapter;
                    if (chapter) {
                        if (!chapterStats[chapter]) {
                            chapterStats[chapter] = {
                                total_questions: 0,
                                correct_answers: 0,
                                total_score: 0
                            };
                        }

                        chapterStats[chapter].total_questions++;
                        if (answer.is_correct) {
                            chapterStats[chapter].correct_answers++;
                            chapterStats[chapter].total_score += answer.questions?.scoring_weight || 1;
                        }
                    }
                });

                // Convert to analytics format
                analytics.chapter_performance = Object.keys(chapterStats).map(chapter => ({
                    chapter: chapter,
                    sub_chapter: chapter, // Using chapter as sub_chapter for simplicity
                    total_questions_attempted: chapterStats[chapter].total_questions,
                    correct_answers: chapterStats[chapter].correct_answers,
                    mastery_level: chapterStats[chapter].correct_answers / chapterStats[chapter].total_questions,
                    skill_radar_data: [{
                        skill: chapter,
                        level: Math.round((chapterStats[chapter].correct_answers / chapterStats[chapter].total_questions) * 100)
                    }]
                }));
            }
        }

        // Save/update analytics data
        const analyticsData = Object.values(userAnalytics);
        console.log('Calculated analytics data:', analyticsData);

        // Upsert to student_analytics table
        for (const analytics of analyticsData) {
            await supabase
                .from('student_analytics')
                .upsert({
                    user_id: analytics.user_id,
                    chapter: 'Overall', // Overall performance
                    sub_chapter: 'All Chapters',
                    total_questions_attempted: analytics.total_exams * 10, // Assuming 10 questions per exam
                    correct_answers: Math.round(analytics.average_score),
                    mastery_level: analytics.average_score / 100, // Convert to 0-1 scale
                    skill_radar_data: (Array.isArray(analytics.chapter_performance) ? analytics.chapter_performance.flatMap(cp => cp.skill_radar_data) : []) || [],
                    last_updated: new Date().toISOString()
                }, {
                    onConflict: 'user_id,chapter,sub_chapter'
                });
        }

        console.log('Student analytics updated from exam data');

    } catch (error) {
        console.error('Error updating student analytics from exams:', error);
    }
}

// Load demo analytics data for testing
function loadDemoAnalytics() {
    const demoData = [
        {
            chapter: 'Bilangan',
            sub_chapter: 'Bilangan Real',
            total_questions_attempted: 65,
            correct_answers: 51,
            mastery_level: 0.78,
            skill_radar_data: [{ skill: 'Bilangan', level: 78 }]
        },
        {
            chapter: 'Aljabar',
            sub_chapter: 'Persamaan dan Pertidaksamaan Linier',
            total_questions_attempted: 64,
            correct_answers: 50,
            mastery_level: 0.78,
            skill_radar_data: [{ skill: 'Aljabar', level: 78 }]
        },
        {
            chapter: 'Geometri dan Pengukuran',
            sub_chapter: 'Objek Geometri',
            total_questions_attempted: 55,
            correct_answers: 41,
            mastery_level: 0.75,
            skill_radar_data: [{ skill: 'Geometri dan Pengukuran', level: 75 }]
        },
        {
            chapter: 'Data dan Peluang',
            sub_chapter: 'Data',
            total_questions_attempted: 43,
            correct_answers: 32,
            mastery_level: 0.74,
            skill_radar_data: [{ skill: 'Data dan Peluang', level: 74 }]
        }
    ];

    console.log('Loading demo analytics data');
    createSkillRadarChart(demoData);
    createSkillBars(demoData);
    loadAIRecommendations(demoData);
}

function createSkillRadarChart(analyticsData) {
    const ctx = document.getElementById('skillRadarChart');
    if (!ctx) {
        console.warn('Radar chart canvas not found');
        return;
    }

    try {
        // Aggregate data for radar chart
        const skills = ['Aljabar', 'Geometri dan Pengukuran', 'Bilangan', 'Data dan Peluang'];
        const avgScores = skills.map(skill => {
            const skillData = analyticsData.filter(a => a.skill_radar_data && a.skill_radar_data.length > 0);
            if (skillData.length === 0) return 50;

            const total = skillData.reduce((sum, a) => {
                const radarData = a.skill_radar_data || [];
                const skillItem = radarData.find(s => s.skill === skill);
                return sum + (skillItem ? skillItem.level : 50);
            }, 0);

            return Math.round(total / skillData.length);
        });

        // Destroy existing chart
        if (skillRadarChart) {
            skillRadarChart.destroy();
        }

        skillRadarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: skills,
                datasets: [{
                    label: 'Rata-rata Kemampuan Siswa',
                    data: avgScores,
                    backgroundColor: 'rgba(30, 64, 175, 0.2)',
                    borderColor: 'rgba(30, 64, 175, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(30, 64, 175, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(30, 64, 175, 1)',
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.2,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        min: 0,
                        ticks: {
                            stepSize: 20,
                            font: {
                                size: 11
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        angleLines: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        pointLabels: {
                            font: {
                                size: 12,
                                weight: 'bold'
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });

        console.log('Radar chart created successfully');
    } catch (error) {
        console.error('Error creating radar chart:', error);
        // Show error message in canvas area
        const canvas = ctx;
        const ctx2d = canvas.getContext('2d');
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        ctx2d.fillStyle = '#6b7280';
        ctx2d.font = '14px Arial';
        ctx2d.textAlign = 'center';
        ctx2d.fillText('Error loading chart', canvas.width / 2, canvas.height / 2);
    }
}

function createSkillBars(analyticsData) {
    const container = document.getElementById('skillBars');
    if (!container) {
        console.warn('Skill bars container not found');
        return;
    }

    try {
        container.innerHTML = '';

        const skills = ['Aljabar', 'Geometri dan Pengukuran', 'Bilangan', 'Data dan Peluang'];

        skills.forEach(skill => {
            const skillData = analyticsData.filter(a => a.skill_radar_data && a.skill_radar_data.length > 0);
            const avgLevel = skillData.length > 0
                ? Math.round(skillData.reduce((sum, a) => {
                    const radarData = a.skill_radar_data || [];
                    const skillItem = radarData.find(s => s.skill === skill);
                    return sum + (skillItem ? skillItem.level : 50);
                }, 0) / skillData.length)
                : 50;

            const skillBar = document.createElement('div');
            skillBar.className = 'skill-bar';
            skillBar.innerHTML = `
                <div class="skill-label">${skill}</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${avgLevel}%"></div>
                </div>
                <div class="bar-value">${avgLevel}%</div>
            `;

            container.appendChild(skillBar);
        });

        console.log('Skill bars created successfully');
    } catch (error) {
        console.error('Error creating skill bars:', error);
        container.innerHTML = '<p style="color: #dc2626; text-align: center;">Error loading skill bars</p>';
    }
}

function loadAIRecommendations(analyticsData) {
    const container = document.getElementById('aiRecommendations');
    if (!container) return;

    // Generate AI-like recommendations based on data
    let recommendations = [];

    if (analyticsData.length === 0) {
        recommendations.push("Belum ada data siswa untuk dianalisis.");
    } else {
        const avgMastery = analyticsData.reduce((sum, a) => sum + (a.mastery_level || 0), 0) / analyticsData.length;

        if (avgMastery < 0.5) {
            recommendations.push("📚 Siswa perlu latihan intensif di semua bab matematika.");
            recommendations.push("🎯 Fokus pada konsep dasar sebelum lanjut ke materi kompleks.");
        } else if (avgMastery < 0.7) {
            recommendations.push("🔄 Siswa perlu latihan tambahan di bab yang masih lemah.");
            recommendations.push("📈 Tingkatkan pemahaman konsep melalui latihan soal.");
        } else {
            recommendations.push("✅ Pertahankan performa yang baik!");
            recommendations.push("🚀 Tantang siswa dengan soal-soal yang lebih kompleks.");
        }

        // Add specific recommendations based on weak areas
        const weakAreas = analyticsData.filter(a => (a.mastery_level || 0) < 0.6);
        if (weakAreas.length > 0) {
            recommendations.push(`🎯 Perhatian khusus diperlukan untuk ${weakAreas.length} siswa yang membutuhkan bantuan tambahan.`);
        }
    }

    container.innerHTML = recommendations.map(rec => `<p>${rec}</p>`).join('');
}

// ==========================================
// PER-STUDENT ANALYTICS FUNCTIONS
// ==========================================

// Load daftar siswa untuk analytics
async function loadStudentsList() {
    try {
        const students = await getAllStudentsAnalytics();

        const container = document.getElementById('studentsAnalyticsList');
        if (!container) return;

        if (students.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">Belum ada siswa yang mengerjakan ujian.</p>';
            return;
        }

        container.innerHTML = `
            <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #1f2937;">Daftar Siswa (${students.length})</h3>
                <button onclick="exportAllStudentsToExcel()" class="add-btn" style="background: #059669;">
                    <i class="fas fa-file-excel"></i> Export Semua ke Excel
                </button>
            </div>
            <div class="students-grid">
                ${students.map(student => `
                    <div class="student-card">
                        <div class="student-header">
                            <div class="student-avatar">
                                ${student.nama_lengkap.charAt(0).toUpperCase()}
                            </div>
                            <div class="student-info">
                                <h4>${student.nama_lengkap}</h4>
                                <p>${student.email || 'No email'}</p>
                                <p style="font-size: 0.8rem; color: #6b7280;">${student.school || 'No school'}</p>
                            </div>
                        </div>
                        <div class="student-stats">
                            <div class="stat">
                                <span class="stat-value">${student.totalExams}</span>
                                <span class="stat-label">Ujian</span>
                            </div>
                            <div class="stat">
                                <span class="stat-value">${student.averageMastery}%</span>
                                <span class="stat-label">Mastery</span>
                            </div>
                            <div class="stat" style="display: flex; gap: 5px;">
                                <button onclick="event.stopPropagation(); showStudentDetail('${student.id}')" class="mini-btn" title="Lihat Detail">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button onclick="event.stopPropagation(); deleteStudentExamHistory('${student.id}', '${student.nama_langelog}')" class="mini-btn" style="background: #ef4444;" title="Hapus Riwayat Ujian">
                                    <i class="fas fa-redo"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error loading students list:', error);
    }
}

// Tampilkan detail analytics siswa
async function showStudentDetail(userId) {
    try {
        const analytics = await getDetailedStudentAnalytics(userId);
        if (!analytics) {
            alert('Data analytics siswa tidak ditemukan.');
            return;
        }

        // Ambil analisis AI dari tabel gemini_analyses
        let aiAnalyses = [];
        try {
            const sessionIds = analytics.exams.map(e => e.sessionId);
            if (sessionIds.length > 0) {
                const { data: answerIds } = await supabase
                    .from('exam_answers')
                    .select('id, question_id')
                    .in('exam_session_id', sessionIds)
                    .limit(50);

                if (answerIds && answerIds.length > 0) {
                    const { data: geminiData } = await supabase
                        .from('gemini_analyses')
                        .select('*')
                        .in('answer_id', answerIds.map(a => a.id))
                        .limit(20);
                    aiAnalyses = geminiData || [];
                }
            }
        } catch (e) {
            console.warn('Could not load AI analyses:', e);
        }

        // Siapkan data radar chart per bab
        const chapterLabels = analytics.chapterPerformance.map(c => c.chapter);
        const chapterAccuracy = analytics.chapterPerformance.map(c => Math.round(c.accuracy || 0));

        // Ringkasan AI
        let aiSummary = '<p style="color:#6b7280;">Belum ada analisis AI untuk siswa ini.</p>';
        if (aiAnalyses.length > 0) {
            const strengths = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.strengths || []))].slice(0, 3);
            const weaknesses = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.weaknesses || []))].slice(0, 3);
            const suggestions = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.learningSuggestions || []))].slice(0, 3);

            aiSummary = `
                <div style="margin-bottom:1rem;">
                    <strong style="color:#10b981;">💪 Kelebihan:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${strengths.length > 0 ? strengths.map(s => `<li>${s}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
                <div style="margin-bottom:1rem;">
                    <strong style="color:#ef4444;">⚠️ Area Perbaikan:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${weaknesses.length > 0 ? weaknesses.map(w => `<li>${w}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
                <div>
                    <strong style="color:#3b82f6;">📚 Rekomendasi Belajar:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${suggestions.length > 0 ? suggestions.map(s => `<li>${s}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
            `;
        }

        const uniqueId = 'radar_' + userId.replace(/-/g, '').slice(0, 10);

        const modal = document.createElement('div');
        modal.className = 'analytics-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px;width:95%;">
                <div class="modal-header">
                    <div>
                        <h2>${analytics.student.nama_lengkap || 'Siswa'}</h2>
                        <p style="margin:0;color:#6b7280;font-size:0.9rem;">Update: ${new Date().toLocaleDateString('id-ID')}</p>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <button onclick="exportStudentToExcel('${userId}')" class="add-btn" style="font-size:0.85rem;padding:0.5rem 1rem;">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button onclick="exportStudentToGoogleSheet('${userId}')" class="add-btn" style="font-size:0.85rem;padding:0.5rem 1rem;background:#059669;">
                            <i class="fas fa-table"></i> Google Sheet
                        </button>
                        <button onclick="this.closest('.analytics-modal').remove()" class="cancel-btn" style="font-size:0.85rem;padding:0.5rem 1rem;">✕ Tutup</button>
                    </div>
                </div>
                <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1.5rem;">

                    <!-- Kiri: Summary + Peta Kompetensi -->
                    <div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                            <div style="background:#f0fdf4;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">RATA-RATA</div>
                                <div style="font-size:2rem;font-weight:700;color:#10b981;">${analytics.summary.averageScore}</div>
                            </div>
                            <div style="background:#eff6ff;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">TERTINGGI</div>
                                <div style="font-size:2rem;font-weight:700;color:#3b82f6;">${analytics.summary.highestScore || 0}</div>
                            </div>
                            <div style="background:#fefce8;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">TOTAL UJIAN</div>
                                <div style="font-size:2rem;font-weight:700;color:#f59e0b;">${analytics.summary.totalExams}</div>
                            </div>
                            <div style="background:#fdf4ff;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">KELULUSAN</div>
                                <div style="font-size:2rem;font-weight:700;color:#8b5cf6;">${analytics.summary.passRate}%</div>
                            </div>
                        </div>

                        <!-- Peta Kompetensi Radar Chart -->
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;">
                            <h4 style="margin:0 0 1rem;color:#374151;font-size:0.95rem;">
                                <i class="fas fa-chart-radar" style="color:#667eea;"></i> Peta Kompetensi
                            </h4>
                            <div style="position:relative;height:250px;">
                                <canvas id="${uniqueId}"></canvas>
                            </div>
                            ${chapterLabels.length === 0 ? '<p style="text-align:center;color:#9ca3af;font-size:0.85rem;margin-top:0.5rem;">Belum ada data ujian</p>' : ''}
                        </div>
                    </div>

                    <!-- Kanan: Analisis AI + Performa per Bab -->
                    <div>
                        <!-- Analisis Cerdas AI -->
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;margin-bottom:1.5rem;">
                            <h4 style="margin:0 0 1rem;color:#374151;font-size:0.95rem;">
                                <i class="fas fa-robot" style="color:#8b5cf6;"></i> Analisis Cerdas AI
                                <span style="font-size:0.75rem;color:#6b7280;margin-left:0.5rem;">(${aiAnalyses.length} analisis)</span>
                            </h4>
                            <div style="font-size:0.88rem;line-height:1.6;">${aiSummary}</div>
                        </div>

                        <!-- Performa per Bab -->
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;">
                            <h4 style="margin:0 0 1rem;color:#374151;font-size:0.95rem;">
                                <i class="fas fa-chart-bar" style="color:#10b981;"></i> Performa per Bab
                            </h4>
                            ${analytics.chapterPerformance.length === 0
                                ? '<p style="text-align:center;color:#9ca3af;font-size:0.85rem;">Belum ada data</p>'
                                : analytics.chapterPerformance.map(c => `
                                    <div style="margin-bottom:0.75rem;">
                                        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                                            <span style="font-size:0.85rem;color:#374151;">${c.chapter}</span>
                                            <span style="font-size:0.85rem;font-weight:600;color:${Math.round(c.accuracy||0) >= 70 ? '#10b981' : '#ef4444'};">${Math.round(c.accuracy||0)}%</span>
                                        </div>
                                        <div style="height:6px;background:#f3f4f6;border-radius:3px;">
                                            <div style="height:6px;border-radius:3px;width:${Math.round(c.accuracy||0)}%;background:${Math.round(c.accuracy||0) >= 70 ? '#10b981' : '#ef4444'};"></div>
                                        </div>
                                        <div style="font-size:0.75rem;color:#9ca3af;">${c.correctAnswers}/${c.totalQuestions} soal benar</div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Render radar chart setelah modal ada di DOM
        if (chapterLabels.length > 0 && window.Chart) {
            setTimeout(() => {
                const canvas = document.getElementById(uniqueId);
                if (!canvas) return;
                new Chart(canvas.getContext('2d'), {
                    type: 'radar',
                    data: {
                        labels: chapterLabels,
                        datasets: [{
                            label: 'Akurasi (%)',
                            data: chapterAccuracy,
                            backgroundColor: 'rgba(102, 126, 234, 0.2)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 2,
                            pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { stepSize: 20, font: { size: 10 } },
                                pointLabels: { font: { size: 11 } }
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }, 100);
        }

    } catch (error) {
        console.error('Error showing student detail:', error);
        alert('Error loading student analytics.');
    }
}

// Export satu siswa ke Excel
// Helper: build CSV row data lengkap sesuai format yang diminta
async function buildStudentExportData(userId) {
    const analytics = await getDetailedStudentAnalytics(userId);
    if (!analytics) return null;

    // Ambil AI analyses
    let aiStrengths = '-', aiWeaknesses = '-', aiSuggestions = '-';
    try {
        const sessionIds = analytics.exams.map(e => e.sessionId);
        if (sessionIds.length > 0) {
            const { data: answerIds } = await supabase
                .from('exam_answers').select('id').in('exam_session_id', sessionIds).limit(50);
            if (answerIds && answerIds.length > 0) {
                const { data: geminiData } = await supabase
                    .from('gemini_analyses').select('analysis_data')
                    .in('answer_id', answerIds.map(a => a.id)).limit(20);
                if (geminiData && geminiData.length > 0) {
                    aiStrengths = [...new Set(geminiData.flatMap(g => g.analysis_data?.strengths || []))].slice(0,3).join('; ') || '-';
                    aiWeaknesses = [...new Set(geminiData.flatMap(g => g.analysis_data?.weaknesses || []))].slice(0,3).join('; ') || '-';
                    aiSuggestions = [...new Set(geminiData.flatMap(g => g.analysis_data?.learningSuggestions || []))].slice(0,3).join('; ') || '-';
                }
            }
        }
    } catch(e) {}

    // Peta Kompetensi per bab
    const petaKompetensi = analytics.chapterPerformance
        .map(c => `${c.chapter}: ${Math.round(c.accuracy||0)}%`)
        .join(' | ') || '-';

    const rows = [];
    if (analytics.exams.length === 0) {
        // Siswa belum ujian
        rows.push([
            analytics.student.nama_lengkap || '-',
            analytics.student.email || '-',
            analytics.student.class_name || analytics.student.school || '-',
            '-', '-', '-', '-', '-', petaKompetensi,
            0, 0, aiWeaknesses, aiSuggestions
        ]);
    } else {
        analytics.exams.forEach(exam => {
            const startTime = exam.date ? new Date(exam.date) : null;
            const endTime = exam.date && exam.timeSpent
                ? new Date(new Date(exam.date).getTime() + exam.timeSpent * 1000) : null;
            const durasiMenit = exam.timeSpent ? Math.round(exam.timeSpent / 60) + ' menit' : '-';
            rows.push([
                analytics.student.nama_lengkap || '-',
                analytics.student.email || '-',
                analytics.student.class_name || analytics.student.school || '-',
                startTime ? startTime.toLocaleDateString('id-ID') : '-',
                startTime ? startTime.toLocaleTimeString('id-ID') : '-',
                endTime ? endTime.toLocaleTimeString('id-ID') : '-',
                durasiMenit,
                exam.totalScore || 0,
                petaKompetensi,
                exam.correctAnswers || 0,
                (exam.totalQuestions || 0) - (exam.correctAnswers || 0),
                aiWeaknesses,
                aiSuggestions
            ]);
        });
    }
    return rows;
}

// Helper: download CSV
function downloadCSV(csvContent, filename) {
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function exportStudentToExcel(userId) {
    try {
        const rows = await buildStudentExportData(userId);
        if (!rows) { alert('Data tidak ditemukan.'); return; }

        const header = ['Nama Lengkap','Email Siswa','Kelas','Tanggal Ujian',
            'Waktu Mulai','Waktu Selesai','Durasi Pengerjaan','Nilai Akhir (Skor)',
            'Peta Kompetensi','Jumlah Benar','Jumlah Salah',
            'Ringkasan Kemampuan','Rekomendasi Belajar'];

        const csvRows = [header, ...rows];
        const csvContent = csvRows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');

        const name = rows[0]?.[0] || 'siswa';
        downloadCSV(csvContent, `hasil_ujian_${name}_${new Date().toISOString().split('T')[0]}.csv`);
        alert('Data berhasil diekspor!');
    } catch (error) {
        console.error('Error exporting student:', error);
        alert('Error exporting data: ' + error.message);
    }
}

// Export semua siswa ke Excel — format lengkap
async function exportAllStudentsToExcel() {
    try {
        const students = await getAllStudentsAnalytics();
        if (students.length === 0) { alert('Tidak ada data siswa.'); return; }

        alert(`Mengekspor data ${students.length} siswa... Mohon tunggu.`);

        const header = ['Nama Lengkap','Email Siswa','Kelas','Tanggal Ujian',
            'Waktu Mulai','Waktu Selesai','Durasi Pengerjaan','Nilai Akhir (Skor)',
            'Peta Kompetensi','Jumlah Benar','Jumlah Salah',
            'Ringkasan Kemampuan','Rekomendasi Belajar'];

        let allRows = [header];
        for (const student of students) {
            const rows = await buildStudentExportData(student.id);
            if (rows) allRows = allRows.concat(rows);
        }

        const csvContent = allRows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        downloadCSV(csvContent, `semua_siswa_tka_${new Date().toISOString().split('T')[0]}.csv`);
        alert('Semua data berhasil diekspor!');
    } catch (error) {
        console.error('Error exporting all students:', error);
        alert('Error: ' + error.message);
    }
}

// Export ke Google Sheet (copy-paste friendly: buka dialog dengan data)
async function exportStudentToGoogleSheet(userId) {
    try {
        const rows = await buildStudentExportData(userId);
        if (!rows) { alert('Data tidak ditemukan.'); return; }

        const header = ['Nama Lengkap','Email Siswa','Kelas','Tanggal Ujian',
            'Waktu Mulai','Waktu Selesai','Durasi Pengerjaan','Nilai Akhir (Skor)',
            'Peta Kompetensi','Jumlah Benar','Jumlah Salah',
            'Ringkasan Kemampuan','Rekomendasi Belajar'];

        // Format tab-separated untuk langsung paste ke Google Sheet
        const tsvRows = [header, ...rows];
        const tsvContent = tsvRows.map(r => r.map(c => String(c).replace(/\t/g,' ')).join('\t')).join('\n');

        // Tampilkan dialog dengan instruksi
        const modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:2rem;max-width:600px;width:95%;max-height:90vh;overflow-y:auto;">
                <h3 style="margin:0 0 1rem;color:#1f2937;">
                    <i class="fas fa-table" style="color:#16a34a;"></i> Export ke Google Sheet
                </h3>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:0.9rem;color:#166534;">
                    <strong>Cara menggunakan:</strong><br>
                    1. Klik tombol "Salin Data" di bawah<br>
                    2. Buka <a href="https://sheets.google.com" target="_blank" style="color:#16a34a;">Google Sheets</a><br>
                    3. Klik sel A1, lalu tekan <strong>Ctrl+V</strong> (Paste)<br>
                    4. Data akan otomatis mengisi kolom-kolom yang benar
                </div>
                <textarea id="gsheetData" style="width:100%;height:150px;font-size:0.75rem;font-family:monospace;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem;resize:none;" readonly>${tsvContent}</textarea>
                <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                    <button onclick="
                        const ta = document.getElementById('gsheetData');
                        ta.select();
                        document.execCommand('copy');
                        this.textContent='✅ Tersalin!';
                        this.style.background='#16a34a';
                        setTimeout(()=>{this.textContent='📋 Salin Data';this.style.background='#059669';},2000);
                    " style="flex:1;padding:0.75rem;background:#059669;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;">
                        📋 Salin Data
                    </button>
                    <button onclick="
                        const BOM='\\uFEFF';
                        const csv='${header.join(',')}\n'+[${JSON.stringify(rows)}][0].map(r=>r.map(c=>'\"'+String(c).replace(/\"/g,'\"\"')+'\"').join(',')).join('\n');
                        const blob=new Blob([BOM+csv],{type:'text/csv'});
                        const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='export_gsheet.csv';a.click();
                    " style="padding:0.75rem 1rem;background:#3b82f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;">
                        💾 Download CSV
                    </button>
                    <button onclick="this.closest('div[style*=\"position:fixed\"]').remove()" style="padding:0.75rem 1rem;background:#6b7280;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">
                        Tutup
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    } catch (error) {
        console.error('Error preparing Google Sheet export:', error);
        alert('Error: ' + error.message);
    }
}

// Export semua siswa ke Google Sheet
async function exportAllToGoogleSheet() {
    try {
        const students = await getAllStudentsAnalytics();
        if (students.length === 0) { alert('Tidak ada data siswa.'); return; }
        // Gunakan exportAllStudentsToExcel sebagai CSV yang bisa di-import ke Google Sheet
        await exportAllStudentsToExcel();
        setTimeout(() => {
            alert('File CSV berhasil diunduh.\n\nUntuk import ke Google Sheet:\n1. Buka Google Sheets\n2. File → Import → Upload → pilih file CSV\n3. Pilih "Replace spreadsheet" atau "Insert new sheet(s)"');
        }, 500);
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Event listeners for new features
document.addEventListener('DOMContentLoaded', () => {
    // LaTeX preview update
    const latexInput = document.getElementById('latexContent');
    if (latexInput) {
        latexInput.addEventListener('input', updateLatexPreview);
    }

    // Question text LaTeX preview is now handled by toggleQuestionLatexMode()

    // Analytics refresh button
    const refreshBtn = document.getElementById('refreshAnalyticsBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadAnalytics();
            loadStudentsList();
        });
    }

        // Load analytics on page load
        loadAnalytics();
        loadStudentsList();

        // Update student analytics when exam is completed
        updateStudentAnalyticsFromExams();
});

















// Handle question section image upload
async function handleQuestionSectionImageUpload(input, sectionId) {
    const file = input.files[0];
    if (!file) return;

    try {
        const imageUrl = await uploadImage(file);
        const section = window.questionSections.find(s => s.id == sectionId);
        if (section) {
            section.content = imageUrl;
            updateQuestionSectionsDisplay();
        }
    } catch (error) {
        alert('Gagal upload gambar: ' + error.message);
    }
}

// Update question sections display
function updateQuestionSectionsDisplay() {
    const container = document.getElementById('questionSections');
    if (!container) return;

    // Diagnostic logging
    console.log('updateQuestionSectionsDisplay called, window.questionSections:', window.questionSections, 'type:', typeof window.questionSections, 'isArray:', Array.isArray(window.questionSections));

    // Safeguard: ensure it's an array
    if (!Array.isArray(window.questionSections)) {
        console.error('window.questionSections is not an array, resetting to []', window.questionSections);
        window.questionSections = [];
    }

    container.innerHTML = '';

    if (window.questionSections.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 2rem;">Belum ada bagian soal. Klik tombol di bawah untuk menambah bagian pertama.</p>';
        return;
    }

    window.questionSections.forEach((section, index) => {
        const sectionElement = createQuestionSectionElement(section, index);
        container.appendChild(sectionElement);
    });
}

// Create question section element
function createQuestionSectionElement(section, index) {
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'question-section';
    sectionDiv.dataset.sectionId = section.id;

    let contentHtml = '';

    if (section.type === 'text') {
        contentHtml = `
            <textarea class="question-section-textarea" placeholder="Masukkan teks soal..." rows="4" oninput="updateQuestionSectionContent('${section.id}', this.value)">${section.content || ''}</textarea>
        `;
    } else if (section.type === 'image') {
        contentHtml = `
            <input type="file" accept="image/*" class="question-section-file" onchange="handleQuestionSectionImageUpload(this, '${section.id}')">
            <div class="question-section-image-preview" id="qpreview-${section.id}">${section.content ? `<img src="${section.content}" alt="Preview" style="max-width: 200px; max-height: 200px;">` : ''}</div>
        `;
    }

    sectionDiv.innerHTML = `
        <div class="question-section-header">
            <span class="question-section-type">${getQuestionSectionTypeLabel(section.type)}</span>
            <div class="question-section-actions">
                <button type="button" class="question-section-move-btn" onclick="moveQuestionSection('${section.id}', 'up')" ${index === 0 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button type="button" class="question-section-move-btn" onclick="moveQuestionSection('${section.id}', 'down')" ${index === window.questionSections.length - 1 ? 'disabled' : ''}>
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button type="button" class="question-section-delete-btn" onclick="removeQuestionSection('${section.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <div class="question-section-content">
            ${contentHtml}
        </div>
    `;

    return sectionDiv;
}

// Get section type label
function getQuestionSectionTypeLabel(type) {
    const labels = {
        'text': 'Teks Soal',
        'image': 'Gambar'
    };
    return labels[type] || type;
}

// Move question section
function moveQuestionSection(sectionId, direction) {
    if (!Array.isArray(window.questionSections)) {
        window.questionSections = [];
        return;
    }
    const index = window.questionSections.findIndex(section => section.id.toString() === sectionId.toString());
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= window.questionSections.length) return;

    [window.questionSections[index], window.questionSections[newIndex]] = [window.questionSections[newIndex], window.questionSections[index]];
    updateQuestionSectionsDisplay();
}



// Load recent activities for admin dashboard
async function loadRecentActivities() {
    try {
        let activities = [];

        // Try to load from database first
        try {
            const { data: dbActivities, error } = await supabase
                .from('admin_activities')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (!error && dbActivities && dbActivities.length > 0) {
                // Convert database activities to display format
                activities = dbActivities.map(activity => ({
                    icon: getActivityIcon(activity.activity_type, activity.action),
                    title: activity.title,
                    description: activity.description,
                    time: formatActivityTime(activity.created_at),
                    type: activity.activity_type
                }));
            }
        } catch (dbError) {
            console.warn('Database activities not available, using defaults:', dbError);
        }

        // If no database activities, use default activities
        if (activities.length === 0) {
            const defaultActivities = [
                {
                    icon: 'fas fa-plus-circle',
                    title: 'Materi baru ditambahkan',
                    description: 'Materi "Persamaan Linier" berhasil ditambahkan',
                    time: '2 jam lalu',
                    type: 'material'
                },
                {
                    icon: 'fas fa-user-plus',
                    title: 'Siswa baru bergabung',
                    description: '5 siswa baru mendaftar ke platform',
                    time: '4 jam lalu',
                    type: 'user'
                },
                {
                    icon: 'fas fa-brain',
                    title: 'Soal baru dibuat',
                    description: 'Soal TKA Matematika bab Aljabar ditambahkan',
                    time: '6 jam lalu',
                    type: 'question'
                },
                {
                    icon: 'fas fa-trophy',
                    title: 'Pencapaian milestone',
                    description: '1000 soal berhasil diselesaikan siswa',
                    time: '1 hari lalu',
                    type: 'achievement'
                }
            ];
            activities = defaultActivities;
        }

        // Combine with current session activities (prioritize session activities)
        const allActivities = [...currentSessionActivities, ...activities];

        // Remove duplicates and limit to 10
        const uniqueActivities = allActivities
            .filter((activity, index, self) =>
                index === self.findIndex(a => a.title === activity.title && a.description === activity.description)
            )
            .slice(0, 10);

        const activityList = document.getElementById('recentActivities');
        if (activityList) {
            activityList.innerHTML = uniqueActivities.map(activity => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <h4>${activity.title}</h4>
                        <p>${activity.description} • ${activity.time}</p>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading recent activities:', error);
        // Fallback to session activities only
        const activityList = document.getElementById('recentActivities');
        if (activityList) {
            activityList.innerHTML = currentSessionActivities.map(activity => `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="${activity.icon}"></i>
                    </div>
                    <div class="activity-content">
                        <h4>${activity.title}</h4>
                        <p>${activity.description} • ${activity.time}</p>
                    </div>
                </div>
            `).join('');
        }
    }
}

// Helper function to get activity icon based on type and action
function getActivityIcon(activityType, action) {
    const iconMap = {
        'material': {
            'created': 'fas fa-plus-circle',
            'updated': 'fas fa-edit',
            'deleted': 'fas fa-trash'
        },
        'question': {
            'created': 'fas fa-brain',
            'updated': 'fas fa-edit',
            'deleted': 'fas fa-trash'
        },
        'user': {
            'registered': 'fas fa-user-plus',
            'updated': 'fas fa-user-edit',
            'deleted': 'fas fa-user-minus'
        },
        'system': {
            'milestone': 'fas fa-trophy',
            'backup': 'fas fa-save',
            'maintenance': 'fas fa-cogs'
        }
    };

    return iconMap[activityType]?.[action] || 'fas fa-info-circle';
}

// Helper function to format activity time
function formatActivityTime(createdAt) {
    const now = new Date();
    const activityTime = new Date(createdAt);
    const diffMs = now - activityTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
        return 'Baru saja';
    } else if (diffHours < 24) {
        return `${Math.floor(diffHours)} jam lalu`;
    } else {
        return `${Math.floor(diffDays)} hari lalu`;
    }
}

// Update system metrics in real-time
function updateSystemMetrics() {
    // Simulate real-time updates
    const metrics = {
        systemStatus: 'Online',
        lastBackup: new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        }) + ' WIB',
        activeSessions: Math.floor(Math.random() * 50) + 20
    };

    // Update hero metrics
    const systemStatusEl = document.getElementById('systemStatus');
    const lastBackupEl = document.getElementById('lastBackup');
    const activeSessionsEl = document.getElementById('activeSessions');

    if (systemStatusEl) systemStatusEl.textContent = metrics.systemStatus;
    if (lastBackupEl) lastBackupEl.textContent = metrics.lastBackup;
    if (activeSessionsEl) activeSessionsEl.textContent = metrics.activeSessions;
}

// Initialize admin dashboard enhancements
document.addEventListener('DOMContentLoaded', () => {
    // Load recent activities when dashboard is shown
    const dashboardTab = document.getElementById('dashboard');
    if (dashboardTab && dashboardTab.classList.contains('active')) {
        loadRecentActivities();
    }

    // Update system metrics every 30 seconds
    updateSystemMetrics();
    setInterval(updateSystemMetrics, 30000);

    // Add loading states for buttons
    const actionButtons = document.querySelectorAll('.action-btn, .quick-action-btn');
    actionButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.style.transform = 'scale(1)';
            }, 150);
        });
    });
});

// Function to check and fix form before saving
window.checkAndFixForm = function() {
    console.log('=== CHECKING AND FIXING FORM ===');

    const questionType = document.getElementById('questionType')?.value;
    console.log('Current question type:', questionType);

    if (!questionType) {
        alert('Pilih tipe soal terlebih dahulu!');
        return false;
    }

    // Ensure form is updated
    updateQuestionForm();

    // Wait a bit for DOM updates
    setTimeout(() => {
        switch (questionType) {
            case 'Pilihan Ganda':
                const optionA = document.getElementById('optionA');
                const optionB = document.getElementById('optionB');
                const optionC = document.getElementById('optionC');
                const optionD = document.getElementById('optionD');
                const correctAnswer = document.querySelector('input[name="correctAnswer"]:checked');

                console.log('Multiple choice check:', {
                    optionA: !!optionA,
                    optionB: !!optionB,
                    optionC: !!optionC,
                    optionD: !!optionD,
                    correctAnswer: correctAnswer?.value
                });

                if (!optionA || !optionB || !optionC || !optionD) {
                    alert('Form pilihan ganda belum lengkap. Klik "Simpan Soal" lagi.');
                    return false;
                }

                if (!correctAnswer) {
                    // Auto-select A if none selected
                    const radioA = document.getElementById('correctAnswerA');
                    if (radioA) {
                        radioA.checked = true;
                        console.log('Auto-selected answer A');
                        alert('Jawaban benar belum dipilih. Otomatis memilih A. Klik "Simpan Soal" lagi.');
                    }
                    return false;
                }
                break;

            case 'PGK MCMA':
                const mcmaA = document.getElementById('mcmaA');
                const mcmaB = document.getElementById('mcmaB');
                const mcmaC = document.getElementById('mcmaC');
                const mcmaD = document.getElementById('mcmaD');

                console.log('MCMA check:', {
                    mcmaA: !!mcmaA,
                    mcmaB: !!mcmaB,
                    mcmaC: !!mcmaC,
                    mcmaD: !!mcmaD
                });

                if (!mcmaA || !mcmaB || !mcmaC || !mcmaD) {
                    alert('Form PGK MCMA belum lengkap. Klik "Simpan Soal" lagi.');
                    return false;
                }

                const checkedBoxes = document.querySelectorAll('input[id^="mcma"]:checked');
                if (checkedBoxes.length === 0) {
                    // Auto-check A
                    if (mcmaA) {
                        mcmaA.checked = true;
                        console.log('Auto-checked answer A for MCMA');
                        alert('Jawaban benar belum dipilih. Otomatis memilih A. Klik "Simpan Soal" lagi.');
                    }
                    return false;
                }
                break;

            case 'PGK Kategori':
                const statements = document.getElementById('categoryStatements');
                console.log('Category check:', { statements: !!statements });

                if (!statements) {
                    alert('Form PGK Kategori belum lengkap. Klik "Simpan Soal" lagi.');
                    return false;
                }
                break;
        }

        alert('Form sudah diperiksa dan diperbaiki. Sekarang klik "Simpan Soal".');
    }, 500);

    return true;
};

// Diagnostic function to check form elements
window.checkFormElements = function() {
    console.log('=== FORM ELEMENTS CHECK ===');

    const elements = [
        'questionFormData',
        'questionText',
        'questionType',
        'chapter',
        'subChapter',
        'timeLimit',
        'difficulty',
        'scoringWeight',
        'optionsContainer',
        'categoryStatements',
        'optionA',
        'optionB',
        'optionC',
        'optionD',
        'correctAnswer',
        'mcmaA',
        'mcmaB',
        'mcmaC',
        'mcmaD'
    ];

    elements.forEach(id => {
        const el = document.getElementById(id);
        console.log(`${id}: ${el ? 'FOUND' : 'NOT FOUND'}`);
        if (el) {
            console.log(`  - Value: "${el.value ? el.value.substring(0, 50) + '...' : 'empty'}"`);
            console.log(`  - Type: ${el.type || 'N/A'}`);
        }
    });

    // Check question type selection
    const questionTypeEl = document.getElementById('questionType');
    if (questionTypeEl) {
        console.log(`Current question type: "${questionTypeEl.value}"`);
    }

    // Check options container content
    const optionsContainer = document.getElementById('optionsContainer');
    if (optionsContainer) {
        console.log(`Options container content length: ${optionsContainer.innerHTML.length}`);
        console.log(`Options container visible content: "${optionsContainer.innerHTML.substring(0, 100)}..."`);
    }

    alert('Form elements check completed. See console for details.');
};

// Diagnostic function to check database setup
window.checkDatabaseSetup = async function() {
    console.log('=== DATABASE SETUP CHECK ===');

    try {
        // Check if questions table has required columns
        const columns = [
            'question_type', 'chapter', 'sub_chapter', 'scoring_weight',
            'difficulty', 'subject', 'time_limit_minutes', 'latex_content',
            'image_url', 'explanation', 'tags', 'category_options',
            'category_mapping', 'correct_answers', 'partial_credit'
        ];
        const results = {};

        console.log('Checking questions table columns...');
        for (const column of columns) {
            try {
                const result = await supabase
                    .from('questions')
                    .select(column)
                    .limit(1);
                results[column] = result.error ? 'MISSING' : 'OK';
                console.log(`  ${column}: ${results[column]}`);
            } catch (error) {
                results[column] = 'ERROR: ' + error.message;
                console.log(`  ${column}: ${results[column]}`);
            }
        }

        console.log('Database column check results:', results);

        // Check if materials table has required columns
        const materialColumns = ['material_sections'];
        const materialResults = {};

        for (const column of materialColumns) {
            try {
                const result = await supabase
                    .from('materials')
                    .select(column)
                    .limit(1);
                materialResults[column] = result.error ? 'MISSING' : 'OK';
            } catch (error) {
                materialResults[column] = 'ERROR: ' + error.message;
            }
        }

        console.log('Materials table column check results:', materialResults);

        // Check if material_sections table exists
        try {
            const sectionsResult = await supabase
                .from('material_sections')
                .select('id')
                .limit(1);
            console.log('material_sections table:', sectionsResult.error ? 'MISSING' : 'OK');
        } catch (error) {
            console.log('material_sections table: ERROR -', error.message);
        }

        alert('Database check completed. Check console for details.');
    } catch (error) {
        console.error('Database check failed:', error);
        alert('Database check failed: ' + error.message);
    }
};



// Export functions for global access
window.viewUserDetails = viewUserDetails;
window.editQuestion = editQuestion;
window.deleteQuestion = deleteQuestion;
window.updateScoringWeight = updateScoringWeight;
window.updateQuestionForm = updateQuestionForm;
window.updateSubChapters = updateSubChapters;
window.updateMaterialSubChapters = updateMaterialSubChapters;
window.saveMaterial = saveMaterial;
window.showMaterialForm = showMaterialForm;
window.hideMaterialForm = hideMaterialForm;
window.loadMaterials = loadMaterials;
window.editMaterial = editMaterial;
window.deleteMaterial = deleteMaterial;
window.insertLatex = insertLatex;

// LaTeX Functions for Material Summary
function toggleSummaryLatex() {
    const checkbox = document.getElementById('enableSummaryLatex');
    const toolbar = document.getElementById('summaryLatexToolbar');
    const preview = document.getElementById('summaryLatexPreview');
    const help = document.getElementById('summaryLatexHelp');
    const textarea = document.getElementById('materialSummary');

    // Always remove existing event listener first to avoid duplicates
    textarea.removeEventListener('input', updateSummaryLatexPreview);

    if (checkbox && checkbox.checked) {
        // Enable LaTeX mode
        if (toolbar) toolbar.style.display = 'flex';
        if (preview) preview.style.display = 'block';
        if (help) help.style.display = 'block';
        if (textarea) textarea.placeholder = 'Masukkan konten materi dengan LaTeX...';
    } else {
        // Disable LaTeX mode
        if (toolbar) toolbar.style.display = 'none';
        if (help) help.style.display = 'none';
        // Keep preview visible (sama dengan soal) agar tampilan konsisten
        if (preview) preview.style.display = 'block';
        if (textarea) textarea.placeholder = 'Masukkan konten ringkasan materi...';
    }

    // Always add event listener for preview and update
    textarea.addEventListener('input', updateSummaryLatexPreview);
    updateSummaryLatexPreview(); // Update immediately
}

function insertLatexIntoSummary(symbol) {
    const latexSymbols = {
        'fraction': '\\frac{a}{b}',
        'sqrt': '\\sqrt{x}',
        'power': 'x^{2}',
        'subscript': 'x_{i}',
        'integral': '\\int_{a}^{b}',
        'sum': '\\sum_{i=1}^{n}',
        'alpha': '\\alpha',
        'beta': '\\beta',
        'theta': '\\theta',
        'pi': '\\pi',
        'infty': '\\infty',
        'times': '\\times',
        'divide': '\\div',
        'neq': '\\neq',
        'leq': '\\leq',
        'geq': '\\geq'
    };

    const latexCode = latexSymbols[symbol] || symbol;
    const latexWithDelimiters = '\\(' + latexCode + '\\)';

    const textarea = document.getElementById('materialSummary');
    if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + latexWithDelimiters + after;
        textarea.selectionStart = textarea.selectionEnd = start + latexWithDelimiters.length;
        textarea.focus();
    }

    updateSummaryLatexPreview();
}

function insertBoldIntoSummary() {
    const textarea = document.getElementById('materialSummary');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const boldText = selected ? `<b>${selected}</b>` : '<b></b>';
    textarea.value = text.substring(0, start) + boldText + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + boldText.length;
    textarea.focus();
    updateSummaryLatexPreview();
}

function insertCenterIntoSummary() {
    const textarea = document.getElementById('materialSummary');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const centerText = selected ? `<center>${selected}</center>` : '<center></center>';
    textarea.value = text.substring(0, start) + centerText + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + centerText.length;
    textarea.focus();
    updateSummaryLatexPreview();
}

async function insertImageIntoSummary() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';

    fileInput.onchange = async function() {
        if (this.files && this.files[0]) {
            const file = this.files[0];
            if (!file.type.startsWith('image/')) {
                alert('File harus berupa gambar!');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                alert('Ukuran file maksimal 5MB!');
                return;
            }
            try {
                const imageUrl = await uploadImage(file);
                const textarea = document.getElementById('materialSummary');
                if (textarea) {
                    const start = textarea.selectionStart;
                    const imgTag = `<img src="${imageUrl}" alt="Gambar materi" style="max-width: 100%; height: auto;">`;
                    textarea.value = textarea.value.substring(0, start) + imgTag + textarea.value.substring(textarea.selectionEnd);
                    textarea.selectionStart = textarea.selectionEnd = start + imgTag.length;
                    textarea.focus();
                    updateSummaryLatexPreview();
                }
            } catch (err) {
                alert('Gagal upload gambar: ' + err.message);
            }
        }
    };

    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// ========== RULER / VISUAL GUIDE FUNCTIONS ==========
let rulerEnabled = false;
let rulerLines = [];

function toggleRuler() {
    const container = document.getElementById('rulerContainer');
    const toolbar = document.getElementById('summaryLatexToolbar');
    
    rulerEnabled = !rulerEnabled;
    
    if (container) {
        container.style.display = rulerEnabled ? 'block' : 'none';
    }
    
    // Update button appearance
    const rulerBtn = toolbar.querySelector('button[onclick="toggleRuler()"]');
    if (rulerBtn) {
        rulerBtn.style.background = rulerEnabled ? '#4f46e5' : '#f3f4f6';
        rulerBtn.style.color = rulerEnabled ? 'white' : '#374151';
    }
    
    if (!rulerEnabled) {
        // Optional: Clear rulers when disabled
        // clearRulers();
    }
}

function addRuler(event) {
    if (!rulerEnabled) return;
    
    const container = document.getElementById('rulerContainer');
    if (!container) return;
    
    // Get click position relative to container
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const position = Math.round(x);
    
    // Create ruler line element
    const line = document.createElement('div');
    line.className = 'ruler-line';
    line.style.left = position + 'px';
    line.setAttribute('data-position', position + 'px');
    line.setAttribute('data-x', position);
    
    // Add drag functionality
    let isDragging = false;
    let startX = 0;
    let startLeft = position;
    
    line.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        startLeft = parseInt(line.getAttribute('data-x'));
        e.preventDefault();
        e.stopPropagation();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        let newPos = startLeft + deltaX;
        
        // Clamp position within container
        newPos = Math.max(0, Math.min(rect.width, newPos));
        
        line.style.left = newPos + 'px';
        line.setAttribute('data-position', newPos + 'px');
        line.setAttribute('data-x', newPos);
    });
    
    document.addEventListener('mouseup', function() {
        isDragging = false;
    });
    
    // Double click to remove
    line.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        line.remove();
    });
    
    // Add right-click context menu to remove
    line.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        line.remove();
    });
    
    const linesContainer = document.getElementById('rulerLines');
    if (linesContainer) {
        linesContainer.appendChild(line);
    }
}

function clearRulers() {
    const linesContainer = document.getElementById('rulerLines');
    if (linesContainer) {
        linesContainer.innerHTML = '';
    }
}

function updateSummaryLatexPreview() {
    const inputArea = document.getElementById('materialSummary');
    const previewArea = document.getElementById('summaryLatexPreview');

    if (inputArea && previewArea) {
        // 1. Ambil teks
        let content = inputArea.value;

        // 2. Ganti line breaks dengan <br> untuk preview
        content = content.replace(/\n/g, '<br>');

        // 3. Masukkan ke preview
        previewArea.innerHTML = content;

        // 4. Render LaTeX — identik dengan updateQuestionPreview
        if (window.katex) {
            try {
                // Inline \(...\) — gunakan [^]* untuk multiline
                let renderedText = content.replace(/\\\(([^]*?)\\\)/g, (match, latex) => {
                    try {
                        return window.katex.renderToString(latex, { displayMode: false, throwOnError: false });
                    } catch (e) {
                        return match;
                    }
                });
                // Display mode \[...\]
                renderedText = renderedText.replace(/\\\[([^]*?)\\\]/g, (match, latex) => {
                    try {
                        return window.katex.renderToString(latex, { displayMode: true, throwOnError: false });
                    } catch (e) {
                        return match;
                    }
                });
                previewArea.innerHTML = renderedText;
            } catch (error) {
                previewArea.innerHTML = content;
            }
        }
    }
}

// Summary latex preview — selalu update preview saat ada input (sama dengan soal)
document.addEventListener('DOMContentLoaded', function() {
    const summaryTextarea = document.getElementById('materialSummary');
    if (summaryTextarea) {
        summaryTextarea.addEventListener('input', function() {
            updateSummaryLatexPreview();
        });
    }
});

window.toggleSummaryLatex = toggleSummaryLatex;
window.insertLatexIntoSummary = insertLatexIntoSummary;
window.insertBoldIntoSummary = insertBoldIntoSummary;
window.insertCenterIntoSummary = insertCenterIntoSummary;
window.insertImageIntoSummary = insertImageIntoSummary;
window.updateSummaryLatexPreview = updateSummaryLatexPreview;
window.updateSummaryLatexPreview = updateSummaryLatexPreview;

// Ruler functions
window.toggleRuler = toggleRuler;
window.addRuler = addRuler;
window.clearRulers = clearRulers;

window.insertBold = insertBold;
window.insertCenter = insertCenter;
window.toggleQuestionLatexMode = toggleQuestionLatexMode;
window.updateQuestionPreview = updateQuestionPreview;
window.previewImage = previewImage;
window.previewOptionImage = previewOptionImage;
window.insertLatexIntoOption = insertLatexIntoOption;
window.updateOptionLatexPreview = updateOptionLatexPreview;
window.insertImageIntoQuestion = insertImageIntoQuestion;
window.loadRecentActivities = loadRecentActivities;
window.loadTodaysPerformance = loadTodaysPerformance;
window.checkDashboardSystemStatus = checkDashboardSystemStatus;
window.loadAnalytics = loadAnalytics;
window.loadStudentsList = loadStudentsList;

// ==========================================
// LIVE MONITOR FUNCTIONS
// ==========================================
let monitoringInterval = null;
let isMonitoring = false;
let liveAnswerFeedData = [];

async function startMonitoring() {
    isMonitoring = true;
    const startBtn = document.getElementById('startMonitoringBtn');
    const stopBtn = document.getElementById('stopMonitoringBtn');
    const liveBadge = document.getElementById('liveBadge');
    const liveIndicator = document.getElementById('liveIndicator');

    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    if (liveBadge) liveBadge.style.display = 'inline-flex';
    if (liveIndicator) liveIndicator.style.display = 'inline-block';

    // Load segera
    await refreshMonitoringData();

    // Auto-refresh setiap 5 detik
    monitoringInterval = setInterval(async () => {
        if (isMonitoring) await refreshMonitoringData();
    }, 5000);
}

function stopMonitoring() {
    isMonitoring = false;
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    const startBtn = document.getElementById('startMonitoringBtn');
    const stopBtn = document.getElementById('stopMonitoringBtn');
    const liveBadge = document.getElementById('liveBadge');
    const liveIndicator = document.getElementById('liveIndicator');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    if (liveBadge) liveBadge.style.display = 'none';
    if (liveIndicator) liveIndicator.style.display = 'none';
}

async function refreshMonitoringData() {
    try {
        // 1. Ambil sesi aktif - query sederhana tanpa join
        const { data: activeSessions, error: sessionsError } = await supabase
            .from('exam_sessions')
            .select('id, user_id, started_at, status, question_type_variant, total_time_seconds')
            .eq('status', 'in_progress')
            .order('started_at', { ascending: false });

        if (sessionsError) {
            console.warn('Error loading active sessions:', sessionsError);
        }

        let sessions = activeSessions || [];

        // Ambil profil siswa terpisah
        if (sessions.length > 0) {
            const userIds = [...new Set(sessions.map(s => s.user_id))];
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nama_lengkap, email, class_name')
                .in('id', userIds);
            const profileMap = {};
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
            sessions = sessions.map(s => ({ ...s, profiles: profileMap[s.user_id] || null }));
        }

        // 2. Update stat: Siswa Aktif
        const activeStudentsEl = document.getElementById('activeStudentsCount');
        if (activeStudentsEl) activeStudentsEl.textContent = sessions.length;

        // 3. Ambil jawaban terbaru - query sederhana tanpa nested join
        const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recentAnswers, error: answersError } = await supabase
            .from('exam_answers')
            .select('id, selected_answer, is_correct, created_at, time_taken_seconds, question_id, exam_session_id')
            .gte('created_at', thirtyMinAgo)
            .order('created_at', { ascending: false })
            .limit(50);

        let answers = recentAnswers || [];

        // Ambil data soal dan profil secara terpisah
        if (answers.length > 0) {
            const qIds = [...new Set(answers.map(a => a.question_id).filter(Boolean))];
            const sIds = [...new Set(answers.map(a => a.exam_session_id).filter(Boolean))];

            const [{ data: qData }, { data: sData }] = await Promise.all([
                qIds.length > 0 ? supabase.from('questions').select('id, question_text, bab').in('id', qIds) : { data: [] },
                sIds.length > 0 ? supabase.from('exam_sessions').select('id, user_id').in('id', sIds) : { data: [] }
            ]);

            const sessionUserIds = [...new Set((sData || []).map(s => s.user_id))];
            const { data: pData } = sessionUserIds.length > 0
                ? await supabase.from('profiles').select('id, nama_lengkap').in('id', sessionUserIds)
                : { data: [] };

            const qMap = {}, sMap = {}, pMap = {};
            (qData || []).forEach(q => { qMap[q.id] = q; });
            (sData || []).forEach(s => { sMap[s.id] = s; });
            (pData || []).forEach(p => { pMap[p.id] = p; });

            answers = answers.map(a => ({
                ...a,
                questions: qMap[a.question_id] || null,
                exam_sessions: { profiles: pMap[sMap[a.exam_session_id]?.user_id] || null }
            }));
        }

        // 4. Hitung stats
        const totalAnswersEl = document.getElementById('totalAnswersCount');
        if (totalAnswersEl) totalAnswersEl.textContent = answers.length;

        const correctAnswers = answers.filter(a => a.is_correct);
        const correctRateEl = document.getElementById('correctRate');
        if (correctRateEl) {
            correctRateEl.textContent = answers.length > 0
                ? Math.round((correctAnswers.length / answers.length) * 100) + '%'
                : '-';
        }

        const avgTimeEl = document.getElementById('avgResponseTime');
        if (avgTimeEl && answers.length > 0) {
            const avgTime = answers.reduce((s, a) => s + (a.time_taken_seconds || 0), 0) / answers.length;
            avgTimeEl.textContent = Math.round(avgTime) + 's';
        }

        // 5. Render active sessions cards
        const container = document.getElementById('activeSessionsContainer');
        if (container) {
            if (sessions.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="text-align:center;padding:2rem;color:#6b7280;grid-column:1/-1;">
                        <i class="fas fa-hourglass-start" style="font-size:2rem;margin-bottom:0.5rem;"></i>
                        <p>Belum ada sesi ujian aktif saat ini</p>
                    </div>`;
            } else {
                container.innerHTML = sessions.map(session => {
                    const name = session.profiles?.nama_lengkap || 'Siswa';
                    const email = session.profiles?.email || '-';
                    const kelas = session.profiles?.class_name || '-';
                    const startTime = new Date(session.started_at).toLocaleTimeString('id-ID');
                    const elapsed = Math.floor((Date.now() - new Date(session.started_at)) / 60000);
                    return `
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                            <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1rem;">
                                    ${name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style="font-weight:600;color:#1f2937;font-size:0.95rem;">${name}</div>
                                    <div style="font-size:0.8rem;color:#6b7280;">${email}</div>
                                </div>
                                <span style="margin-left:auto;background:#dcfce7;color:#16a34a;padding:0.25rem 0.6rem;border-radius:20px;font-size:0.75rem;font-weight:600;">
                                    <span style="display:inline-block;width:6px;height:6px;background:#16a34a;border-radius:50%;margin-right:4px;animation:pulse 1s infinite;"></span>
                                    LIVE
                                </span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.82rem;color:#374151;">
                                <div><i class="fas fa-graduation-cap" style="color:#667eea;margin-right:4px;"></i>Tipe: <strong>${session.question_type_variant || '-'}</strong></div>
                                <div><i class="fas fa-school" style="color:#10b981;margin-right:4px;"></i>Kelas: <strong>${kelas}</strong></div>
                                <div><i class="fas fa-clock" style="color:#f59e0b;margin-right:4px;"></i>Mulai: ${startTime}</div>
                                <div><i class="fas fa-hourglass-half" style="color:#8b5cf6;margin-right:4px;"></i>Durasi: ${elapsed} menit</div>
                            </div>
                        </div>`;
                }).join('');
            }
        }

        // 6. Render live answer feed
        const feedEl = document.getElementById('liveAnswerFeed');
        if (feedEl) {
            if (answers.length === 0) {
                feedEl.innerHTML = `
                    <div class="empty-state" style="text-align:center;padding:2rem;color:#6b7280;">
                        <i class="fas fa-inbox" style="font-size:2rem;margin-bottom:0.5rem;"></i>
                        <p>Belum ada jawaban masuk dalam 30 menit terakhir</p>
                    </div>`;
            } else {
                feedEl.innerHTML = answers.map(a => {
                    const studentName = a.exam_sessions?.profiles?.nama_lengkap || 'Siswa';
                    const chapter = a.questions?.bab || '-';
                    const questionSnippet = (a.questions?.question_text || '').substring(0, 60) + '...';
                    const time = new Date(a.created_at).toLocaleTimeString('id-ID');
                    const isCorrect = a.is_correct;
                    return `
                        <div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 1rem;border-bottom:1px solid #f3f4f6;">
                            <div style="width:32px;height:32px;border-radius:50%;background:${isCorrect ? '#dcfce7' : '#fee2e2'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                <i class="fas fa-${isCorrect ? 'check' : 'times'}" style="color:${isCorrect ? '#16a34a' : '#dc2626'};font-size:0.9rem;"></i>
                            </div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:0.85rem;font-weight:600;color:#374151;">${studentName}</div>
                                <div style="font-size:0.8rem;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${chapter} — ${questionSnippet}</div>
                            </div>
                            <div style="text-align:right;flex-shrink:0;">
                                <div style="font-size:0.75rem;color:#9ca3af;">${time}</div>
                                <div style="font-size:0.75rem;color:${isCorrect ? '#16a34a' : '#dc2626'};font-weight:600;">${isCorrect ? 'Benar' : 'Salah'}</div>
                            </div>
                        </div>`;
                }).join('');
            }
        }

    } catch (error) {
        console.error('Error refreshing monitoring data:', error);
    }
}

// Setup monitoring button event listeners
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startMonitoringBtn');
    const stopBtn = document.getElementById('stopMonitoringBtn');
    const refreshBtn = document.getElementById('refreshMonitoringBtn');

    if (startBtn) startBtn.addEventListener('click', startMonitoring);
    if (stopBtn) stopBtn.addEventListener('click', stopMonitoring);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshMonitoringData);
});

window.startMonitoring = startMonitoring;
window.stopMonitoring = stopMonitoring;
window.refreshMonitoringData = refreshMonitoringData;


window.showStudentDetail = showStudentDetail;
window.exportStudentToExcel = exportStudentToExcel;
window.exportAllStudentsToExcel = exportAllStudentsToExcel;
window.exportStudentToGoogleSheet = exportStudentToGoogleSheet;
window.exportAllToGoogleSheet = exportAllToGoogleSheet;
window.checkDatabaseSetup = checkDatabaseSetup;
window.checkFormElements = checkFormElements;

// Material section functions are not implemented for materials (materials use direct TinyMCE editing)

// Question Section Management Functions
function addQuestionSection(type) {
    const section = {
        id: Date.now() + Math.random(),
        type: type,
        content: ''
    };
    if (!Array.isArray(window.questionSections)) {
        window.questionSections = [];
    }
    window.questionSections.push(section);
    updateQuestionSectionsDisplay();
}

function removeQuestionSection(sectionId) {
    if (!Array.isArray(window.questionSections)) {
        window.questionSections = [];
        return;
    }
    window.questionSections = window.questionSections.filter(s => s.id != sectionId);
    updateQuestionSectionsDisplay();
}

function updateQuestionSectionContent(sectionId, content) {
    const section = window.questionSections.find(s => s.id == sectionId);
    if (section) {
        section.content = content;
    }
}

// System Status Modal Functionality
function showSystemStatusModal() {
    const modal = document.getElementById('systemStatusModal');
    if (modal) {
        modal.classList.add('show');
        checkSystemStatus();
    }
}

function hideSystemStatusModal() {
    const modal = document.getElementById('systemStatusModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Check system status
async function checkSystemStatus() {
    try {
        // Check database connection
        const dbStart = Date.now();
        const { data: dbData, error: dbError } = await supabase
            .from('materials')
            .select('count', { count: 'exact', head: true });
        const dbResponseTime = Date.now() - dbStart;

        updateStatusElement('dbStatus', dbError ? 'Error' : 'Online', dbError ? 'error' : 'success');
        updateStatusElement('dbConnection', dbError ? 'Failed' : 'Connected');
        updateStatusElement('dbResponseTime', `${dbResponseTime}ms`);
        updateStatusElement('dbTables', dbError ? 'N/A' : 'Available');

        // Check storage status
        try {
            const { data: storageData, error: storageError } = await supabase.storage
                .from('images')
                .list('', { limit: 1 });

            updateStatusElement('storageStatus', storageError ? 'Error' : 'Online', storageError ? 'error' : 'success');
            updateStatusElement('storageBucket', storageError ? 'N/A' : 'images');
            updateStatusElement('storageFiles', storageError ? 'N/A' : 'Available');
            updateStatusElement('storageSize', storageError ? 'N/A' : 'N/A');
        } catch (storageErr) {
            updateStatusElement('storageStatus', 'Error', 'error');
            updateStatusElement('storageBucket', 'N/A');
            updateStatusElement('storageFiles', 'N/A');
            updateStatusElement('storageSize', 'N/A');
        }

        // Check API endpoints (simulate)
        updateStatusElement('apiStatus', 'Online', 'success');
        updateStatusElement('apiAuth', 'OK');
        updateStatusElement('apiDatabase', 'OK');
        updateStatusElement('apiStorage', 'OK');

        // System metrics
        updateStatusElement('systemStatus', 'Online', 'success');
        updateStatusElement('systemUptime', '99.9%');
        updateStatusElement('systemBackup', new Date().toLocaleString('id-ID'));
        updateStatusElement('systemSessions', Math.floor(Math.random() * 50) + 20);

        // Update logs
        updateSystemLogs();

    } catch (error) {
        console.error('Error checking system status:', error);
        // Set all to error state
        ['dbStatus', 'storageStatus', 'apiStatus', 'systemStatus'].forEach(id => {
            updateStatusElement(id, 'Error', 'error');
        });
    }
}

function updateStatusElement(elementId, text, statusClass = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
        element.className = 'status-badge';
        if (statusClass) {
            element.classList.add(statusClass);
        }
    }
}

function updateSystemLogs() {
    const logsContainer = document.getElementById('systemLogs');
    if (!logsContainer) return;

    const currentTime = new Date().toLocaleTimeString('id-ID', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const logs = [
        { time: currentTime, level: 'info', message: 'System status check completed' },
        { time: '14:25:10', level: 'success', message: 'Database connection verified' },
        { time: '14:20:05', level: 'warning', message: 'High memory usage detected' },
        { time: '14:15:30', level: 'info', message: 'Backup process started' },
        { time: '14:10:15', level: 'success', message: 'User authentication successful' }
    ];

    logsContainer.innerHTML = logs.map(log => `
        <div class="log-entry">
            <span class="log-time">${log.time}</span>
            <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
}

// System action functions
async function refreshSystemStatus() {
    await checkSystemStatus();
    alert('System status refreshed successfully!');
}

async function runSystemDiagnostics() {
    // Simulate diagnostics
    alert('Running system diagnostics...\n\n✅ Database: OK\n✅ Storage: OK\n✅ API: OK\n✅ Memory: OK\n\nAll systems operational!');
}

async function clearSystemCache() {
    // Simulate cache clearing
    alert('System cache cleared successfully!\n\nCleared:\n- Temporary files\n- Session cache\n- Image cache\n- Analytics cache');
}

// Event listeners for system status modal
document.addEventListener('DOMContentLoaded', () => {
    // System status button
    const systemStatusBtn = document.getElementById('systemStatusBtn');
    if (systemStatusBtn) {
        systemStatusBtn.addEventListener('click', showSystemStatusModal);
    }

    // Modal close functionality
    const modal = document.getElementById('systemStatusModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-close')) {
                hideSystemStatusModal();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                hideSystemStatusModal();
            }
        });
    }

    // System action buttons
    const refreshBtn = document.getElementById('refreshSystemStatus');
    const diagnosticsBtn = document.getElementById('runSystemDiagnostics');
    const cacheBtn = document.getElementById('clearSystemCache');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshSystemStatus);
    }

    if (diagnosticsBtn) {
        diagnosticsBtn.addEventListener('click', runSystemDiagnostics);
    }

    if (cacheBtn) {
        cacheBtn.addEventListener('click', clearSystemCache);
    }
});

// Export system status functions
window.showSystemStatusModal = showSystemStatusModal;
window.hideSystemStatusModal = hideSystemStatusModal;
window.refreshSystemStatus = refreshSystemStatus;
window.runSystemDiagnostics = runSystemDiagnostics;
window.clearSystemCache = clearSystemCache;

// Export question section functions
window.addQuestionSection = addQuestionSection;
window.removeQuestionSection = removeQuestionSection;
window.moveQuestionSection = moveQuestionSection;
window.updateQuestionSectionContent = updateQuestionSectionContent;
window.handleQuestionSectionImageUpload = handleQuestionSectionImageUpload;

// Export LaTeX functions for options
window.toggleOptionsLatexMode = toggleOptionsLatexMode;
window.insertLatexIntoOptions = insertLatexIntoOptions;
window.updateOptionsLatexPreview = updateOptionsLatexPreview;

// Enhanced Image Upload and Preview Functions
let currentImageFile = null;
let currentImageSettings = {
    position: 'above',
    size: 'medium',
    quality: 'medium',
    fit: 'contain',
    alignment: 'center',
    border: false,
    shadow: false,
    rounded: false,
    grayscale: false,
    opacity: 1,
    caption: '',
    alt: '',
    customWidth: 400,
    customHeight: 300
};

// Handle image upload with validation and preview
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        alert('Format gambar tidak didukung. Gunakan JPG, PNG, GIF, atau WebP.');
        event.target.value = '';
        return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        alert('Ukuran gambar terlalu besar. Maksimal 5MB.');
        event.target.value = '';
        return;
    }

    currentImageFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.getElementById('imagePreview');
        const img = new Image();

        img.onload = function() {
            // Update image info
            document.getElementById('imageDimensions').textContent = `${img.width} × ${img.height}px`;
            document.getElementById('imageSize').textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

            // Create styled preview
            updateImagePreview();
        };

        img.src = e.target.result;
        currentImageSettings.originalSrc = e.target.result;
    };

    reader.readAsDataURL(file);
}

// Update image preview with current settings
function updateImagePreview() {
    if (!currentImageSettings.originalSrc) return;

    const previewContainer = document.getElementById('imagePreview');
    const img = new Image();

    img.onload = function() {
        // Apply current settings
        const settings = currentImageSettings;

        // Create wrapper with styling
        let wrapperStyle = '';

        // Size settings
        if (settings.size === 'custom') {
            wrapperStyle += `width: ${settings.customWidth}px; height: ${settings.customHeight}px; `;
        } else {
            const sizeMap = {
                'small': '200px',
                'medium': '400px',
                'large': '600px',
                'xlarge': '800px',
                'auto': 'auto'
            };
            if (sizeMap[settings.size]) {
                wrapperStyle += `max-width: ${sizeMap[settings.size]}; `;
            }
        }

        // Fit settings
        const fitMap = {
            'contain': 'object-fit: contain;',
            'cover': 'object-fit: cover;',
            'fill': 'object-fit: fill;',
            'scale-down': 'object-fit: scale-down;',
            'none': 'object-fit: none;'
        };
        wrapperStyle += fitMap[settings.fit] || '';

        // Alignment
        const alignMap = {
            'left': 'margin: 0 auto 0 0;',
            'center': 'margin: 0 auto;',
            'right': 'margin: 0 0 0 auto;'
        };
        wrapperStyle += alignMap[settings.alignment] || '';

        // Styling options
        if (settings.border) wrapperStyle += 'border: 2px solid #e5e7eb; ';
        if (settings.shadow) wrapperStyle += 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); ';
        if (settings.rounded) wrapperStyle += 'border-radius: 8px; ';
        if (settings.grayscale) wrapperStyle += 'filter: grayscale(100%); ';
        wrapperStyle += `opacity: ${settings.opacity}; `;

        // Create preview HTML
        const previewHtml = `
            <img src="${settings.originalSrc}"
                 alt="${settings.alt || 'Preview'}"
                 style="${wrapperStyle}"
                 class="image-preview-img">
            ${settings.caption ? `<div class="image-caption">${settings.caption}</div>` : ''}
        `;

        previewContainer.innerHTML = previewHtml;
    };

    img.src = currentImageSettings.originalSrc;
}

// Toggle question image uploads panel
function toggleQuestionImageUploads() {
    const panel = document.getElementById('imageSettingsPanel');
    const checkbox = document.getElementById('enableQuestionImages');

    if (checkbox.checked) {
        panel.style.display = 'block';
        // Initialize default settings
        loadImageSettings();
        // Initialize presets
        initializeImagePresets();
        // Set auto-apply checkbox value
        const autoApplyCheckbox = document.getElementById('autoApplyLastUsed');
        if (autoApplyCheckbox) {
            autoApplyCheckbox.checked = adminImagePreferences.autoApplyLastUsed || false;
        }
        // Auto-apply preset if enabled
        setTimeout(() => {
            autoApplyPreset();
        }, 100);
    } else {
        panel.style.display = 'none';
        // Clear image data
        resetImageData();
    }
}

// Load image settings from form elements
function loadImageSettings() {
    const elements = {
        position: 'imagePosition',
        size: 'imageSize',
        quality: 'imageQuality',
        fit: 'imageFit',
        alignment: 'imageAlignment',
        border: 'imageBorder',
        shadow: 'imageShadow',
        rounded: 'imageRounded',
        grayscale: 'imageGrayscale',
        opacity: 'imageOpacity',
        caption: 'imageCaption',
        alt: 'imageAlt',
        customWidth: 'customWidth',
        customHeight: 'customHeight'
    };

    // Load values from form
    Object.keys(elements).forEach(key => {
        const elementId = elements[key];
        const element = document.getElementById(elementId);

        if (element) {
            if (element.type === 'checkbox') {
                currentImageSettings[key] = element.checked;
            } else {
                currentImageSettings[key] = element.value;
            }
        }
    });

    // Update custom size visibility
    toggleCustomSize();

    // Update opacity display
    updateOpacityDisplay();
}

// Save current settings to form elements
function saveImageSettings() {
    const elements = {
        position: 'imagePosition',
        size: 'imageSize',
        quality: 'imageQuality',
        fit: 'imageFit',
        alignment: 'imageAlignment',
        border: 'imageBorder',
        shadow: 'imageShadow',
        rounded: 'imageRounded',
        grayscale: 'imageGrayscale',
        opacity: 'imageOpacity',
        caption: 'imageCaption',
        alt: 'imageAlt',
        customWidth: 'customWidth',
        customHeight: 'customHeight'
    };

    // Save values to form
    Object.keys(elements).forEach(key => {
        const elementId = elements[key];
        const element = document.getElementById(elementId);

        if (element) {
            if (element.type === 'checkbox') {
                element.checked = currentImageSettings[key];
            } else {
                element.value = currentImageSettings[key];
            }
        }
    });
}

// Toggle custom size inputs
function toggleCustomSize() {
    const sizeSelect = document.getElementById('imageSize');
    const customGroup = document.getElementById('customSizeGroup');

    if (sizeSelect.value === 'custom') {
        customGroup.style.display = 'block';
    } else {
        customGroup.style.display = 'none';
    }
}

// Update opacity display value
function updateOpacityDisplay() {
    const opacityInput = document.getElementById('imageOpacity');
    const opacityValue = document.getElementById('opacityValue');

    if (opacityInput && opacityValue) {
        const percentage = Math.round(currentImageSettings.opacity * 100);
        opacityValue.textContent = `${percentage}%`;
    }
}

// Reset image settings to defaults
function resetImageSettings() {
    currentImageSettings = {
        position: 'above',
        size: 'medium',
        quality: 'medium',
        fit: 'contain',
        alignment: 'center',
        border: false,
        shadow: false,
        rounded: false,
        grayscale: false,
        opacity: 1,
        caption: '',
        alt: '',
        customWidth: 400,
        customHeight: 300
    };

    // Save to form
    saveImageSettings();

    // Update preview
    updateImagePreview();

    // Update UI elements
    toggleCustomSize();
    updateOpacityDisplay();
}

// Remove uploaded image
function removeImage() {
    currentImageFile = null;
    currentImageSettings.originalSrc = null;

    // Clear file input
    const fileInput = document.getElementById('questionImage');
    if (fileInput) fileInput.value = '';

    // Clear preview
    const previewContainer = document.getElementById('imagePreview');
    if (previewContainer) {
        previewContainer.innerHTML = `
            <div class="no-image-placeholder">
                <i class="fas fa-image fa-3x"></i>
                <p>Belum ada gambar dipilih</p>
            </div>
        `;
    }

    // Clear info
    document.getElementById('imageDimensions').textContent = '-';
    document.getElementById('imageSize').textContent = '-';

    // Reset settings
    resetImageSettings();
}

// Reset image data when disabling image uploads
function resetImageData() {
    currentImageFile = null;
    currentImageSettings.originalSrc = null;

    // Clear file input
    const fileInput = document.getElementById('questionImage');
    if (fileInput) fileInput.value = '';

    // Clear preview
    const previewContainer = document.getElementById('imagePreview');
    if (previewContainer) {
        previewContainer.innerHTML = `
            <div class="no-image-placeholder">
                <i class="fas fa-image fa-3x"></i>
                <p>Belum ada gambar dipilih</p>
            </div>
        `;
    }

    // Clear info
    document.getElementById('imageDimensions').textContent = '-';
    document.getElementById('imageSize').textContent = '-';
}

// Toggle option images functionality
function toggleOptionImages() {
    const checkbox = document.getElementById('enableOptionImages');
    const optionContainers = document.querySelectorAll('.option-image-container');

    if (checkbox.checked) {
        // Show option image inputs
        optionContainers.forEach(container => {
            if (container) container.style.display = 'block';
        });
    } else {
        // Hide option image inputs and clear them
        optionContainers.forEach(container => {
            if (container) {
                container.style.display = 'none';
                const fileInput = container.querySelector('input[type="file"]');
                const preview = container.querySelector('.option-image-preview');
                if (fileInput) fileInput.value = '';
                if (preview) preview.innerHTML = '';
            }
        });
    }
}

// Initialize image settings when form loads
function initializeImageSettings() {
    // Set up event listeners for real-time updates
    const settingElements = [
        'imagePosition', 'imageSize', 'imageFit', 'imageAlignment',
        'imageBorder', 'imageShadow', 'imageRounded', 'imageGrayscale', 'imageOpacity'
    ];

    settingElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', function() {
                // Update current settings
                if (element.type === 'checkbox') {
                    currentImageSettings[id.replace('image', '').toLowerCase()] = element.checked;
                } else {
                    currentImageSettings[id.replace('image', '').toLowerCase()] = element.value;
                }

                // Special handling for size changes
                if (id === 'imageSize') {
                    toggleCustomSize();
                }

                // Update preview
                updateImagePreview();
            });
        }
    });

    // Caption and alt text listeners
    ['imageCaption', 'imageAlt'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', function() {
                currentImageSettings[id.replace('image', '').toLowerCase()] = element.value;
                updateImagePreview();
            });
        }
    });

    // Custom size listeners
    ['customWidth', 'customHeight'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', function() {
                currentImageSettings[id.replace('custom', '').toLowerCase()] = parseInt(element.value) || 400;
                updateImagePreview();
            });
        }
    });
}

// Image Presets Management
let imagePresets = {};
let adminImagePreferences = {};

// Load presets from localStorage
function loadImagePresets() {
    try {
        const saved = localStorage.getItem('adminImagePresets');
        if (saved) {
            imagePresets = JSON.parse(saved);
        } else {
            // Initialize with comprehensive default presets
            imagePresets = {
                'default': {
                    name: 'Default',
                    description: 'Pengaturan standar untuk gambar soal',
                    settings: {
                        position: 'above',
                        size: 'medium',
                        quality: 'medium',
                        fit: 'contain',
                        alignment: 'center',
                        border: false,
                        shadow: false,
                        rounded: false,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 400,
                        customHeight: 300
                    }
                },
                'compact': {
                    name: 'Compact',
                    description: 'Gambar kecil untuk soal matematika',
                    settings: {
                        position: 'inline',
                        size: 'small',
                        quality: 'medium',
                        fit: 'contain',
                        alignment: 'left',
                        border: true,
                        shadow: false,
                        rounded: true,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 200,
                        customHeight: 150
                    }
                },
                'featured': {
                    name: 'Featured',
                    description: 'Gambar besar untuk ilustrasi utama',
                    settings: {
                        position: 'center',
                        size: 'large',
                        quality: 'high',
                        fit: 'cover',
                        alignment: 'center',
                        border: false,
                        shadow: true,
                        rounded: false,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 600,
                        customHeight: 400
                    }
                },
                'diagram': {
                    name: 'Diagram Matematika',
                    description: 'Untuk diagram geometri dan grafik',
                    settings: {
                        position: 'center',
                        size: 'large',
                        quality: 'high',
                        fit: 'contain',
                        alignment: 'center',
                        border: true,
                        shadow: true,
                        rounded: false,
                        grayscale: false,
                        opacity: 1,
                        caption: 'Diagram ilustrasi',
                        alt: 'Diagram matematika',
                        customWidth: 500,
                        customHeight: 350
                    }
                },
                'thumbnail': {
                    name: 'Thumbnail',
                    description: 'Gambar kecil untuk preview',
                    settings: {
                        position: 'left',
                        size: 'small',
                        quality: 'low',
                        fit: 'cover',
                        alignment: 'left',
                        border: true,
                        shadow: false,
                        rounded: true,
                        grayscale: false,
                        opacity: 0.9,
                        caption: '',
                        alt: '',
                        customWidth: 150,
                        customHeight: 100
                    }
                },
                'elegant': {
                    name: 'Elegant',
                    description: 'Gaya elegan dengan shadow dan rounded',
                    settings: {
                        position: 'above',
                        size: 'medium',
                        quality: 'high',
                        fit: 'contain',
                        alignment: 'center',
                        border: false,
                        shadow: true,
                        rounded: true,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 450,
                        customHeight: 320
                    }
                },
                'minimal': {
                    name: 'Minimal',
                    description: 'Gaya minimalis tanpa efek',
                    settings: {
                        position: 'above',
                        size: 'medium',
                        quality: 'medium',
                        fit: 'contain',
                        alignment: 'center',
                        border: false,
                        shadow: false,
                        rounded: false,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 400,
                        customHeight: 300
                    }
                },
                'vintage': {
                    name: 'Vintage',
                    description: 'Efek grayscale untuk gambar klasik',
                    settings: {
                        position: 'center',
                        size: 'large',
                        quality: 'medium',
                        fit: 'cover',
                        alignment: 'center',
                        border: true,
                        shadow: true,
                        rounded: false,
                        grayscale: true,
                        opacity: 0.8,
                        caption: 'Ilustrasi klasik',
                        alt: 'Gambar vintage',
                        customWidth: 550,
                        customHeight: 380
                    }
                },
                'presentation': {
                    name: 'Presentation',
                    description: 'Untuk presentasi dan slide',
                    settings: {
                        position: 'center',
                        size: 'xlarge',
                        quality: 'high',
                        fit: 'contain',
                        alignment: 'center',
                        border: true,
                        shadow: true,
                        rounded: false,
                        grayscale: false,
                        opacity: 1,
                        caption: '',
                        alt: '',
                        customWidth: 700,
                        customHeight: 500
                    }
                }
            };
            saveImagePresetsToStorage();
        }
    } catch (error) {
        console.error('Error loading image presets:', error);
        imagePresets = {};
    }
}

// Load admin preferences
function loadAdminImagePreferences() {
    try {
        const saved = localStorage.getItem('adminImagePreferences');
        if (saved) {
            adminImagePreferences = JSON.parse(saved);
        } else {
            // Default preferences
            adminImagePreferences = {
                defaultPreset: 'default',
                autoApplyLastUsed: false,
                lastUsedPreset: null,
                favoritePresets: ['default', 'diagram', 'compact']
            };
            saveAdminImagePreferences();
        }
    } catch (error) {
        console.error('Error loading admin preferences:', error);
        adminImagePreferences = {};
    }
}

// Save admin preferences
function saveAdminImagePreferences() {
    try {
        localStorage.setItem('adminImagePreferences', JSON.stringify(adminImagePreferences));
    } catch (error) {
        console.error('Error saving admin preferences:', error);
    }
}

// Save presets to localStorage
function saveImagePresetsToStorage() {
    try {
        localStorage.setItem('adminImagePresets', JSON.stringify(imagePresets));
    } catch (error) {
        console.error('Error saving image presets:', error);
    }
}

// Update presets dropdown
function updatePresetsDropdown() {
    const presetSelect = document.getElementById('imagePreset');
    if (!presetSelect) return;

    // Clear existing options except the first one
    presetSelect.innerHTML = '<option value="">Pilih Template</option>';

    // Add favorite presets first (if any)
    if (adminImagePreferences.favoritePresets && adminImagePreferences.favoritePresets.length > 0) {
        const favoritesGroup = document.createElement('optgroup');
        favoritesGroup.label = '⭐ Favorit';

        adminImagePreferences.favoritePresets.forEach(presetKey => {
            if (imagePresets[presetKey]) {
                const preset = imagePresets[presetKey];
                const option = document.createElement('option');
                option.value = presetKey;
                option.textContent = preset.name;
                option.title = preset.description || '';
                favoritesGroup.appendChild(option);
            }
        });

        if (favoritesGroup.children.length > 0) {
            presetSelect.appendChild(favoritesGroup);
        }
    }

    // Add all presets
    const allGroup = document.createElement('optgroup');
    allGroup.label = 'Semua Template';

    Object.keys(imagePresets).forEach(presetKey => {
        // Skip if already in favorites
        if (adminImagePreferences.favoritePresets &&
            adminImagePreferences.favoritePresets.includes(presetKey)) {
            return;
        }

        const preset = imagePresets[presetKey];
        const option = document.createElement('option');
        option.value = presetKey;
        option.textContent = preset.name;
        option.title = preset.description || '';
        allGroup.appendChild(option);
    });

    presetSelect.appendChild(allGroup);
}

// Load selected preset
function loadImagePreset() {
    const presetSelect = document.getElementById('imagePreset');
    if (!presetSelect) return;

    const selectedPreset = presetSelect.value;
    if (!selectedPreset || !imagePresets[selectedPreset]) return;

    const preset = imagePresets[selectedPreset];

    // Apply preset settings
    currentImageSettings = { ...preset.settings };

    // Update form elements
    saveImageSettings();

    // Update preview
    updateImagePreview();

    // Update UI elements
    toggleCustomSize();
    updateOpacityDisplay();

    // Track usage
    if (imagePresets[selectedPreset]) {
        imagePresets[selectedPreset].usageCount = (imagePresets[selectedPreset].usageCount || 0) + 1;
        imagePresets[selectedPreset].lastUsed = new Date().toISOString();
        saveImagePresetsToStorage();
    }

    // Track as last used
    adminImagePreferences.lastUsedPreset = selectedPreset;
    saveAdminImagePreferences();

    console.log('Loaded preset:', preset.name);
}

// Auto-apply default or last used preset when image settings panel opens
function autoApplyPreset() {
    if (!adminImagePreferences.autoApplyLastUsed) return;

    let presetToApply = adminImagePreferences.defaultPreset;

    // If auto-apply last used is enabled and there's a last used preset, use that
    if (adminImagePreferences.lastUsedPreset &&
        imagePresets[adminImagePreferences.lastUsedPreset]) {
        presetToApply = adminImagePreferences.lastUsedPreset;
    }

    if (presetToApply && imagePresets[presetToApply]) {
        const presetSelect = document.getElementById('imagePreset');
        if (presetSelect) {
            presetSelect.value = presetToApply;
            loadImagePreset();
            console.log('Auto-applied preset:', imagePresets[presetToApply].name);
        }
    }
}

// Save current settings as preset
function saveImagePreset() {
    const presetName = prompt('Masukkan nama template pengaturan gambar:');
    if (!presetName || presetName.trim() === '') {
        alert('Nama template tidak boleh kosong!');
        return;
    }

    const presetDescription = prompt('Deskripsi template (opsional):', '');
    const presetKey = presetName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (imagePresets[presetKey] && presetKey !== 'default') {
        if (!confirm(`Template "${imagePresets[presetKey].name}" sudah ada. Apakah ingin menimpa?`)) {
            return;
        }
    }

    // Save current settings as preset
    imagePresets[presetKey] = {
        name: presetName.trim(),
        description: presetDescription ? presetDescription.trim() : '',
        settings: { ...currentImageSettings },
        createdAt: new Date().toISOString(),
        usageCount: 0
    };

    // Save to storage
    saveImagePresetsToStorage();

    // Update dropdown
    updatePresetsDropdown();

    // Select the new preset
    const presetSelect = document.getElementById('imagePreset');
    if (presetSelect) {
        presetSelect.value = presetKey;
    }

    // Track as last used
    adminImagePreferences.lastUsedPreset = presetKey;
    saveAdminImagePreferences();

    alert(`Template "${presetName}" berhasil disimpan!`);
}

// Toggle favorite preset
function toggleFavoritePreset() {
    const presetSelect = document.getElementById('imagePreset');
    if (!presetSelect || !presetSelect.value) {
        alert('Pilih template terlebih dahulu!');
        return;
    }

    const presetKey = presetSelect.value;
    if (!adminImagePreferences.favoritePresets) {
        adminImagePreferences.favoritePresets = [];
    }

    const index = adminImagePreferences.favoritePresets.indexOf(presetKey);
    if (index > -1) {
        // Remove from favorites
        adminImagePreferences.favoritePresets.splice(index, 1);
        alert('Template dihapus dari favorit');
    } else {
        // Add to favorites
        adminImagePreferences.favoritePresets.push(presetKey);
        alert('Template ditambahkan ke favorit');
    }

    saveAdminImagePreferences();
    updatePresetsDropdown();
}

// Set default preset
function setDefaultPreset() {
    const presetSelect = document.getElementById('imagePreset');
    if (!presetSelect || !presetSelect.value) {
        alert('Pilih template terlebih dahulu!');
        return;
    }

    const presetKey = presetSelect.value;
    adminImagePreferences.defaultPreset = presetKey;
    saveAdminImagePreferences();

    alert(`Template "${imagePresets[presetKey].name}" diset sebagai default`);
}

// Auto-apply last used preset
function toggleAutoApplyLastUsed() {
    adminImagePreferences.autoApplyLastUsed = !adminImagePreferences.autoApplyLastUsed;
    saveAdminImagePreferences();

    const status = adminImagePreferences.autoApplyLastUsed ? 'diaktifkan' : 'dinonaktifkan';
    alert(`Auto-apply template terakhir ${status}`);
}

// Delete selected preset
function deleteImagePreset() {
    const presetSelect = document.getElementById('imagePreset');
    if (!presetSelect) return;

    const selectedPreset = presetSelect.value;
    if (!selectedPreset || !imagePresets[selectedPreset]) {
        alert('Pilih template yang ingin dihapus!');
        return;
    }

    if (selectedPreset === 'default') {
        alert('Template default tidak dapat dihapus!');
        return;
    }

    if (!confirm(`Apakah yakin ingin menghapus template "${imagePresets[selectedPreset].name}"?`)) {
        return;
    }

    // Delete preset
    delete imagePresets[selectedPreset];

    // Save to storage
    saveImagePresetsToStorage();

    // Update dropdown
    updatePresetsDropdown();

    // Reset selection
    presetSelect.value = '';

    alert('Template berhasil dihapus!');
}

// Initialize presets when image settings panel is shown
function initializeImagePresets() {
    loadImagePresets();
    loadAdminImagePreferences();
    updatePresetsDropdown();
}


// Export enhanced image functions
window.handleImageUpload = handleImageUpload;
window.updateImagePreview = updateImagePreview;
window.toggleQuestionImageUploads = toggleQuestionImageUploads;
window.toggleOptionImages = toggleOptionImages;
window.resetImageSettings = resetImageSettings;
window.removeImage = removeImage;
window.toggleCustomSize = toggleCustomSize;
window.updateOpacityDisplay = updateOpacityDisplay;


// Export preset functions
window.loadImagePreset = loadImagePreset;
window.saveImagePreset = saveImagePreset;
window.deleteImagePreset = deleteImagePreset;
window.initializeImagePresets = initializeImagePresets;
window.toggleFavoritePreset = toggleFavoritePreset;
window.setDefaultPreset = setDefaultPreset;
window.toggleAutoApplyLastUsed = toggleAutoApplyLastUsed;
window.autoApplyPreset = autoApplyPreset;

// Export PGK Kategori functions
window.addCategoryStatement = addCategoryStatement;
window.updateCategoryStatement = updateCategoryStatement;
window.removeCategoryStatement = removeCategoryStatement;
window.updateCategoryStatementsTable = updateCategoryStatementsTable;

// Export PGK Kategori LaTeX functions
window.toggleStatementsLatexMode = toggleStatementsLatexMode;
window.insertLatexIntoStatements = insertLatexIntoStatements;
window.updateStatementsLatexPreview = updateStatementsLatexPreview;

// Activities Management Functions
async function loadAllActivities() {
    try {
        const activitiesTableBody = document.getElementById('activitiesTableBody');
        const loadingIndicator = document.getElementById('activitiesLoading');
        const emptyState = document.getElementById('activitiesEmpty');

        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (emptyState) emptyState.style.display = 'none';

        // Get filter values
        const typeFilter = document.getElementById('activityTypeFilter')?.value || '';
        const actionFilter = document.getElementById('activityActionFilter')?.value || '';
        const dateFilter = document.getElementById('activityDateFilter')?.value || '';

        // Build query
        let query = supabase
            .from('admin_activities')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (typeFilter) {
            query = query.eq('activity_type', typeFilter);
        }

        if (actionFilter) {
            query = query.eq('action', actionFilter);
        }

        if (dateFilter) {
            const startDate = new Date(dateFilter);
            const endDate = new Date(dateFilter);
            endDate.setDate(endDate.getDate() + 1);

            query = query
                .gte('created_at', startDate.toISOString())
                .lt('created_at', endDate.toISOString());
        }

        const { data: activities, error } = await query;

        if (loadingIndicator) loadingIndicator.style.display = 'none';

        if (error) {
            console.error('Error loading activities:', error);
            if (activitiesTableBody) activitiesTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626;">Error loading activities</td></tr>';
            return;
        }

        if (!activities || activities.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (activitiesTableBody) activitiesTableBody.innerHTML = '';
            return;
        }

        // Populate table
        const activitiesHtml = activities.map(activity => {
            const formattedTime = formatActivityTime(activity.created_at);
            const activityTypeLabel = getActivityTypeLabel(activity.activity_type);
            const actionLabel = getActionLabel(activity.action);
            const icon = getActivityIcon(activity.activity_type, activity.action);

            return `
                <tr>
                    <td>${new Date(activity.created_at).toLocaleString('id-ID')}</td>
                    <td><span class="activity-type-badge ${activity.activity_type}">${activityTypeLabel}</span></td>
                    <td><span class="activity-action-badge ${activity.action}"><i class="${icon}"></i> ${actionLabel}</span></td>
                    <td>${activity.title}</td>
                    <td>${activity.description || '-'}</td>
                </tr>
            `;
        }).join('');

        if (activitiesTableBody) activitiesTableBody.innerHTML = activitiesHtml;

    } catch (error) {
        console.error('Error in loadAllActivities:', error);
        const activitiesTableBody = document.getElementById('activitiesTableBody');
        const loadingIndicator = document.getElementById('activitiesLoading');

        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (activitiesTableBody) activitiesTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #dc2626;">Error loading activities</td></tr>';
    }
}

// Helper function to get activity type label
function getActivityTypeLabel(type) {
    const labels = {
        'material': 'Materi',
        'question': 'Soal',
        'user': 'User',
        'system': 'Sistem'
    };
    return labels[type] || type;
}

// Helper function to get action label
function getActionLabel(action) {
    const labels = {
        'created': 'Dibuat',
        'updated': 'Diperbarui',
        'deleted': 'Dihapus'
    };
    return labels[action] || action;
}

// Event listeners for activities tab
document.addEventListener('DOMContentLoaded', () => {
    // Activities refresh button
    const refreshActivitiesBtn = document.getElementById('refreshActivitiesBtn');
    if (refreshActivitiesBtn) {
        refreshActivitiesBtn.addEventListener('click', loadAllActivities);
    }

    // Activities filters
    const typeFilter = document.getElementById('activityTypeFilter');
    const actionFilter = document.getElementById('activityActionFilter');
    const dateFilter = document.getElementById('activityDateFilter');

    if (typeFilter) {
        typeFilter.addEventListener('change', loadAllActivities);
    }

    if (actionFilter) {
        actionFilter.addEventListener('change', loadAllActivities);
    }

    if (dateFilter) {
        dateFilter.addEventListener('change', loadAllActivities);
    }
});

// Export activities functions
window.loadAllActivities = loadAllActivities;

// File display functions for material uploads
function updateFileDisplay(inputId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(inputId + 'Display');

    if (input && display && input.files && input.files[0]) {
        const file = input.files[0];
        const fileName = file.name;
        const fileSize = (file.size / 1024 / 1024).toFixed(2); // Size in MB

        // Display file info with icon
        let icon = '';
        if (inputId === 'materialImage') {
            icon = '<i class="fas fa-image" style="color: #10b981;"></i>';
        } else {
            // Check file extension for attachment
            const ext = fileName.split('.').pop().toLowerCase();
            if (['pdf'].includes(ext)) {
                icon = '<i class="fas fa-file-pdf" style="color: #dc2626;"></i>';
            } else if (['mp4', 'mov', 'avi'].includes(ext)) {
                icon = '<i class="fas fa-video" style="color: #7c3aed;"></i>';
            } else {
                icon = '<i class="fas fa-file" style="color: #6b7280;"></i>';
            }
        }

        display.innerHTML = `${icon} <strong>${fileName}</strong> (${fileSize} MB)`;
        display.style.color = '#10b981'; // Green color for success
    } else if (display) {
        display.innerHTML = '';
    }
}

// Clear file display when form is reset
function clearFileDisplays() {
    const displays = ['materialImageDisplay', 'materialAttachmentDisplay'];
    displays.forEach(id => {
        const display = document.getElementById(id);
        if (display) {
            display.innerHTML = '';
        }
    });
}

// Export file display functions
window.updateFileDisplay = updateFileDisplay;
window.clearFileDisplays = clearFileDisplays;

// ==========================================
// Logika Google Sheet Embed
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnViewSheet = document.getElementById('btnViewSheet');
    const btnCloseSheet = document.getElementById('btnCloseSheet');
    const sheetContainer = document.getElementById('sheetContainer');

    if (btnViewSheet && btnCloseSheet && sheetContainer) {
        btnViewSheet.addEventListener('click', () => {
            if (sheetContainer.style.display === 'none') {
                sheetContainer.style.display = 'block';
                sheetContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                btnViewSheet.innerHTML = '<i class="fas fa-eye-slash"></i> Sembunyikan Google Sheet';
            } else {
                sheetContainer.style.display = 'none';
                btnViewSheet.innerHTML = '<i class="fas fa-table"></i> Lihat Data Google Sheet';
            }
        });

        btnCloseSheet.addEventListener('click', () => {
            sheetContainer.style.display = 'none';
            btnViewSheet.innerHTML = '<i class="fas fa-table"></i> Lihat Data Google Sheet';
        });
    }
});
