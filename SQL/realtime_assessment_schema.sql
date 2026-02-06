-- realtime_assessment_schema.sql - FIXED & IDEMPOTENT
-- Database schema for Real-time Assessment System

-- ==========================================
-- 1. TABLES & INDEXES
-- ==========================================

-- Table: assessment_sessions
CREATE TABLE IF NOT EXISTS assessment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    concept_id TEXT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
    final_knowledge_state FLOAT,
    engagement_score FLOAT,
    questions_answered INTEGER DEFAULT 0,
    accuracy FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user_id ON assessment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_concept_id ON assessment_sessions(concept_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_status ON assessment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_start_time ON assessment_sessions(start_time);

-- Table: assessment_responses
CREATE TABLE IF NOT EXISTS assessment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL,
    selected_answer TEXT,
    is_correct BOOLEAN NOT NULL,
    time_spent INTEGER, -- in milliseconds
    knowledge_state FLOAT, -- BKT knowledge state after response
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_responses_session_id ON assessment_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_responses_question_id ON assessment_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_assessment_responses_timestamp ON assessment_responses(timestamp);

-- Table: assessment_interactions
CREATE TABLE IF NOT EXISTS assessment_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    concept_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL,
    interaction_data JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    time_since_start INTEGER, -- milliseconds since session start
    time_since_last_activity INTEGER -- milliseconds since last interaction
);

CREATE INDEX IF NOT EXISTS idx_assessment_interactions_session_id ON assessment_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_assessment_interactions_user_id ON assessment_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_interactions_type ON assessment_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_assessment_interactions_timestamp ON assessment_interactions(timestamp);

-- Table: bkt_parameters
CREATE TABLE IF NOT EXISTS bkt_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id TEXT NOT NULL UNIQUE,
    p_l0 FLOAT NOT NULL DEFAULT 0.1, -- Prior probability of knowing
    p_t FLOAT NOT NULL DEFAULT 0.3,  -- Probability of learning
    p_g FLOAT NOT NULL DEFAULT 0.2,  -- Probability of guessing
    p_s FLOAT NOT NULL DEFAULT 0.1,  -- Probability of slipping
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bkt_parameters_concept_id ON bkt_parameters(concept_id);

-- Table: question_parameters
CREATE TABLE IF NOT EXISTS question_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL UNIQUE,
    concept_id TEXT NOT NULL,
    difficulty FLOAT NOT NULL DEFAULT 0.5,
    discrimination FLOAT NOT NULL DEFAULT 1.0,
    guessing FLOAT NOT NULL DEFAULT 0.0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_parameters_question_id ON question_parameters(question_id);
CREATE INDEX IF NOT EXISTS idx_question_parameters_concept_id ON question_parameters(concept_id);
CREATE INDEX IF NOT EXISTS idx_question_parameters_difficulty ON question_parameters(difficulty);

-- ==========================================
-- 2. RLS POLICIES (Fixed with DROP IF EXISTS)
-- ==========================================

-- Enable RLS
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bkt_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_parameters ENABLE ROW LEVEL SECURITY;

-- Policies for assessment_sessions
DROP POLICY IF EXISTS "Users can view their own assessment sessions" ON assessment_sessions;
CREATE POLICY "Users can view their own assessment sessions" ON assessment_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own assessment sessions" ON assessment_sessions;
CREATE POLICY "Users can insert their own assessment sessions" ON assessment_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own assessment sessions" ON assessment_sessions;
CREATE POLICY "Users can update their own assessment sessions" ON assessment_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Policies for assessment_responses
DROP POLICY IF EXISTS "Users can view their own assessment responses" ON assessment_responses;
CREATE POLICY "Users can view their own assessment responses" ON assessment_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM assessment_sessions
            WHERE assessment_sessions.id = assessment_responses.session_id
            AND assessment_sessions.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert their own assessment responses" ON assessment_responses;
CREATE POLICY "Users can insert their own assessment responses" ON assessment_responses
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM assessment_sessions
            WHERE assessment_sessions.id = assessment_responses.session_id
            AND assessment_sessions.user_id = auth.uid()
        )
    );

-- Policies for assessment_interactions
DROP POLICY IF EXISTS "Users can view their own assessment interactions" ON assessment_interactions;
CREATE POLICY "Users can view their own assessment interactions" ON assessment_interactions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own assessment interactions" ON assessment_interactions;
CREATE POLICY "Users can insert their own assessment interactions" ON assessment_interactions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for bkt_parameters
DROP POLICY IF EXISTS "Authenticated users can view BKT parameters" ON bkt_parameters;
CREATE POLICY "Authenticated users can view BKT parameters" ON bkt_parameters
    FOR SELECT TO authenticated USING (true);

-- Policies for question_parameters
DROP POLICY IF EXISTS "Authenticated users can view question parameters" ON question_parameters;
CREATE POLICY "Authenticated users can view question parameters" ON question_parameters
    FOR SELECT TO authenticated USING (true);

-- ==========================================
-- 3. TRIGGERS (Fixed with DROP IF EXISTS)
-- ==========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger: assessment_sessions
DROP TRIGGER IF EXISTS update_assessment_sessions_updated_at ON assessment_sessions;
CREATE TRIGGER update_assessment_sessions_updated_at
    BEFORE UPDATE ON assessment_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: bkt_parameters
