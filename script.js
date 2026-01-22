// script.js - menggunakan Supabase client
// Import functions langsung
import { loginUser, registerUser, validatePassword, resetPassword, updatePassword } from './auth.js';
import { initGoogleSignIn } from './apisgoogle.js';
import { supabase } from './supabaseClient.js';


// Fungsi untuk hash password menggunakan SHA-256
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Wait for DOM to be fully loaded (for other functionalities)
document.addEventListener('DOMContentLoaded', () => {

    // Toggle Password Visibility for Registration
    // Toggle for registration password
    const toggleRegBtn = document.getElementById('toggleRegPassword');
    const regPassInput = document.getElementById('regPassword');

    if (toggleRegBtn && regPassInput) {
        toggleRegBtn.addEventListener('click', () => {
            const type = regPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            regPassInput.setAttribute('type', type);
            toggleRegBtn.classList.toggle('fa-eye-slash');
        });
    }

    // Toggle for confirm password
    const toggleConfirmBtn = document.getElementById('toggleConfirmPassword');
    const confirmPassInput = document.getElementById('confirmPassword');

    if (toggleConfirmBtn && confirmPassInput) {
        toggleConfirmBtn.addEventListener('click', () => {
            const type = confirmPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            confirmPassInput.setAttribute('type', type);
            toggleConfirmBtn.classList.toggle('fa-eye-slash');
        });
    }

    // Toggle Password Visibility for Update Password Page
    // Toggle for new password
    const toggleNewBtn = document.getElementById('toggleNewPassword');
    const newPassInput = document.getElementById('newPassword');

    if (toggleNewBtn && newPassInput) {
        toggleNewBtn.addEventListener('click', () => {
            const type = newPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            newPassInput.setAttribute('type', type);
            toggleNewBtn.classList.toggle('fa-eye-slash');
        });
    }

    // Toggle for confirm new password
    const toggleConfirmNewBtn = document.getElementById('toggleConfirmNewPassword');
    const confirmNewPassInput = document.getElementById('confirmNewPassword');

    if (toggleConfirmNewBtn && confirmNewPassInput) {
        toggleConfirmNewBtn.addEventListener('click', () => {
            const type = confirmNewPassInput.getAttribute('type') === 'password' ? 'text' : 'password';
            confirmNewPassInput.setAttribute('type', type);
            toggleConfirmNewBtn.classList.toggle('fa-eye-slash');
        });
    }

    // Handle password reset session for updatepassword.html
    if (document.getElementById('updatePasswordForm')) {
        (async () => {
            try {
                // Get session from URL (for password reset)
                const { data, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('Session error:', error);
                    alert('Link reset password tidak valid atau sudah kadaluarsa.');
                    window.location.href = 'index.html';
                    return;
                }

                if (!data.session) {
                    alert('Sesi tidak valid. Silakan request reset password lagi.');
                    window.location.href = 'index.html';
                    return;
                }

                console.log('Valid reset password session found');
            } catch (error) {
                console.error('Error checking session:', error);
                alert('Terjadi kesalahan. Silakan coba lagi.');
                window.location.href = 'index.html';
            }
        })();
    }
});

// 2. Proses Login dengan Supabase
const loginForm = document.getElementById('learningLoginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Mencegah reload halaman

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.querySelector('.btn-submit');
        const originalText = btn.innerText;

        // Efek Loading pada tombol
        btn.innerText = 'Memproses...';
        btn.style.opacity = '0.7';
        btn.disabled = true;

        try {
            const result = await loginUser(email, password);

            if (result.success) {
                alert('Login Berhasil! Mengarahkan ke Dashboard...');
                window.location.href = 'halamanpertama.html';
            } else {
                alert('Login Gagal: email atau password salah ' + result.error);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }

        // Kembalikan tombol ke semula
        btn.innerText = originalText;
        btn.style.opacity = '1';
        btn.disabled = false;
    });
}


// 4. Proses Reset Password dengan Supabase
const forgotPasswordForm = document.getElementById('forgotPasswordForm');

if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Mencegah reload halaman

        const email = document.getElementById('resetEmail').value;
        const btn = document.querySelector('#forgotPasswordForm .btn-submit');
        const originalText = btn.innerText;

        // Efek Loading pada tombol
        btn.innerText = 'Mengirim...';
        btn.style.opacity = '0.7';
        btn.disabled = true;

        try {
            const result = await resetPassword(email);

            if (result.success) {
                alert('Link reset kata sandi telah dikirim ke email Anda. Periksa inbox Anda.');
                window.location.href = 'index.html';
            } else {
                alert('Gagal mengirim link reset: ' + result.error);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }

        // Kembalikan tombol ke semula
        btn.innerText = originalText;
        btn.style.opacity = '1';
        btn.disabled = false;
    });
}

// 5. Proses Update Password dengan Supabase
const updatePasswordForm = document.getElementById('updatePasswordForm');

if (updatePasswordForm) {
    updatePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Mencegah reload halaman

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        const btn = document.querySelector('#updatePasswordForm .btn-submit');
        const originalText = btn.innerText;

        // Validasi kekuatan password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.valid) {
            alert(passwordValidation.message);
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('Kata sandi tidak cocok!');
            return;
        }

        btn.innerText = 'Mengupdate...';
        btn.style.opacity = '0.7';
        btn.disabled = true;

        try {
            const result = await updatePassword(newPassword);

            if (result.success) {
                alert('Kata sandi berhasil diupdate! Silakan login dengan kata sandi baru.');
                window.location.href = 'index.html';
            } else {
                alert('Gagal update kata sandi: ' + result.error);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }

        btn.innerText = originalText;
        btn.style.opacity = '1';
        btn.disabled = false;
    });
}

// Inisialisasi Google Sign-In
initGoogleSignIn();

// 3. Proses Pendaftaran dengan Supabase
const registerForm = document.getElementById('registerForm');

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.querySelector('#registerForm .btn-submit');
        const originalText = btn.innerText;

        // Validasi kekuatan password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            alert(passwordValidation.message);
            return;
        }

        if (password !== confirmPassword) {
            alert('Kata sandi tidak cocok!');
            return;
        }

        btn.innerText = 'Mendaftarkan...';
        btn.style.opacity = '0.7';
        btn.disabled = true;

        try {
            // Register user ke auth - profile akan dibuat otomatis oleh trigger di database
            const result = await registerUser(fullName, email, password);

            if (result.success) {
                console.log('Signup successful:', result);

                // Hash password dan update profiles dengan nama_lengkap dan kata_sandi_hash
                const hashedPassword = await hashPassword(password);
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        nama_lengkap: fullName,
                        kata_sandi_hash: hashedPassword
                    })
                    .eq('id', result.data.user.id);

                if (updateError) {
                    console.error('Error updating profile with password hash:', updateError);
                    alert('Pendaftaran berhasil tapi gagal menyimpan hash password: ' + updateError.message);
                } else {
                    console.log('Password hash saved successfully');
                    alert('Pendaftaran berhasil! Periksa email untuk verifikasi.');
                    window.location.href = 'index.html';
                }
            } else {
                alert('Pendaftaran Gagal: ' + result.error);
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Error: ' + error.message);
        }

        btn.innerText = originalText;
        btn.style.opacity = '1';
        btn.disabled = false;
    });
}

