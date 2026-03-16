-- ==========================================
-- ADMIN AUTHENTICATION SCHEMA
-- Menggunakan Supabase Auth dengan Role-Based Access
-- ==========================================

-- 1. Tambahkan kolom role ke tabel profiles jika belum ada
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'role'
    ) THEN
        ALTER TABLE profiles ADD COLUMN role VARCHAR(50);
    END IF;
END $$;

-- 2. Buat enum untuk role (jika belum ada)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'admin', 'super_admin');
    END IF;
END $$;

-- ==========================================
-- ⚠️ Hapus sementara VIEW, POLICY & TRIGGER yang mengikat kolom role
-- ==========================================
DROP VIEW IF EXISTS admin_dashboard_view CASCADE;
DROP POLICY IF EXISTS "Admin can manage gemini analyses" ON gemini_analyses;
DROP TRIGGER IF EXISTS on_profile_role_change ON profiles;

-- 3. Hapus default lama (jika ada), lalu update kolom role menggunakan enum
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;

ALTER TABLE profiles ALTER COLUMN role TYPE user_role 
USING role::text::user_role;

-- 4. Set default role untuk user baru dengan tipe enum yang benar
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'student'::user_role;

-- ==========================================
-- 4b. Tambahkan kolom username untuk hybrid login
-- ==========================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'username'
    ) THEN
        ALTER TABLE profiles ADD COLUMN username VARCHAR(50) UNIQUE;
    END IF;
END $$;

-- 4c. Buat index untuk lookup username (performa)
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- ==========================================
-- Buat ulang policy yang tadi dihapus
-- ==========================================
CREATE POLICY "Admin can manage gemini analyses" ON gemini_analyses
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() AND profiles.role IN ('admin'::user_role, 'super_admin'::user_role)
        )
    );

-- 5. Buat tabel admin_users untuk metadata tambahan admin
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE
);

-- ==========================================
-- ⚠️ PERBAIKAN FINAL: Pastikan semua kolom baru ditambahkan ke tabel lama
-- ==========================================
-- Rename last_login ke last_login_at jika ada
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'admin_users' AND column_name = 'last_login'
    ) THEN
        ALTER TABLE admin_users RENAME COLUMN last_login TO last_login_at;
    END IF;
END $$;

-- Tambahkan semua kolom baru jika belum ada di tabel lama
ALTER TABLE admin_users 
    ADD COLUMN IF NOT EXISTS admin_level VARCHAR(50) DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 6. Buat index untuk performa
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_admin_users_id ON admin_users(id);

