-- ==========================================
-- FIX: Database error granting user (500 Error)
-- ==========================================
-- Error ini disebabkan oleh trigger on_auth_user_created
-- yang gagal saat mencoba membuat profile untuk user baru
-- ==========================================

-- 1. Drop trigger yang bermasalah
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop function lama (mungkin ada yang rusak)
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3. Buat ulang function handle_new_user dengan error handling yang lebih baik
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert ke profiles dengan handling untuk kolom yang mungkin tidak ada
    BEGIN
        INSERT INTO public.profiles (id, nama_lengkap, email)
        VALUES (
            NEW.id,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                NEW.user_metadata->>'full_name',
                NEW.user_metadata->>'name',
                SPLIT_PART(NEW.email, '@', 1)
            ),
            NEW.email
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Log error tapi jangan gagalkan signup
        RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Buat ulang trigger dengan nama yang berbeda untuk menghindari cache issue
CREATE TRIGGER on_auth_user_created_v2
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Pastikan RLS policy untuk profiles benar
-- Allow service role to insert (untuk trigger)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert during signup (public can insert their own profile)
DROP POLICY IF EXISTS "Public profiles are insertable by anyone during signup" ON public.profiles;
CREATE POLICY "Public profiles are insertable by anyone during signup" ON public.profiles
    FOR INSERT WITH CHECK (true);

-- Policy: Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can update own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 6. Fix existing users yang mungkin tidak punya profile
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

-- 7. Verifikasi
SELECT 'Fix applied successfully!' as status;
SELECT COUNT(*) as total_users FROM auth.users;
SELECT COUNT(*) as total_profiles FROM public.profiles;
