-- Fix RLS Policies untuk Keamanan Produksi
-- Jalankan di Supabase SQL Editor

-- ============================================
-- MATERIALS TABLE
-- ============================================

-- Drop permissive policies
DROP POLICY IF EXISTS "Allow all operations for development" ON public.materials;

-- Policy 1: Semua user yang sudah login bisa MELIHAT materials yang sudah dipublish
CREATE POLICY "Authenticated users can view published materials" ON public.materials
    FOR SELECT 
    USING (is_published = true AND auth.role() = 'authenticated');

-- Policy 2: Hanya admin yang bisa INSERT materials
CREATE POLICY "Admins can insert materials" ON public.materials
    FOR INSERT 
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 3: Hanya admin yang bisa UPDATE materials
CREATE POLICY "Admins can update materials" ON public.materials
    FOR UPDATE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 4: Hanya admin yang bisa DELETE materials
CREATE POLICY "Admins can delete materials" ON public.materials
    FOR DELETE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- ============================================
-- MATERIAL_SECTIONS TABLE  
-- ============================================

-- Drop permissive policies
DROP POLICY IF EXISTS "Allow all operations for development on sections" ON public.material_sections;

-- Policy 1: Semua user yang sudah login bisa MELIHAT sections
CREATE POLICY "Authenticated users can view material sections" ON public.material_sections
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Policy 2: Hanya admin yang bisa INSERT sections
CREATE POLICY "Admins can insert material sections" ON public.material_sections
    FOR INSERT 
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 3: Hanya admin yang bisa UPDATE sections
CREATE POLICY "Admins can update material sections" ON public.material_sections
    FOR UPDATE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 4: Hanya admin yang bisa DELETE sections
CREATE POLICY "Admins can delete material sections" ON public.material_sections
    FOR DELETE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- ============================================
-- QUESTIONS TABLE
-- ============================================

-- Drop permissive policy
DROP POLICY IF EXISTS "Allow questions management" ON public.questions;

-- Policy 1: Semua user yang sudah login bisa MELIHAT questions
CREATE POLICY "Authenticated users can view questions" ON public.questions
    FOR SELECT 
    USING (auth.role() = 'authenticated');

-- Policy 2: Hanya admin yang bisa INSERT questions
CREATE POLICY "Admins can insert questions" ON public.questions
    FOR INSERT 
    WITH CHECK (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 3: Hanya admin yang bisa UPDATE questions
CREATE POLICY "Admins can update questions" ON public.questions
    FOR UPDATE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- Policy 4: Hanya admin yang bisa DELETE questions
CREATE POLICY "Admins can delete questions" ON public.questions
    FOR DELETE 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- ============================================
-- EXAM_SESSIONS TABLE
-- ============================================

-- Policy: User hanya bisa melihat exam session miliknya sendiri
DROP POLICY IF EXISTS "Users can view their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can view their own exam sessions" ON public.exam_sessions
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Policy: User hanya bisa insert exam session miliknya sendiri
DROP POLICY IF EXISTS "Users can insert their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can insert their own exam sessions" ON public.exam_sessions
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Policy: User hanya bisa update exam session miliknya sendiri
DROP POLICY IF EXISTS "Users can update their own exam sessions" ON public.exam_sessions;
CREATE POLICY "Users can update their own exam sessions" ON public.exam_sessions
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- Admin bisa lihat semua exam sessions
CREATE POLICY "Admins can view all exam sessions" ON public.exam_sessions
    FOR SELECT 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
    );

-- ============================================
-- PROFILES TABLE
-- ============================================

-- Policy: User hanya bisa melihat profile miliknya sendiri
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT 
    USING (auth.uid() = id);

-- Policy: User hanya bisa update profile miliknya sendiri
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE 
    USING (auth.uid() = id);

-- Admin bisa lihat semua profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT 
    USING (
        auth.uid() IN (
            SELECT id FROM public.admin_users 
            WHERE is_admin = true OR role IN ('admin', 'super_admin')
        )
        OR auth.jwt() ->> 'role' = 'admin'
    );

-- ============================================
-- STORAGE BUCKETS - batasi public akses
-- ============================================

-- Images bucket: hanya bisa read, tidak bisa public upload
DROP POLICY IF EXISTS "Images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view images" ON storage.objects
    FOR SELECT 
    USING (bucket_id = 'images' AND auth.role() = 'authenticated');

-- Materials bucket: hanya bisa read
DROP POLICY IF EXISTS "Materials are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated users can view materials" ON storage.objects
    FOR SELECT 
    USING (bucket_id = 'materials' AND auth.role() = 'authenticated');

-- Batasi upload - hanya authenticated users yang sudah login
CREATE POLICY "Users can upload to their own folder" ON storage.objects
    FOR INSERT 
    WITH CHECK (
        bucket_id IN ('images', 'materials')
        AND auth.uid()::TEXT = (name)::TEXT
    );

-- ============================================
-- CATATAN:
-- 1. Pastikan tabel admin_users sudah dibuat (lihat fix_admin_auth_security.sql)
-- 2. Jika tabel belum ada, comment out policies yang menggunakan admin_users
-- 3. Untuk testing, bisa menggunakan auth.role() = 'authenticated' sebagai fallback
-- ============================================