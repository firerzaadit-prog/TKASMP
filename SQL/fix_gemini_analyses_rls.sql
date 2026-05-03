-- 1. Hapus policy lama yang salah target
DROP POLICY IF EXISTS "Users can manage analyses for their answers" ON gemini_analyses;
DROP POLICY IF EXISTS "Users can view their own session analysis" ON gemini_analyses;

-- 2. Buat policy BARU: Siswa HANYA BISA MEMBACA (SELECT) hasil analisis sesi mereka
CREATE POLICY "Users can view their own session analysis" ON gemini_analyses
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM exam_sessions
            WHERE exam_sessions.id = gemini_analyses.answer_id
            AND exam_sessions.user_id = auth.uid()
        )
    );

-- 3. Pastikan Admin tetap bisa menambah/mengubah data (INSERT/UPDATE)
-- (Lewati langkah ini jika Admin melakukan bypass RLS bawaan Supabase)
CREATE POLICY "Admins can insert and update analyses" ON gemini_analyses
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM admin_users 
            WHERE admin_users.id = auth.uid() 
            AND admin_users.is_admin = true
        )
    );

-- 4. Aktifkan RLS di tabel jika belum aktif
ALTER TABLE gemini_analyses ENABLE ROW LEVEL SECURITY;