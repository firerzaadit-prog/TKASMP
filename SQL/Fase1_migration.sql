-- =====================================================================
-- FASE 1 — MIGRASI DATABASE: Fitur Latihan Soal Bertingkat (Level 1-3)
-- Platform: TKASMP / EduLearn TKA
-- Disiapkan: 17 Agustus 2026
--
-- CARA PAKAI:
--   1. Buka Supabase Dashboard -> SQL Editor
--   2. Jalankan seluruh file ini sekali jalan (idempotent - aman dijalankan ulang)
--   3. Lihat bagian "VERIFIKASI" di paling bawah untuk cek hasil
--
-- Asumsi (sesuai Fase0_Keputusan_Final.md):
--   - D1: per materials.id (bukan per bab)
--   - D2: passing_score configurable per level, default 5/10
--   - D3: unlimited retry, best-attempt yang menentukan status lulus
--   - D4: level lulus tetap lulus meski attempt baru gagal (sticky)
--   - D5: tanpa timer ketat (time_limit_minutes disediakan, tidak dipakai di logic)
--   - D6: soal dari bank questions existing dan/atau soal baru
--   - D7: level 1 default unlocked bila is_active, level 2/3 mengikuti kelulusan
--   - Fungsi is_admin(uuid) SUDAH ADA di database (dari fix_admin_auth_security.sql,
--     dipakai juga oleh admin_users/profiles.role). Migration ini REUSE fungsi itu,
--     bukan bikin ulang.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. TABEL BARU
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 material_levels — satu baris = satu level (1/2/3) untuk satu materi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_levels (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id         UUID NOT NULL REFERENCES public.materials(id) ON DELETE RESTRICT,
    level_number        SMALLINT NOT NULL CHECK (level_number IN (1, 2, 3)),
    title               VARCHAR(255),
    total_questions     INTEGER NOT NULL DEFAULT 10,
    passing_score       INTEGER NOT NULL DEFAULT 5 CHECK (passing_score >= 0 AND passing_score <= 10),
    time_limit_minutes  INTEGER,                       -- opsional (D5), tidak dipakai di logika kunci saat ini
    is_active           BOOLEAN NOT NULL DEFAULT false, -- hanya boleh true kalau soal sudah tepat 10 (lihat trigger)
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT material_levels_total_questions_fixed CHECK (total_questions = 10),
    CONSTRAINT material_levels_unique_per_material UNIQUE (material_id, level_number)
);

COMMENT ON TABLE public.material_levels IS 'Level 1-3 latihan bertingkat per materi. is_active hanya boleh true jika jumlah soal terkait tepat 10 (dijaga trigger trg_validate_level_activation).';

CREATE INDEX IF NOT EXISTS idx_material_levels_material_id ON public.material_levels(material_id);

-- ---------------------------------------------------------------------
-- 1.2 material_level_questions — junction: soal mana saja di level tsb
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.material_level_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_id        UUID NOT NULL REFERENCES public.material_levels(id) ON DELETE CASCADE,
    question_id     UUID REFERENCES public.questions(id) ON DELETE SET NULL,
    order_position  INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT material_level_questions_unique_question UNIQUE (level_id, question_id),
    CONSTRAINT material_level_questions_unique_position UNIQUE (level_id, order_position),
    CONSTRAINT material_level_questions_position_range CHECK (order_position BETWEEN 1 AND 10)
);

COMMENT ON TABLE public.material_level_questions IS 'Relasi soal <-> level. question_id SET NULL kalau soal dihapus dari bank soal, supaya baris histori jawaban siswa tidak ikut hilang; trigger otomatis menonaktifkan level kalau jumlah soal valid < 10.';

CREATE INDEX IF NOT EXISTS idx_mlq_level_id ON public.material_level_questions(level_id);
CREATE INDEX IF NOT EXISTS idx_mlq_question_id ON public.material_level_questions(question_id);

-- ---------------------------------------------------------------------
-- 1.3 student_level_attempts — riwayat setiap kali siswa mengerjakan 1 level
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_level_attempts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    level_id         UUID NOT NULL REFERENCES public.material_levels(id) ON DELETE CASCADE,
    attempt_number   INTEGER NOT NULL,
    score            INTEGER NOT NULL DEFAULT 0,
    total_questions  INTEGER NOT NULL DEFAULT 10,
    is_passed        BOOLEAN NOT NULL DEFAULT false,
    status           VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    CONSTRAINT student_level_attempts_unique UNIQUE (user_id, level_id, attempt_number)
);

