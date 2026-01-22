import { supabase } from './supabaseClient.js';

// apisgoogle.js - menggunakan Supabase client

// Fungsi untuk sign in dengan Google
export async function signInWithGoogle() {
    try {
        // Untuk development, gunakan base URL tanpa path
        // Supabase akan handle redirect setelah OAuth selesai
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google'
            // redirectTo akan menggunakan default Supabase atau yang dikonfigurasi di dashboard
        });

        if (error) throw error;

        // Supabase akan handle redirect otomatis
    } catch (error) {
        console.error('Google sign-in error:', error);
        alert('Error: ' + error.message);
    }
}

// Event listener untuk tombol Google (akan dipanggil dari script.js)
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

        // Jika sedang di halaman login/register, redirect ke dashboard
        if (window.location.pathname === '/index.html' ||
            window.location.pathname === '/' ||
            window.location.pathname.includes('daftarsekarang.html')) {
            window.location.href = 'halamanpertama.html';
        }
    }
});
