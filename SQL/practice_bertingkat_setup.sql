-- ============================================================
-- FITUR: LATIHAN SOAL BERTINGKAT (Tahap 1 -> 2 -> 3) per Bab/Topik
-- ============================================================
-- Tabel-tabel di file ini SENGAJA dibuat baru & terpisah total dari:
--   - materials, material_progress, material_sections   (modul Materi)
--   - questions, question_sets, question_attempts,
--     exam_sessions, exam_answers                         (modul Simulasi/Evaluasi TKA)
--
-- Jalankan seluruh isi file ini di Supabase Dashboard -> SQL Editor.
-- Aman dijalankan ulang (idempotent): pakai IF NOT EXISTS / CREATE OR REPLACE.
--
-- Catatan penamaan: kolom "stage" pada tabel = "Tahap" pada UI admin/siswa.
-- Sengaja TIDAK memakai kata "level" di kolom UI-facing, karena form Soal
-- yang sudah ada memakai "Level Kognitif" (Level 1/2/3) untuk konsep yang
-- berbeda (taksonomi kesulitan soal), bukan progres pengerjaan bertingkat.
-- ============================================================


-- ------------------------------------------------------------
-- 1) practice_questions - bank soal latihan (dikelola admin)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter         VARCHAR(100) NOT NULL,          -- taksonomi sama dgn materials.chapter / questions.chapter
    sub_chapter     VARCHAR(100),                   -- opsional, sekadar tag/filter admin. TIDAK dipakai untuk logic unlock (Opsi A = per chapter)
    stage           SMALLINT NOT NULL CHECK (stage IN (1, 2, 3)),
    question_text   TEXT NOT NULL,
    option_a        TEXT NOT NULL,
    option_b        TEXT NOT NULL,
    option_c        TEXT NOT NULL,
    option_d        TEXT NOT NULL,
    correct_answer  CHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    explanation     TEXT,                           -- pembahasan, ditampilkan ke siswa setelah submit
    image_url       TEXT,                           -- opsional, disimpan di bucket storage 'images' (folder practice-images/)
    is_active       BOOLEAN DEFAULT true,
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_questions_chapter_stage
    ON public.practice_questions (chapter, stage);

CREATE INDEX IF NOT EXISTS idx_practice_questions_active
    ON public.practice_questions (chapter, stage)
    WHERE is_active = true;


-- ------------------------------------------------------------
-- 2) practice_progress - status siswa per (siswa, topik, tahap)
--    Baris hanya dibuat/di-upsert saat siswa mulai/menyelesaikan
--    percobaan pada suatu tahap (lazy create). Jika baris belum ada:
--      - Tahap 1  dianggap "unlocked" (default terbuka)
--      - Tahap 2/3 dianggap "locked"
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter         VARCHAR(100) NOT NULL,
    stage           SMALLINT NOT NULL CHECK (stage IN (1, 2, 3)),
    status          VARCHAR(20) DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'passed')),
    best_score      INTEGER DEFAULT 0,
    attempts_count  INTEGER DEFAULT 0,
    passed_at       TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, chapter, stage)
);

CREATE INDEX IF NOT EXISTS idx_practice_progress_user
    ON public.practice_progress (user_id);


-- ------------------------------------------------------------
-- 3) practice_attempts - histori tiap kali siswa submit satu tahap
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.practice_attempts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    chapter            VARCHAR(100) NOT NULL,
    stage              SMALLINT NOT NULL CHECK (stage IN (1, 2, 3)),
    score_correct      INTEGER NOT NULL,
    total_questions    INTEGER DEFAULT 10,
    is_passed          BOOLEAN NOT NULL,
    answers            JSONB,             -- detail per soal: [{question_id, question_text, selected_answer, correct_answer, is_correct, explanation}]
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_chapter_stage
    ON public.practice_attempts (user_id, chapter, stage);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_completed_at
    ON public.practice_attempts (completed_at DESC);


-- ------------------------------------------------------------
-- 4) Trigger updated_at (idempotent, aman dipakai bareng tabel lain)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_practice_questions_updated_at ON public.practice_questions;
CREATE TRIGGER trg_practice_questions_updated_at
    BEFORE UPDATE ON public.practice_questions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_practice_progress_updated_at ON public.practice_progress;
