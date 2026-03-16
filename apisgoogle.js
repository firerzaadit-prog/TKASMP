import { supabase } from './clientSupabase.js';

// DIAGNOSTIC: Debug log to verify the issue
console.log('=== DIAGNOSTIC: Google OAuth Config Check ===');
console.log('Current origin:', window.location.origin);
console.log('Current pathname:', window.location.pathname);

// Fungsi untuk sign in dengan Google
export async function signInWithGoogle() {
    try {
        const redirectUrl = window.location.origin + '/app/halamanpertama.html';
        console.log('OAuth redirectTo URL:', redirectUrl);
        
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/index.html' 
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

// Handle auth state changes - only for fallback redirect if OAuth redirectTo fails
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
        console.log('User signed in with Google:', session.user);

        const currentPath = window.location.pathname;
        
        // Only redirect if user is on login/register pages AND not already on halamanpertama
        // This acts as a fallback if OAuth redirectTo doesn't work
        if (currentPath === '/' || 
            currentPath === '/index.html' || 
            currentPath.includes('daftarsekarang.html')) {
            
            window.location.href = window.location.origin + '/halamanpertama.html';
        }
    }
});