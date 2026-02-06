-- ==========================================
-- FIX: Gemini Analyses RLS Policy (Error 403)
-- ==========================================
-- Masalah: Siswa tidak bisa menyimpan analisis AI karena RLS hanya mengizinkan admin
-- Solusi: Tambahkan policy agar siswa bisa mengelola analisis untuk jawaban mereka sendiri

-- 1. Hapus policy yang bermasalah (jika ada)
DROP POLICY IF EXISTS "Users can manage analyses for their answers" ON gemini_analyses;

-- 2. Buat policy baru yang mengizinkan siswa mengelola analisis jawaban mereka sendiri
CREATE POLICY "Users can manage analyses for their answers" ON gemini_analyses
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM exam_answers
            WHERE exam_answers.id = gemini_analyses.answer_id
            AND exam_answers.user_id = auth.uid()
        )
    );

-- 3. Verifikasi policy sudah aktif
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'gemini_analyses'
ORDER BY policyname;

-- 4. Test query (ganti dengan UUID yang valid)
-- SELECT * FROM gemini_analyses WHERE answer_id = 'your-answer-uuid-here';</content>