-- 7. Buat fungsi untuk mengecek apakah user adalah admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = user_id 
        AND role IN ('admin', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Buat fungsi untuk mendapatkan role user
CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
DECLARE
    user_role_var user_role;
BEGIN
    SELECT role INTO user_role_var 
    FROM profiles 
    WHERE id = user_id;
    
    RETURN COALESCE(user_role_var, 'student'::user_role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- 8b. FUNGSI UNTUK HYBRID LOGIN (USERNAME/EMAIL)
-- ==========================================

-- Fungsi untuk mendapatkan email dari username
CREATE OR REPLACE FUNCTION get_email_by_username(p_username VARCHAR(50))
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
BEGIN
    -- Cari email berdasarkan username (case-insensitive)
    SELECT email INTO v_email 
    FROM profiles 
    WHERE LOWER(username) = LOWER(p_username);
    
    RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fungsi untuk resolve login identifier (bisa username atau email)
CREATE OR REPLACE FUNCTION resolve_login_identifier(identifier TEXT)
RETURNS TEXT AS $$
DECLARE
    v_email TEXT;
BEGIN
    -- Cek apakah identifier adalah email (mengandung @)
    IF position('@' IN identifier) > 0 THEN
        -- Sudah email, return langsung
        RETURN identifier;
    ELSE
        -- Bukan email, cari email dari username
        SELECT email INTO v_email 
        FROM profiles 
        WHERE LOWER(username) = LOWER(identifier);
        
        RETURN v_email;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fungsi untuk set username (untuk admin)
CREATE OR REPLACE FUNCTION set_username(
    p_user_id UUID,
    p_username VARCHAR(50)
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Update username
    UPDATE profiles 
    SET username = p_username
    WHERE id = p_user_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Buat fungsi untuk promote user ke admin
CREATE OR REPLACE FUNCTION promote_to_admin(
    target_user_id UUID,
    promoter_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Cek apakah promoter adalah admin
    IF NOT is_admin(promoter_id) THEN
        RAISE EXCEPTION 'Only admins can promote other users';
    END IF;
    
    -- Update role
    UPDATE profiles 
    SET role = 'admin'::user_role
    WHERE id = target_user_id;
    
    -- Insert ke admin_users
    INSERT INTO admin_users (id, created_by)
    VALUES (target_user_id, promoter_id)
    ON CONFLICT (id) DO UPDATE SET updated_at = NOW();
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Buat fungsi untuk demote admin ke student
CREATE OR REPLACE FUNCTION demote_from_admin(
    target_user_id UUID,
    demoter_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Cek apakah demoter adalah super_admin
    IF get_user_role(demoter_id) != 'super_admin'::user_role THEN
        RAISE EXCEPTION 'Only super admins can demote other admins';
    END IF;
    
    -- Update role
    UPDATE profiles 
    SET role = 'student'::user_role
    WHERE id = target_user_id;
    
    -- Update admin_users
    UPDATE admin_users 
    SET is_active = false, updated_at = NOW()
    WHERE id = target_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Buat fungsi untuk update last login
CREATE OR REPLACE FUNCTION update_admin_login(user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE admin_users 
    SET 
        last_login_at = NOW(),
        login_count = login_count + 1,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Buat trigger untuk auto-create admin_users entry
CREATE OR REPLACE FUNCTION handle_admin_role_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role IN ('admin', 'super_admin') THEN
        INSERT INTO admin_users (id, is_active)
        VALUES (NEW.id, true)
        ON CONFLICT (id) DO UPDATE SET 
            is_active = true,
            updated_at = NOW();
    ELSIF OLD.role IN ('admin', 'super_admin') AND NEW.role = 'student'::user_role THEN
        UPDATE admin_users 
        SET is_active = false, updated_at = NOW()
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 13. Buat trigger
-- (Tadi sudah di drop di atas, sekarang dibuat ulang dengan aman)
CREATE TRIGGER on_profile_role_change
    AFTER INSERT OR UPDATE OF role ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION handle_admin_role_change();

-- 14. Set RLS policies untuk admin_users
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Admin bisa melihat semua admin
DROP POLICY IF EXISTS "Admins can view all admin users" ON admin_users;
CREATE POLICY "Admins can view all admin users" ON admin_users
    FOR SELECT USING (is_admin(auth.uid()));

-- Policy: Super admin bisa insert
DROP POLICY IF EXISTS "Super admins can insert admin users" ON admin_users;
CREATE POLICY "Super admins can insert admin users" ON admin_users
    FOR INSERT WITH CHECK (get_user_role(auth.uid()) = 'super_admin'::user_role);

-- Policy: Admin bisa update diri sendiri
DROP POLICY IF EXISTS "Admins can update own record" ON admin_users;
CREATE POLICY "Admins can update own record" ON admin_users
    FOR UPDATE USING (id = auth.uid());

-- 15. Buat tabel untuk audit log admin
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES profiles(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk audit log
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at);

-- 16. Fungsi untuk log admin action
CREATE OR REPLACE FUNCTION log_admin_action(
    p_action VARCHAR(100),
    p_entity_type VARCHAR(50) DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO admin_audit_log (
        admin_id, action, entity_type, entity_id, 
        old_values, new_values
    ) VALUES (
        auth.uid(), p_action, p_entity_type, p_entity_id,
        p_old_values, p_new_values
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 17. Buat view untuk admin dashboard
-- (Tadi dihapus di atas agar aman, sekarang dibuat ulang)
CREATE OR REPLACE VIEW admin_dashboard_view AS
SELECT 
    p.id,
    p.nama_lengkap,
    p.username,  -- Ditambahkan kolom username di sini
    p.email,
    p.role,
    au.last_login_at,
    au.login_count,
    au.is_active,
    au.permissions
FROM profiles p
LEFT JOIN admin_users au ON p.id = au.id
WHERE p.role IN ('admin', 'super_admin');

-- ==========================================
-- GRANT PERMISSIONS
-- ==========================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin_users TO authenticated;
GRANT SELECT ON admin_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_email_by_username(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_login_identifier(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_username(UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION promote_to_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION demote_from_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_admin_login(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION log_admin_action(VARCHAR, VARCHAR, UUID, JSONB, JSONB) TO authenticated;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE admin_users IS 'Metadata tambahan untuk admin users';
COMMENT ON TABLE admin_audit_log IS 'Log semua aksi admin untuk audit trail';
COMMENT ON FUNCTION is_admin(UUID) IS 'Cek apakah user adalah admin';
COMMENT ON FUNCTION get_user_role(UUID) IS 'Mendapatkan role user';
COMMENT ON FUNCTION get_email_by_username(VARCHAR) IS 'Mendapatkan email berdasarkan username';
COMMENT ON FUNCTION resolve_login_identifier(TEXT) IS 'Konversi username ke email jika diperlukan untuk login';
COMMENT ON FUNCTION set_username(UUID, VARCHAR) IS 'Set username untuk user';
COMMENT ON FUNCTION promote_to_admin(UUID, UUID) IS 'Promote user ke admin';
COMMENT ON FUNCTION demote_from_admin(UUID, UUID) IS 'Demote admin ke student';