CREATE TRIGGER trg_practice_progress_updated_at
    BEFORE UPDATE ON public.practice_progress
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ------------------------------------------------------------
-- 5) Helper function untuk cek admin (dipakai di RLS policy)
--    Dibuat dengan nama khusus (practice_is_admin) supaya migration
--    ini SELF-CONTAINED dan tidak bergantung pada function is_admin()
--    yang mungkin sudah/belum ada dari setup admin auth sebelumnya.
--    Cek berdasarkan kolom profiles.role (sama seperti sistem admin
--    auth yang sudah dipakai di ADMIN_AUTH_SETUP.md).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.practice_is_admin(uid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = uid
          AND p.role IN ('admin', 'super_admin')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ------------------------------------------------------------
-- 6) Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_attempts  ENABLE ROW LEVEL SECURITY;

-- practice_questions: siswa hanya boleh baca soal yang aktif; admin CRUD penuh (termasuk soal nonaktif)
DROP POLICY IF EXISTS "practice_questions_select_active" ON public.practice_questions;
CREATE POLICY "practice_questions_select_active" ON public.practice_questions
    FOR SELECT
    TO authenticated
    USING (is_active = true OR public.practice_is_admin(auth.uid()));

DROP POLICY IF EXISTS "practice_questions_admin_write" ON public.practice_questions;
CREATE POLICY "practice_questions_admin_write" ON public.practice_questions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.practice_is_admin(auth.uid()));

DROP POLICY IF EXISTS "practice_questions_admin_update" ON public.practice_questions;
CREATE POLICY "practice_questions_admin_update" ON public.practice_questions
    FOR UPDATE
    TO authenticated
    USING (public.practice_is_admin(auth.uid()))
    WITH CHECK (public.practice_is_admin(auth.uid()));

DROP POLICY IF EXISTS "practice_questions_admin_delete" ON public.practice_questions;
CREATE POLICY "practice_questions_admin_delete" ON public.practice_questions
    FOR DELETE
    TO authenticated
    USING (public.practice_is_admin(auth.uid()));

-- practice_progress: siswa hanya boleh baca/tulis baris miliknya sendiri; admin boleh baca semua (monitoring)
DROP POLICY IF EXISTS "practice_progress_own_select" ON public.practice_progress;
CREATE POLICY "practice_progress_own_select" ON public.practice_progress
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.practice_is_admin(auth.uid()));

DROP POLICY IF EXISTS "practice_progress_own_insert" ON public.practice_progress;
CREATE POLICY "practice_progress_own_insert" ON public.practice_progress
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "practice_progress_own_update" ON public.practice_progress;
CREATE POLICY "practice_progress_own_update" ON public.practice_progress
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- practice_attempts: siswa hanya boleh baca/tulis baris miliknya sendiri; admin boleh baca semua (monitoring)
DROP POLICY IF EXISTS "practice_attempts_own_select" ON public.practice_attempts;
CREATE POLICY "practice_attempts_own_select" ON public.practice_attempts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.practice_is_admin(auth.uid()));

DROP POLICY IF EXISTS "practice_attempts_own_insert" ON public.practice_attempts;
CREATE POLICY "practice_attempts_own_insert" ON public.practice_attempts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 7) Verifikasi cepat setelah menjalankan migration ini
-- ------------------------------------------------------------
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'practice_questions' ORDER BY ordinal_position;
--
-- SELECT COUNT(*) FROM public.practice_questions;
-- SELECT * FROM pg_policies WHERE tablename LIKE 'practice_%';

-- ------------------------------------------------------------
-- CATATAN GAMBAR SOAL:
-- image_url pada practice_questions memakai bucket storage 'images'
-- yang SUDAH ADA (dipakai juga oleh soal simulasi/evaluasi TKA), hanya
-- dengan folder path berbeda: practice-images/. Tidak perlu bucket baru
-- ataupun storage policy baru selama bucket 'images' sudah publik untuk
-- SELECT dan bisa di-upload oleh authenticated user (lihat STORAGE_BUCKET_FIX.md).
-- ------------------------------------------------------------
