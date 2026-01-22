// auth.js - menggunakan Supabase client
import { supabase } from './clientSupabase.js';

// Fungsi validasi password
export function validatePassword(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength) {
        return { valid: false, message: 'Password harus minimal 8 karakter' };
    }
    return { valid: true, message: 'Password valid' };
}

// Fungsi register user
export async function registerUser(fullName, email, password) {
    try {
        console.log('Attempting to register user:', { email, fullName });
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    name: fullName, // Also store as 'name' for compatibility
                }
            }
        });

        if (error) {
            console.error('Supabase signup error:', error);
            console.error('Error status:', error.status);
            console.error('Error details:', error.details);
            console.error('Error message:', error.message);
            throw error;
        }

        console.log('Signup successful:', data);

        // After successful signup, try to create/update profile
        if (data.user) {
            try {
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: data.user.id,
                        nama_lengkap: fullName,
                        email: email
                    }, {
                        onConflict: 'id'
                    });

                if (profileError) {
                    console.warn('Profile creation warning:', profileError);
                    // Don't fail registration if profile creation fails
                } else {
                    console.log('Profile created/updated successfully');
                }
            } catch (profileErr) {
                console.warn('Profile operation failed:', profileErr);
                // Don't fail registration if profile creation fails
            }
        }

        return { success: true, data: data };
    } catch (error) {
        console.error('Registration error details:', error);
        return { success: false, error: error.message };
    }
}

// Fungsi login user
export async function loginUser(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        return { success: true, data: data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fungsi logout
export async function logoutUser() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Alias for logoutUser for compatibility
export const logout = logoutUser;

// Fungsi untuk mendapatkan user saat ini
export async function getCurrentUser() {
    try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return { success: true, user: user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fungsi untuk reset password
export async function resetPassword(email) {
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/updatepassword.html`
        });
        if (error) throw error;
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Fungsi untuk update password
export async function updatePassword(newPassword) {
    try {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;

        return { success: true, data: data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