COMMENT ON TABLE public.student_level_attempts IS 'Riwayat percobaan siswa per level. Insert/update HANYA lewat RPC rpc_start_level_attempt / rpc_submit_level_attempt (lihat GRANT & RLS di bawah) - siswa tidak boleh insert langsung dari client.';

CREATE INDEX IF NOT EXISTS idx_sla_user_level ON public.student_level_attempts(user_id, level_id);
CREATE INDEX IF NOT EXISTS idx_sla_level_id ON public.student_level_attempts(level_id);

-- ---------------------------------------------------------------------
-- 1.4 student_level_answers — detail jawaban per soal per attempt
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_level_answers (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id            UUID NOT NULL REFERENCES public.student_level_attempts(id) ON DELETE CASCADE,
    question_id           UUID REFERENCES public.questions(id) ON DELETE SET NULL,
    selected_answer       TEXT,
    is_correct            BOOLEAN NOT NULL DEFAULT false,
    time_taken_seconds    INTEGER,
    answered_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT student_level_answers_unique UNIQUE (attempt_id, question_id)
);

COMMENT ON TABLE public.student_level_answers IS 'Detail jawaban per soal per attempt, mirror pola exam_answers. Insert HANYA lewat RPC rpc_submit_level_attempt.';

CREATE INDEX IF NOT EXISTS idx_slan_attempt_id ON public.student_level_answers(attempt_id);

-- =====================================================================
-- 2. TRIGGER: validasi & auto-maintain is_active, updated_at
-- =====================================================================

-- 2.1 updated_at auto-update untuk material_levels
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_material_levels ON public.material_levels;
CREATE TRIGGER set_updated_at_material_levels
    BEFORE UPDATE ON public.material_levels
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_set_updated_at();

-- 2.2 Cegah admin meng-set is_active = true kalau jumlah soal valid (question_id NOT NULL) belum tepat 10
CREATE OR REPLACE FUNCTION public.trg_validate_level_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_question_count INTEGER;
BEGIN
    IF NEW.is_active = true AND (TG_OP = 'INSERT' OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
        SELECT COUNT(*) INTO v_question_count
        FROM public.material_level_questions
        WHERE level_id = NEW.id AND question_id IS NOT NULL;

        IF v_question_count <> 10 THEN
            RAISE EXCEPTION 'Level tidak bisa diaktifkan: jumlah soal saat ini % dari 10 yang wajib diisi', v_question_count
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_level_activation ON public.material_levels;
CREATE TRIGGER validate_level_activation
    BEFORE INSERT OR UPDATE ON public.material_levels
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_validate_level_activation();

-- 2.3 Cegah lebih dari 10 soal per level saat insert ke material_level_questions
CREATE OR REPLACE FUNCTION public.trg_limit_level_questions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_current_count
    FROM public.material_level_questions
    WHERE level_id = NEW.level_id;

    IF v_current_count >= 10 THEN
        RAISE EXCEPTION 'Level sudah punya 10 soal, tidak bisa menambah lagi (hapus salah satu dulu)'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS limit_level_questions ON public.material_level_questions;
CREATE TRIGGER limit_level_questions
    BEFORE INSERT ON public.material_level_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_limit_level_questions();

-- 2.4 Kalau soal di dalam level yang AKTIF berkurang (dihapus dari level atau question_id jadi NULL
--     karena soal sumbernya dihapus dari bank soal) sampai < 10, otomatis nonaktifkan level tsb.
CREATE OR REPLACE FUNCTION public.trg_deactivate_level_if_incomplete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_level_id UUID;
    v_question_count INTEGER;
BEGIN
    v_level_id := COALESCE(NEW.level_id, OLD.level_id);

    SELECT COUNT(*) INTO v_question_count
    FROM public.material_level_questions
    WHERE level_id = v_level_id AND question_id IS NOT NULL;

    IF v_question_count <> 10 THEN
        UPDATE public.material_levels
        SET is_active = false
        WHERE id = v_level_id AND is_active = true;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS deactivate_level_after_delete ON public.material_level_questions;
CREATE TRIGGER deactivate_level_after_delete
    AFTER DELETE OR UPDATE ON public.material_level_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_deactivate_level_if_incomplete();

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE public.material_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_level_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_level_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_level_answers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3.1 material_levels: siswa boleh SELECT level yang is_active = true saja
--     (level draft/belum genap 10 soal tidak boleh terlihat siswa).
--     Admin (is_admin(auth.uid())) full access.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS material_levels_select_active_for_students ON public.material_levels;
CREATE POLICY material_levels_select_active_for_students
    ON public.material_levels
    FOR SELECT
    TO authenticated
    USING (is_active = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS material_levels_admin_all ON public.material_levels;
CREATE POLICY material_levels_admin_all
    ON public.material_levels
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3.2 material_level_questions: siswa TIDAK boleh lihat soal & jawaban benar
--     langsung dari tabel ini (supaya tidak bisa lihat correct_answer lewat
--     join questions). Soal ditampilkan ke siswa lewat RPC
--     get_student_level_progress / rpc_start_level_attempt yang menyaring
--     kolom sensitif. Admin full access.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS mlq_admin_all ON public.material_level_questions;
CREATE POLICY mlq_admin_all
    ON public.material_level_questions
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3.3 student_level_attempts: siswa hanya boleh SELECT baris miliknya sendiri.
--     TIDAK ADA policy INSERT/UPDATE untuk role authenticated biasa -> hanya
--     bisa lewat RPC SECURITY DEFINER di bawah. Admin full access (monitoring).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS sla_select_own ON public.student_level_attempts;
CREATE POLICY sla_select_own
    ON public.student_level_attempts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS sla_admin_write ON public.student_level_attempts;
CREATE POLICY sla_admin_write
    ON public.student_level_attempts
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));
-- Catatan: tidak ada policy INSERT/UPDATE untuk siswa biasa secara sengaja.
-- Insert/update baris attempt siswa hanya terjadi lewat fungsi SECURITY DEFINER
-- (rpc_start_level_attempt, rpc_submit_level_attempt) yang berjalan sebagai
-- pemilik fungsi, sehingga tidak butuh policy INSERT terpisah untuk role authenticated.

