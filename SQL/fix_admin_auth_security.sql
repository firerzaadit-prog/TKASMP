-- SECURITY FIX: Admin Authentication Schema
-- Jalankan di Supabase SQL Editor

-- 1. Create admin_users table jika belum ada (dengan semua kolom)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'moderator')),
    is_admin BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1b. Tambahkan column is_admin jika tabel sudah ada tapi belum punya kolom ini
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_users' AND column_name = 'is_admin'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN is_admin BOOLEAN DEFAULT true;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_users' AND column_name = 'email'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN email TEXT NOT NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_users' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.admin_users ADD COLUMN role TEXT DEFAULT 'admin';
    END IF;
END $$;

-- 2. Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 3. Policies untuk admin_users

-- Policy: user bisa melihat data dirinya sendiri
DROP POLICY IF EXISTS "Users can view own admin record" ON public.admin_users;
CREATE POLICY "Users can view own admin record" ON public.admin_users
    FOR SELECT USING (auth.uid() = id);

-- Policy: Semua authenticated user bisa insert (untuk setup awal)
DROP POLICY IF EXISTS "Authenticated users can insert admin users" ON public.admin_users;
CREATE POLICY "Authenticated users can insert admin users" ON public.admin_users
    FOR INSERT WITH CHECK (true);

-- Policy: Hanya admin yang bisa update
DROP POLICY IF EXISTS "Admins can update admin users" ON public.admin_users;
CREATE POLICY "Admins can update admin users" ON public.admin_users
    FOR UPDATE USING (auth.uid() = id);

-- 4. Tambahkan column role di profiles jika belum ada
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'student';
    END IF;
END $$;

-- 5. Tambahkan admin user pertama (GANTI EMAIL DENGAN EMAIL ADMIN ANDA)
-- Contoh: admin@tka.com
INSERT INTO public.admin_users (id, email, role, is_admin)
SELECT 
    id, 
    email, 
    'super_admin', 
    true
FROM auth.users 
WHERE email = 'admin@tka.com'
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    is_admin = true;

-- 6. Function untuk cek apakah user adalah admin
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM public.admin_users
        WHERE id = user_id AND (is_admin = true OR role IN ('admin', 'super_admin'))
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- 7. Function untuk cek apakah user adalah super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS(
        SELECT 1 FROM public.admin_users
        WHERE id = user_id AND role = 'super_admin'
    );
$$ LANGUAGE sql SECURITY DEFINER;

-- 8. Grant execute pada function ke authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- 9. Grant akses pada tabel admin_users
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_users TO authenticated;
GRANT ALL ON TABLE public.admin_users TO service_role;

-- 10. Update profiles dengan role admin untuk user tertentu
-- GANTI 'admin@tka.com' dengan email admin yang ingin diberikan akses
UPDATE public.profiles 
SET role = 'super_admin'
WHERE email = 'admin@tka.com';

-- ============================================
-- CATATAN PENTING:
-- ============================================
-- Sebelum menjalankan ini,ubah 'admin@tka.com' dengan email admin Anda yang sebenarnya!
-- Contoh: WHERE email = 'admin@sekolahku.sch.id'
-- ============================================