-- Category Answers Table for PGK Kategori questions
-- This table stores individual answers for each statement in category questions

CREATE TABLE IF NOT EXISTS category_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    exam_session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    statement_text TEXT NOT NULL,
    selected_answer BOOLEAN,
    is_correct BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one answer per statement per exam session per question
    UNIQUE(exam_session_id, question_id, statement_text)
);

-- Add RLS policies
ALTER TABLE category_answers ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own answers
CREATE POLICY "Users can view their own category answers" ON category_answers
    FOR SELECT USING (
        exam_session_id IN (
            SELECT id FROM exam_sessions WHERE user_id = auth.uid()
        )
    );

-- Policy for users to insert their own answers
CREATE POLICY "Users can insert their own category answers" ON category_answers
    FOR INSERT WITH CHECK (
        exam_session_id IN (
            SELECT id FROM exam_sessions WHERE user_id = auth.uid()
        )
    );

-- Policy for users to update their own answers
CREATE POLICY "Users can update their own category answers" ON category_answers
    FOR UPDATE USING (
        exam_session_id IN (
            SELECT id FROM exam_sessions WHERE user_id = auth.uid()
        )
    );

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_category_answers_session_question ON category_answers(exam_session_id, question_id);
CREATE INDEX IF NOT EXISTS idx_category_answers_statement ON category_answers(statement_text);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_category_answers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_category_answers_updated_at
    BEFORE UPDATE ON category_answers
    FOR EACH ROW
    EXECUTE FUNCTION update_category_answers_updated_at();