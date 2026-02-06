-- ==========================================
-- 1. PERBAIKAN DEPENDENCY (Mengatasi Error 42703)
-- ==========================================
-- Cek apakah kolom 'role' ada di tabel 'profiles'. Jika tidak, tambahkan.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'student';
    END IF;
END $$;

-- ==========================================
-- 2. TABEL UTAMA
-- ==========================================
CREATE TABLE IF NOT EXISTS gemini_analyses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    answer_id UUID NOT NULL REFERENCES exam_answers(id) ON DELETE CASCADE,
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Pastikan satu jawaban hanya punya satu analisis
    UNIQUE(answer_id)
);

-- ==========================================
-- 3. INDEXING (Optimasi Performa)
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_gemini_analyses_answer_id ON gemini_analyses(answer_id);
CREATE INDEX IF NOT EXISTS idx_gemini_analyses_created_at ON gemini_analyses(created_at);

-- Index pada JSONB: 
-- Score dicast ke numeric agar sorting angka valid (10 > 2), bukan sorting string ("10" < "2")
CREATE INDEX IF NOT EXISTS idx_gemini_analyses_score 
    ON gemini_analyses(((analysis_data->>'score')::numeric));

CREATE INDEX IF NOT EXISTS idx_gemini_analyses_correctness 
    ON gemini_analyses((analysis_data->>'correctness'));

-- ==========================================
-- 4. SECURITY (RLS)
-- ==========================================
ALTER TABLE gemini_analyses ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada untuk mencegah konflik saat run ulang
DROP POLICY IF EXISTS "Admin can manage gemini analyses" ON gemini_analyses;
DROP POLICY IF EXISTS "Users can manage analyses for their answers" ON gemini_analyses;

-- Policy untuk admin: bisa mengelola semua analisis
CREATE POLICY "Admin can manage gemini analyses" ON gemini_analyses
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy untuk siswa: bisa menyimpan dan melihat analisis untuk jawaban mereka sendiri
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

-- Opsional: Policy agar Siswa bisa MELIHAT hasil analisis miliknya sendiri
-- Uncomment jika diperlukan:
/*
CREATE POLICY "Student can view own analyses" ON gemini_analyses
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM exam_answers
            WHERE exam_answers.id = gemini_analyses.answer_id
            AND exam_answers.user_id = auth.uid()
        )
    );
*/

-- ==========================================
-- 5. AUTOMATION (Trigger Timestamp)
-- ==========================================
CREATE OR REPLACE FUNCTION update_gemini_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_gemini_analysis_updated_at ON gemini_analyses;

CREATE TRIGGER trigger_update_gemini_analysis_updated_at
    BEFORE UPDATE ON gemini_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_gemini_analysis_updated_at();

-- ==========================================
-- 6. ANALYTICS VIEW (Diperbaiki)
-- ==========================================
-- Catatan: Bagian 'jsonb_object_keys' dihapus dari summary view sederhana ini 
-- karena akan menyebabkan error "set-returning functions" jika digabung dengan aggregate.
CREATE OR REPLACE VIEW gemini_analytics_summary AS
SELECT
    COUNT(*) as total_analyses,
    -- Coalesce untuk menangani jika score null, dan cast ke float
    AVG(COALESCE((analysis_data->>'score')::float, 0)) as avg_score,
    COUNT(CASE WHEN (analysis_data->>'correctness') = 'Benar Lengkap' THEN 1 END) as correct_answers,
    COUNT(CASE WHEN (analysis_data->>'correctness') = 'Sebagian Benar' THEN 1 END) as partial_answers,
    COUNT(CASE WHEN (analysis_data->>'correctness') = 'Salah' THEN 1 END) as incorrect_answers
FROM gemini_analyses;

-- ==========================================
-- 7. PERMISSIONS
-- ==========================================
GRANT SELECT, INSERT, UPDATE, DELETE ON gemini_analyses TO authenticated;
GRANT SELECT ON gemini_analytics_summary TO authenticated;

-- ==========================================
-- 8. UPDATE RLS POLICY (PERBAIKAN ERROR 403)
-- ==========================================
-- Jalankan query ini secara manual di Supabase SQL Editor untuk memperbaiki error 403:

-- DROP POLICY IF EXISTS "Users can manage analyses for their answers" ON gemini_analyses;
-- CREATE POLICY "Users can manage analyses for their answers" ON gemini_analyses
--     FOR ALL
--     TO authenticated
--     USING (
--         EXISTS (
--             SELECT 1 FROM exam_answers
--             WHERE exam_answers.id = gemini_analyses.answer_id
--             AND exam_answers.user_id = auth.uid()
--         )
--     );