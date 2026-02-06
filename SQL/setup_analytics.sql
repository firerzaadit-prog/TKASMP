-- 0. BERSIHKAN TABEL LAMA (PENTING: Agar skema tabel diperbarui)
DROP TABLE IF EXISTS public.student_analytics CASCADE;

-- 1. Create student_analytics table
CREATE TABLE IF NOT EXISTS public.student_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter TEXT NOT NULL,
    sub_chapter TEXT NOT NULL,
    total_questions_attempted INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    average_time_seconds DECIMAL DEFAULT 0, -- Kolom ini sekarang pasti terbuat
    mastery_level DECIMAL DEFAULT 0,
    skill_radar_data JSONB DEFAULT '[]'::jsonb,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint Unik untuk ON CONFLICT
    CONSTRAINT unique_user_chapter_sub UNIQUE (user_id, chapter, sub_chapter)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_student_analytics_user_id ON public.student_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_student_analytics_chapter ON public.student_analytics(chapter);

-- 3. Enable RLS
ALTER TABLE public.student_analytics ENABLE ROW LEVEL SECURITY;

-- 4. Create policies
-- (Hapus policy lama jika ada, meskipun tabel sudah di-drop, ini good practice)
DROP POLICY IF EXISTS "Students can view their own analytics" ON public.student_analytics;
CREATE POLICY "Students can view their own analytics" ON public.student_analytics
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage student analytics" ON public.student_analytics;
CREATE POLICY "Admins can manage student analytics" ON public.student_analytics
    FOR ALL USING (auth.role() = 'authenticated'); -- Sesuaikan role jika perlu service_role

-- 5. Insert demo data for THE CURRENT USER
INSERT INTO public.student_analytics (
    user_id, chapter, sub_chapter, total_questions_attempted, correct_answers, 
    average_time_seconds, mastery_level, skill_radar_data, last_updated
) 
VALUES
(auth.uid(), 'Bilangan', 'Bilangan Real', 15, 12, 45.5, 0.8,
 '[{"skill": "Bilangan", "level": 80}]', NOW()),
(auth.uid(), 'Aljabar', 'Persamaan dan Pertidaksamaan Linier', 20, 16, 52.3, 0.8,
 '[{"skill": "Aljabar", "level": 80}]', NOW()),
(auth.uid(), 'Geometri dan Pengukuran', 'Objek Geometri', 18, 13, 48.7, 0.72,
 '[{"skill": "Geometri dan Pengukuran", "level": 72}]', NOW()),
(auth.uid(), 'Data dan Peluang', 'Data', 12, 9, 42.1, 0.75,
 '[{"skill": "Data dan Peluang", "level": 75}]', NOW())

ON CONFLICT (user_id, chapter, sub_chapter) DO UPDATE SET
    total_questions_attempted = EXCLUDED.total_questions_attempted,
    correct_answers = EXCLUDED.correct_answers,
    average_time_seconds = EXCLUDED.average_time_seconds,
    mastery_level = EXCLUDED.mastery_level,
    skill_radar_data = EXCLUDED.skill_radar_data,
    last_updated = NOW();

-- 6. Insert General Analytics (Global Stats - User ID NULL)
INSERT INTO public.student_analytics (
    user_id, chapter, sub_chapter, total_questions_attempted, correct_answers, 
    average_time_seconds, mastery_level, skill_radar_data, last_updated
) 
VALUES
(NULL, 'Bilangan', 'Bilangan Real', 65, 51, 41.9, 0.78, '[{"skill": "Bilangan", "level": 78}]', NOW()),
(NULL, 'Aljabar', 'Persamaan dan Pertidaksamaan Linier', 64, 50, 52.4, 0.78, '[{"skill": "Aljabar", "level": 78}]', NOW()),
(NULL, 'Geometri dan Pengukuran', 'Objek Geometri', 55, 41, 48.3, 0.75, '[{"skill": "Geometri dan Pengukuran", "level": 75}]', NOW())

-- Catatan: ON CONFLICT dengan NULL user_id mungkin tidak bekerja di beberapa versi Postgres standar
-- tapi insert biasa tetap akan jalan.
ON CONFLICT DO NOTHING;