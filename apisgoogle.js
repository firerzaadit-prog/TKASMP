import { supabase } from './supabaseClient.js';

// Fungsi untuk sign in dengan Google
export async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // INI YANG KURANG: Memaksa kembali ke folder /app/ setelah login Google
                // window.location.origin akan otomatis mengambil http://127.0.0.1:5500
                redirectTo: window.location.origin + '/app/index.html' 
            }
        });

        if (error) throw error;
    } catch (error) {
        console.error('Google sign-in error:', error);
        alert('Error: ' + error.message);
    }
}

// Event listener untuk tombol Google
export function initGoogleSignIn() {
    const googleBtn = document.getElementById('google-signin-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', signInWithGoogle);
    }
}

// Handle auth state changes
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
        console.log('User signed in with Google:', session.user);

        const currentPath = window.location.pathname;
        
        // Perbaikan logika: Cek apakah user ada di root (/), atau di halaman login app (/app/index.html)
        if (currentPath === '/' || 
            currentPath === '/app/' || 
            currentPath === '/app/index.html' || 
            currentPath.includes('daftarsekarang.html')) {
            
            // Redirect secara spesifik ke dalam folder /app/
            window.location.href = window.location.origin + '/app/halamanpertama.html';
        }
    }
});