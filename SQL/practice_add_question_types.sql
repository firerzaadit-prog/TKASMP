-- ============================================================
-- MIGRATION: Tambah tipe soal PGK Kategori & PGK MCMA
-- ke tabel practice_questions (Latihan Bertingkat)
-- ============================================================
-- Jalankan di Supabase Dashboard -> SQL Editor SETELAH
-- practice_bertingkat_setup.sql sudah dijalankan sebelumnya.
-- Aman dijalankan ulang (idempotent).
-- ============================================================

-- 1) Kolom tipe soal: 'PG' (default, Pilihan Ganda biasa),
--    'PGK MCMA' (Multiple Choice Multiple Answer),
--    'PGK Kategori' (Benar/Salah per pernyataan)
ALTER TABLE public.practice_questions
    ADD COLUMN IF NOT EXISTS question_type VARCHAR(30) DEFAULT 'PG';

-- 2) Jawaban benar untuk MCMA (array of letters, misal {'A','C','D'})
ALTER TABLE public.practice_questions
    ADD COLUMN IF NOT EXISTS correct_answers TEXT[];

-- 3) Daftar pernyataan untuk PGK Kategori
--    Format: ["Pernyataan 1", "Pernyataan 2", ...]
ALTER TABLE public.practice_questions
    ADD COLUMN IF NOT EXISTS category_options JSONB;

-- 4) Mapping kebenaran per pernyataan (index-based)
--    Format: {"0": true, "1": false, "2": true, ...}
ALTER TABLE public.practice_questions
    ADD COLUMN IF NOT EXISTS category_mapping JSONB;

-- 5) Relaksasi NOT NULL pada correct_answer:
--    Untuk PGK Kategori dan MCMA, correct_answer bisa NULL
--    karena jawaban benar disimpan di kolom lain.
ALTER TABLE public.practice_questions
    ALTER COLUMN correct_answer DROP NOT NULL;

-- Drop CHECK constraint lama yang membatasi hanya A/B/C/D
DO $$
BEGIN
    BEGIN
        ALTER TABLE public.practice_questions DROP CONSTRAINT IF EXISTS practice_questions_correct_answer_check;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- Buat CHECK constraint baru: correct_answer boleh NULL ATAU salah satu dari A/B/C/D
ALTER TABLE public.practice_questions
    DROP CONSTRAINT IF EXISTS practice_questions_correct_answer_check;

ALTER TABLE public.practice_questions
    ADD CONSTRAINT practice_questions_correct_answer_check
    CHECK (correct_answer IS NULL OR correct_answer IN ('A', 'B', 'C', 'D'));

-- 6) Relaksasi NOT NULL pada option_a..d:
--    Untuk PGK Kategori, opsi A-D tidak dipakai.
ALTER TABLE public.practice_questions ALTER COLUMN option_a DROP NOT NULL;
ALTER TABLE public.practice_questions ALTER COLUMN option_b DROP NOT NULL;
ALTER TABLE public.practice_questions ALTER COLUMN option_c DROP NOT NULL;
ALTER TABLE public.practice_questions ALTER COLUMN option_d DROP NOT NULL;

-- ============================================================
-- VERIFIKASI setelah menjalankan migration:
-- ============================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'practice_questions'
-- ORDER BY ordinal_position;
