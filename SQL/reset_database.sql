-- RESET DATABASE - Jalankan ini jika ada masalah dengan tabel yang sudah ada
-- Run this FIRST if you have existing tables causing conflicts

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS public.ai_analysis_logs CASCADE;
DROP TABLE IF EXISTS public.student_analytics CASCADE;
DROP TABLE IF EXISTS public.question_analytics CASCADE;
DROP TABLE IF EXISTS public.exam_answers CASCADE;
DROP TABLE IF EXISTS public.exam_sessions CASCADE;
DROP TABLE IF EXISTS public.question_set_questions CASCADE;
DROP TABLE IF EXISTS public.question_sets CASCADE;
DROP TABLE IF EXISTS public.question_attempts CASCADE;
DROP TABLE IF EXISTS public.questions CASCADE;

-- Verify all tables are dropped
SELECT 'Database reset complete - all tables dropped' as status;