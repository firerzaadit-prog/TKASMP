import { supabase } from './clientSupabase.js';

// Fungsi untuk sign in dengan Google
export async function signInWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // Diubah: Menghapus /app/ agar mengarah ke root Vercel
                redirectTo: window.location.origin 
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
        
        if (currentPath === '/' || 
            currentPath === '/index.html' || 
            currentPath.includes('daftarsekarang.html')) {
            
            // PERBAIKAN: Tambahkan .html di akhir URL
            window.location.href = window.location.origin + '/halamanpertama.html';
        }
    }
});