-- ---------------------------------------------------------------------
-- 3.4 student_level_answers: sama seperti attempts - SELECT milik sendiri saja,
--     insert hanya lewat RPC.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS slan_select_own ON public.student_level_answers;
CREATE POLICY slan_select_own
    ON public.student_level_answers
    FOR SELECT
    TO authenticated
    USING (
        public.is_admin(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.student_level_attempts a
            WHERE a.id = student_level_answers.attempt_id
              AND a.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS slan_admin_write ON public.student_level_answers;
CREATE POLICY slan_admin_write
    ON public.student_level_answers
    FOR ALL
    TO authenticated
    USING (public.is_admin(auth.uid()))
    WITH CHECK (public.is_admin(auth.uid()));

-- =====================================================================
-- 4. RPC / HELPER FUNCTIONS
-- =====================================================================

-- ---------------------------------------------------------------------
-- 4.1 can_start_level(p_user_id, p_level_id)
--     Level 1 -> unlocked kalau is_active.
--     Level N>1 -> unlocked kalau is_active DAN pernah ada attempt lulus
--     (is_passed = true, sticky / best-attempt, sesuai D3 & D4) di level N-1.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_start_level(p_user_id UUID, p_level_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_level RECORD;
    v_prev_level_id UUID;
    v_prev_passed BOOLEAN;
BEGIN
    SELECT * INTO v_level FROM public.material_levels WHERE id = p_level_id;

    IF NOT FOUND OR v_level.is_active = false THEN
        RETURN false;
    END IF;

    IF v_level.level_number = 1 THEN
        RETURN true;
    END IF;

    SELECT id INTO v_prev_level_id
    FROM public.material_levels
    WHERE material_id = v_level.material_id
      AND level_number = v_level.level_number - 1;

    IF v_prev_level_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.student_level_attempts
        WHERE user_id = p_user_id
          AND level_id = v_prev_level_id
          AND is_passed = true
    ) INTO v_prev_passed;

    RETURN COALESCE(v_prev_passed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.can_start_level(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_start_level(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4.2 get_student_level_progress(p_user_id, p_material_id)
--     Mengembalikan status ke-3 level sekaligus: unlocked, best_score,
--     is_passed, jumlah percobaan, skor attempt terakhir. Dipakai bersama
--     oleh halaman siswa (Fase 3) dan admin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_level_progress(p_user_id UUID, p_material_id UUID)
RETURNS TABLE (
    level_id            UUID,
    level_number        SMALLINT,
    title               VARCHAR,
    passing_score       INTEGER,
    total_questions     INTEGER,
    is_active           BOOLEAN,
    unlocked            BOOLEAN,
    best_score          INTEGER,
    is_passed           BOOLEAN,
    attempt_count       INTEGER,
    last_score          INTEGER,
    last_attempt_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ml.id,
        ml.level_number,
        COALESCE(ml.title, 'Level ' || ml.level_number),
        ml.passing_score,
        ml.total_questions,
        ml.is_active,
        public.can_start_level(p_user_id, ml.id) AS unlocked,
        COALESCE((
            SELECT MAX(sla.score) FROM public.student_level_attempts sla
            WHERE sla.level_id = ml.id AND sla.user_id = p_user_id AND sla.status = 'completed'
        ), 0) AS best_score,
        COALESCE((
            SELECT bool_or(sla.is_passed) FROM public.student_level_attempts sla
            WHERE sla.level_id = ml.id AND sla.user_id = p_user_id
        ), false) AS is_passed,
        COALESCE((
            SELECT COUNT(*)::INTEGER FROM public.student_level_attempts sla
            WHERE sla.level_id = ml.id AND sla.user_id = p_user_id AND sla.status = 'completed'
        ), 0) AS attempt_count,
        (
            SELECT sla.score FROM public.student_level_attempts sla
            WHERE sla.level_id = ml.id AND sla.user_id = p_user_id AND sla.status = 'completed'
            ORDER BY sla.completed_at DESC LIMIT 1
        ) AS last_score,
        (
            SELECT sla.completed_at FROM public.student_level_attempts sla
            WHERE sla.level_id = ml.id AND sla.user_id = p_user_id AND sla.status = 'completed'
            ORDER BY sla.completed_at DESC LIMIT 1
        ) AS last_attempt_at
    FROM public.material_levels ml
    WHERE ml.material_id = p_material_id
    ORDER BY ml.level_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_level_progress(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_level_progress(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4.3 rpc_start_level_attempt(p_level_id)
--     Membuat baris attempt baru untuk auth.uid() SETELAH memvalidasi
--     can_start_level di server (bukan cuma di JS client). Return attempt_id
--     + daftar soal (TANPA correct_answer) untuk dikerjakan siswa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_start_level_attempt(p_level_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_attempt_id UUID;
    v_next_attempt_number INTEGER;
    v_questions JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Harus login untuk memulai latihan' USING ERRCODE = '28000';
    END IF;

    IF NOT public.can_start_level(v_user_id, p_level_id) THEN
        RAISE EXCEPTION 'Level ini masih terkunci atau belum aktif' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt_number
    FROM public.student_level_attempts
    WHERE user_id = v_user_id AND level_id = p_level_id;

    INSERT INTO public.student_level_attempts (user_id, level_id, attempt_number, total_questions, status)
    VALUES (v_user_id, p_level_id, v_next_attempt_number, 10, 'in_progress')
    RETURNING id INTO v_attempt_id;

    SELECT jsonb_agg(
        jsonb_build_object(
            'question_id', q.id,
            'order_position', mlq.order_position,
            'question_text', q.question_text,
            'option_a', q.option_a,
            'option_b', q.option_b,
            'option_c', q.option_c,
            'option_d', q.option_d,
            'image_url', q.image_url,
            'latex_content', q.latex_content
        ) ORDER BY mlq.order_position
    ) INTO v_questions
    FROM public.material_level_questions mlq
    JOIN public.questions q ON q.id = mlq.question_id
    WHERE mlq.level_id = p_level_id AND mlq.question_id IS NOT NULL;

    RETURN jsonb_build_object(
        'attempt_id', v_attempt_id,
        'attempt_number', v_next_attempt_number,
        'questions', COALESCE(v_questions, '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_start_level_attempt(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_start_level_attempt(UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4.4 rpc_submit_level_attempt(p_attempt_id, p_answers)
--     p_answers: jsonb array [{ "question_id": "...", "selected_answer": "A",
--                                "time_taken_seconds": 12 }, ...]
--     Menghitung skor di SERVER (bandingkan ke questions.correct_answer),
--     insert student_level_answers, update attempt jadi completed.
--     Hanya boleh dipanggil oleh pemilik attempt (auth.uid() = attempt.user_id)
--     dan hanya untuk attempt yang masih 'in_progress'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_submit_level_attempt(p_attempt_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_attempt RECORD;
    v_level RECORD;
    v_answer JSONB;
    v_correct TEXT;
    v_is_correct BOOLEAN;
    v_score INTEGER := 0;
    v_is_passed BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Harus login' USING ERRCODE = '28000';
    END IF;

    SELECT * INTO v_attempt FROM public.student_level_attempts WHERE id = p_attempt_id;

    IF NOT FOUND OR v_attempt.user_id <> v_user_id THEN
        RAISE EXCEPTION 'Attempt tidak ditemukan atau bukan milik Anda' USING ERRCODE = '42501';
    END IF;

    IF v_attempt.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Attempt ini sudah selesai/dibatalkan, tidak bisa disubmit ulang' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_level FROM public.material_levels WHERE id = v_attempt.level_id;

    FOR v_answer IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
        SELECT correct_answer INTO v_correct
        FROM public.questions
        WHERE id = (v_answer->>'question_id')::UUID;

        v_is_correct := (v_correct IS NOT NULL AND v_correct = (v_answer->>'selected_answer'));

        IF v_is_correct THEN
            v_score := v_score + 1;
        END IF;

        INSERT INTO public.student_level_answers
            (attempt_id, question_id, selected_answer, is_correct, time_taken_seconds)
        VALUES (
            p_attempt_id,
            (v_answer->>'question_id')::UUID,
            v_answer->>'selected_answer',
            v_is_correct,
            NULLIF(v_answer->>'time_taken_seconds', '')::INTEGER
        )
        ON CONFLICT (attempt_id, question_id) DO UPDATE
            SET selected_answer = EXCLUDED.selected_answer,
                is_correct = EXCLUDED.is_correct,
                time_taken_seconds = EXCLUDED.time_taken_seconds,
                answered_at = now();
    END LOOP;

    v_is_passed := v_score >= v_level.passing_score;

    UPDATE public.student_level_attempts
    SET score = v_score,
        is_passed = v_is_passed,
        status = 'completed',
        completed_at = now()
    WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'attempt_id', p_attempt_id,
        'score', v_score,
        'total_questions', v_level.total_questions,
        'passing_score', v_level.passing_score,
        'is_passed', v_is_passed,
        'unlocked_next', v_is_passed
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_submit_level_attempt(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_submit_level_attempt(UUID, JSONB) TO authenticated;

COMMIT;

-- =====================================================================
-- 5. VERIFIKASI (jalankan terpisah setelah migration di atas sukses)
-- =====================================================================

-- 5.1 Cek 4 tabel baru sudah ada
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('material_levels','material_level_questions','student_level_attempts','student_level_answers');

-- 5.2 Cek RLS aktif
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname IN ('material_levels','material_level_questions','student_level_attempts','student_level_answers');

-- 5.3 Cek RPC functions terdaftar
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('can_start_level','get_student_level_progress','rpc_start_level_attempt','rpc_submit_level_attempt');

-- 5.4 Pastikan fungsi is_admin(uuid) memang sudah ada sebelum migration ini dijalankan
--     (kalau belum ada, migration di atas akan GAGAL di bagian RLS - jalankan dulu
--     fix_admin_auth_security.sql sesuai SECURITY_SETUP.md):
-- SELECT proname FROM pg_proc WHERE proname = 'is_admin';

-- =====================================================================
-- 6. ROLLBACK (jalankan HANYA kalau perlu membatalkan migration ini)
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.rpc_submit_level_attempt(UUID, JSONB);
-- DROP FUNCTION IF EXISTS public.rpc_start_level_attempt(UUID);
-- DROP FUNCTION IF EXISTS public.get_student_level_progress(UUID, UUID);
-- DROP FUNCTION IF EXISTS public.can_start_level(UUID, UUID);
-- DROP TABLE IF EXISTS public.student_level_answers;
-- DROP TABLE IF EXISTS public.student_level_attempts;
-- DROP TABLE IF EXISTS public.material_level_questions;
-- DROP TABLE IF EXISTS public.material_levels;
-- DROP FUNCTION IF EXISTS public.trg_deactivate_level_if_incomplete();
-- DROP FUNCTION IF EXISTS public.trg_limit_level_questions();
-- DROP FUNCTION IF EXISTS public.trg_validate_level_activation();
-- -- trg_set_updated_at() TIDAK di-drop karena kemungkinan dipakai tabel lain juga.
-- COMMIT;
