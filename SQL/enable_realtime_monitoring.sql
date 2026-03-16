-- ==========================================
-- ENABLE REALTIME MONITORING FOR EXAM ANSWERS
-- ==========================================

-- 1. Enable Realtime for exam_answers table
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_answers;

-- 2. Enable Realtime for exam_sessions table (to track active sessions)
ALTER PUBLICATION supabase_realtime ADD TABLE public.exam_sessions;

-- 3. Grant necessary permissions for realtime
GRANT USAGE ON SCHEMA realtime TO authenticated;
GRANT ALL ON public.exam_answers TO authenticated;
GRANT ALL ON public.exam_sessions TO authenticated;

-- 4. Create index for faster realtime queries
-- CATATAN: 'answered_at' diubah menjadi 'created_at'. 
CREATE INDEX IF NOT EXISTS idx_exam_answers_time ON public.exam_answers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_status ON public.exam_sessions(status);

-- 5. Add comment for documentation
COMMENT ON TABLE public.exam_answers IS 'Stores student answers with realtime enabled for admin monitoring';
COMMENT ON TABLE public.exam_sessions IS 'Stores exam sessions with realtime enabled for tracking active exams';