DROP TRIGGER IF EXISTS update_bkt_parameters_updated_at ON bkt_parameters;
CREATE TRIGGER update_bkt_parameters_updated_at
    BEFORE UPDATE ON bkt_parameters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: question_parameters
DROP TRIGGER IF EXISTS update_question_parameters_updated_at ON question_parameters;
CREATE TRIGGER update_question_parameters_updated_at
    BEFORE UPDATE ON question_parameters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 4. INITIAL DATA
-- ==========================================

INSERT INTO bkt_parameters (concept_id, p_l0, p_t, p_g, p_s) VALUES
    ('aritmatika_dasar', 0.2, 0.4, 0.1, 0.05),
    ('aljabar_dasar', 0.1, 0.3, 0.15, 0.08),
    ('geometri_dasar', 0.15, 0.35, 0.12, 0.07),
    ('persamaan_linear', 0.05, 0.25, 0.2, 0.1),
    ('bangun_datar', 0.12, 0.32, 0.14, 0.06),
    ('pecahan_desimal', 0.18, 0.38, 0.11, 0.04),
    ('sistem_persamaan', 0.03, 0.2, 0.25, 0.12),
    ('trigonometri', 0.08, 0.28, 0.18, 0.09),
    ('statistika_dasar', 0.14, 0.33, 0.13, 0.05),
    ('fungsi_kuadrat', 0.04, 0.22, 0.23, 0.11),
    ('geometri_analitik', 0.06, 0.24, 0.21, 0.1),
    ('probabilitas', 0.11, 0.31, 0.16, 0.07)
ON CONFLICT (concept_id) DO NOTHING;

-- ==========================================
-- 5. VIEWS (Fixed with DROP IF EXISTS)
-- ==========================================

-- View for assessment session summaries
-- Catatan: Pastikan tabel "profiles" sudah ada. Jika belum, view ini akan error.
DROP VIEW IF EXISTS assessment_session_summaries;
CREATE OR REPLACE VIEW assessment_session_summaries AS
SELECT
    s.id,
    s.user_id,
    p.full_name as user_name,
    p.class_name,
    s.concept_id,
    s.start_time,
    s.end_time,
    s.status,
    s.final_knowledge_state,
    s.engagement_score,
    s.questions_answered,
    s.accuracy,
    EXTRACT(EPOCH FROM (s.end_time - s.start_time)) as duration_seconds,
    COUNT(r.id) as total_responses,
    COUNT(CASE WHEN r.is_correct THEN 1 END) as correct_responses
FROM assessment_sessions s
LEFT JOIN profiles p ON s.user_id = p.id
LEFT JOIN assessment_responses r ON s.id = r.session_id
GROUP BY s.id, s.user_id, p.full_name, p.class_name, s.concept_id, s.start_time, s.end_time,
         s.status, s.final_knowledge_state, s.engagement_score, s.questions_answered, s.accuracy;

-- View for interaction analytics
DROP VIEW IF EXISTS assessment_interaction_analytics;
CREATE OR REPLACE VIEW assessment_interaction_analytics AS
SELECT
    i.session_id,
    i.user_id,
    i.concept_id,
    i.interaction_type,
    COUNT(*) as interaction_count,
    AVG(i.time_since_last_activity) as avg_time_between_interactions,
    MIN(i.timestamp) as first_interaction,
    MAX(i.timestamp) as last_interaction
FROM assessment_interactions i
GROUP BY i.session_id, i.user_id, i.concept_id, i.interaction_type;

-- ==========================================
-- 6. FUNCTIONS
-- ==========================================

-- Function to get user assessment statistics
CREATE OR REPLACE FUNCTION get_user_assessment_stats(user_uuid UUID)
RETURNS TABLE (
    concept_id TEXT,
    sessions_count BIGINT,
    avg_knowledge_state FLOAT,
    avg_engagement FLOAT,
    avg_accuracy FLOAT,
    total_questions BIGINT,
    last_session TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.concept_id,
        COUNT(DISTINCT s.id) as sessions_count,
        AVG(s.final_knowledge_state) as avg_knowledge_state,
        AVG(s.engagement_score) as avg_engagement,
        AVG(s.accuracy) as avg_accuracy,
        SUM(s.questions_answered) as total_questions,
        MAX(s.end_time) as last_session
    FROM assessment_sessions s
    WHERE s.user_id = user_uuid AND s.status = 'completed'
    GROUP BY s.concept_id
    ORDER BY last_session DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get concept assessment analytics
CREATE OR REPLACE FUNCTION get_concept_assessment_analytics(concept TEXT)
RETURNS TABLE (
    total_sessions BIGINT,
    avg_final_knowledge FLOAT,
    avg_engagement FLOAT,
    avg_accuracy FLOAT,
    avg_session_duration FLOAT,
    completion_rate FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) as total_sessions,
        AVG(final_knowledge_state) as avg_final_knowledge,
        AVG(engagement_score) as avg_engagement,
        AVG(accuracy) as avg_accuracy,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_session_duration,
        COUNT(CASE WHEN status = 'completed' THEN 1 END)::FLOAT / COUNT(*) as completion_rate
    FROM assessment_sessions
    WHERE concept_id = concept AND end_time IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;