-- TKA Comprehensive Analysis Schema
-- Schema untuk menyimpan hasil analisis komprehensif TKA menggunakan Gemini AI

-- Tabel untuk menyimpan analisis komprehensif siswa
CREATE TABLE IF NOT EXISTS student_comprehensive_analyses (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    analysis_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes untuk performa
    CONSTRAINT unique_student_analysis UNIQUE (student_id),
    INDEX idx_student_comprehensive_analyses_student_id ON student_comprehensive_analyses(student_id),
    INDEX idx_student_comprehensive_analyses_created_at ON student_comprehensive_analyses(created_at)
);

-- Tabel untuk menyimpan hasil analisis batch kelas
CREATE TABLE IF NOT EXISTS class_tka_analyses (
    id SERIAL PRIMARY KEY,
    class_name VARCHAR(100),
    analysis_data JSONB NOT NULL,
    total_students INTEGER NOT NULL,
    successful_analyses INTEGER NOT NULL,
    average_predicted_score DECIMAL(5,2),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes
    INDEX idx_class_tka_analyses_class_name ON class_tka_analyses(class_name),
    INDEX idx_class_tka_analyses_generated_at ON class_tka_analyses(generated_at)
);

-- Tabel untuk menyimpan rekomendasi personal siswa
CREATE TABLE IF NOT EXISTS student_tka_recommendations (
    id SERIAL PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recommendation_type VARCHAR(50) NOT NULL, -- 'tips', 'learning_plan', 'improvement'
    recommendation_data JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,

    -- Indexes
    INDEX idx_student_tka_recommendations_student_id ON student_tka_recommendations(student_id),
    INDEX idx_student_tka_recommendations_type ON student_tka_recommendations(recommendation_type),
    INDEX idx_student_tka_recommendations_active ON student_tka_recommendations(is_active)
);

-- Function untuk mendapatkan analisis TKA terbaru siswa
CREATE OR REPLACE FUNCTION get_latest_student_tka_analysis(student_uuid UUID)
RETURNS TABLE (
    analysis_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sca.analysis_data,
        sca.created_at
    FROM student_comprehensive_analyses sca
    WHERE sca.student_id = student_uuid
    ORDER BY sca.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function untuk mendapatkan rekomendasi TKA aktif siswa
CREATE OR REPLACE FUNCTION get_active_student_tka_recommendations(student_uuid UUID)
RETURNS TABLE (
    recommendation_type VARCHAR(50),
    recommendation_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        str.recommendation_type,
        str.recommendation_data,
        str.created_at
    FROM student_tka_recommendations str
    WHERE str.student_id = student_uuid
      AND str.is_active = TRUE
      AND (str.expires_at IS NULL OR str.expires_at > NOW())
    ORDER BY str.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function untuk cleanup rekomendasi expired
CREATE OR REPLACE FUNCTION cleanup_expired_tka_recommendations()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM student_tka_recommendations
    WHERE is_active = TRUE
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_comprehensive_analyses_updated_at
    BEFORE UPDATE ON student_comprehensive_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE student_comprehensive_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_tka_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_tka_recommendations ENABLE ROW LEVEL SECURITY;

-- Policy untuk student_comprehensive_analyses
CREATE POLICY "Students can view their own comprehensive analyses"
    ON student_comprehensive_analyses FOR SELECT
    USING (auth.uid() = student_id);

CREATE POLICY "Admins can view all comprehensive analyses"
    ON student_comprehensive_analyses FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy untuk class_tka_analyses (admin only)
CREATE POLICY "Admins can manage class TKA analyses"
    ON class_tka_analyses FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy untuk student_tka_recommendations
CREATE POLICY "Students can view their own TKA recommendations"
    ON student_tka_recommendations FOR SELECT
    USING (auth.uid() = student_id);

CREATE POLICY "Admins can manage all TKA recommendations"
    ON student_tka_recommendations FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Comments
COMMENT ON TABLE student_comprehensive_analyses IS 'Menyimpan hasil analisis komprehensif TKA untuk setiap siswa menggunakan Gemini AI';
COMMENT ON TABLE class_tka_analyses IS 'Menyimpan hasil analisis TKA untuk seluruh kelas';
COMMENT ON TABLE student_tka_recommendations IS 'Menyimpan rekomendasi personal TKA untuk siswa';

COMMENT ON COLUMN student_comprehensive_analyses.analysis_data IS 'JSON berisi masteredCompetencies, areasForImprovement, tkaTipsAndTricks, learningRecommendations, dll';
COMMENT ON COLUMN class_tka_analyses.analysis_data IS 'JSON berisi commonStrengths, commonWeaknesses, classRecommendations, dll';