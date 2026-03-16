-- ==========================================
-- FIX: 500 Internal Server Error on Login
-- ==========================================
-- Error ini disebabkan oleh trigger di auth.users yang error
-- Jalankan script ini di Supabase SQL Editor
-- ==========================================

-- 1. HAPUS SEMUA TRIGGER dari auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_v2 ON auth.users;

-- 2. Hapus function handle_new_user
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 3. Pastikan tidak ada trigger lain yang mungkin menyebabkan error
DO $$
DECLARE
    trig RECORD;
BEGIN
    FOR trig IN 
        SELECT trigger_name, event_object_table 
        FROM information_schema.triggers 
        WHERE trigger_schema = 'auth' OR event_object_schema = 'auth'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.%I CASCADE', 
                      trig.trigger_name, trig.event_object_table);
        RAISE NOTICE 'Dropped trigger: % on auth.%', trig.trigger_name, trig.event_object_table;
    END LOOP;
END $$;

-- 4. Fix RLS policies di profiles - allow service role to bypass
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Public profiles are insertable by anyone during signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create simple, working policies
-- Allow anyone to insert (needed for signup trigger if it exists)
CREATE POLICY "Allow insert on profiles" ON public.profiles
    FOR INSERT WITH CHECK (true);

-- Allow users to view their own profile
CREATE POLICY "Users view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 5. Buat ulang function handle_new_user dengan SECURITY DEFINER dan error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert dengan error handling
    BEGIN
        INSERT INTO public.profiles (id, nama_lengkap, email)
        VALUES (
            NEW.id,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                SPLIT_PART(NEW.email, '@', 1)
            ),
            NEW.email
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Log error tapi JANGAN gagalkan operasi auth
        RAISE WARNING 'Profile creation failed for user %: %', NEW.id, SQLERRM;
        -- Return NEW anyway so auth operation succeeds
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticator;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;

-- 7. Buat trigger baru dengan nama berbeda
CREATE TRIGGER trg_handle_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- 8. Pastikan semua user yang ada punya profile
INSERT INTO public.profiles (id, nama_lengkap, email, role)
SELECT 
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        SPLIT_PART(u.email, '@', 1)
    ),
    u.email,
    'student'::user_role
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 9. Verifikasi
SELECT 'Fix applied!' as status;
SELECT 
    (SELECT COUNT(*) FROM auth.users) as total_auth_users,
    (SELECT COUNT(*) FROM public.profiles) as total_profiles;

-- 10. Cek apakah ada trigger yang tersisa di auth schema
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'auth' OR event_object_schema = 'auth';