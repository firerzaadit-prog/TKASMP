-- =============================================================================
-- FINAL FIX: REMOVE CONSTRAINTS & SETUP ADVANCED QUESTIONS
-- =============================================================================

-- 1. HAPUS CONSTRAINT (ATURAN) LAMA
-- Ini langkah terpenting untuk mengatasi Error 23514
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_correct_answer_check;

-- 2. Pastikan tipe data kolom sudah TEXT (Sesuai perbaikan sebelumnya)
DO $$
BEGIN
    ALTER TABLE public.questions ALTER COLUMN correct_answer TYPE TEXT;
EXCEPTION
    WHEN others THEN NULL; -- Ignore if already text
END $$;

-- 3. SETUP KOLOM (Untuk memastikan kolom-kolom baru tersedia)
DO $$
BEGIN
    -- Add question_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'question_type') THEN
        ALTER TABLE public.questions ADD COLUMN question_type VARCHAR(20) DEFAULT 'Pilihan Ganda';
    END IF;

    -- Pastikan constraint check untuk question_type sudah benar (update jika perlu)
    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
    ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check 
        CHECK (question_type IN ('Pilihan Ganda', 'PGK Kategori', 'PGK MCMA', 'Isian Singkat', 'Menjodohkan'));

    -- Add MCMA specific columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'correct_answers') THEN
        ALTER TABLE public.questions ADD COLUMN correct_answers TEXT[];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'partial_credit') THEN
        ALTER TABLE public.questions ADD COLUMN partial_credit BOOLEAN DEFAULT false;
    END IF;

    -- Add PGK Kategori columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'category_options') THEN
        ALTER TABLE public.questions ADD COLUMN category_options JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'category_mapping') THEN
        ALTER TABLE public.questions ADD COLUMN category_mapping JSONB;
    END IF;
    
    -- Add structural columns if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'chapter') THEN
        ALTER TABLE public.questions ADD COLUMN chapter VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'sub_chapter') THEN
        ALTER TABLE public.questions ADD COLUMN sub_chapter VARCHAR(100);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'scoring_weight') THEN
        ALTER TABLE public.questions ADD COLUMN scoring_weight INTEGER DEFAULT 1;
    END IF;
END $$;

-- 4. INSERT DATA SAMPLE (Sekarang seharusnya BERHASIL)
INSERT INTO public.questions (
    question_text, question_type, chapter, sub_chapter,
    option_a, option_b, option_c, option_d, correct_answer,
    scoring_weight, subject, difficulty, explanation, tags,
    category_options, category_mapping, correct_answers, partial_credit
) VALUES
-- PGK Kategori sample
(
    'Manakah pernyataan berikut yang BENAR?',
    'PGK Kategori', 'Bilangan', 'Bilangan Real',
    'N/A', 'N/A', 'N/A', 'N/A',
    'A', 
    2, 'Matematika', 'Sedang',
    'Soal dengan pernyataan benar/salah.',
    ARRAY['bilangan', 'real'],
    '["2 adalah bilangan genap", "3 adalah bilangan prima", "4 adalah bilangan ganjil", "5 adalah bilangan rasional"]'::jsonb,
    '{"2 adalah bilangan genap": true, "3 adalah bilangan prima": true, "4 adalah bilangan ganjil": false, "5 adalah bilangan rasional": true}'::jsonb,
    NULL, false
),
-- PGK MCMA sample
(
    'Manakah pernyataan berikut yang benar tentang segitiga? (Pilih semua yang benar)',
    'PGK MCMA', 'Geometri', 'Segitiga',
    'Jumlah sudut dalam segitiga adalah 180°', 'Segitiga memiliki 3 sisi', 'Segitiga memiliki 4 sudut', 'Segitiga sama sisi memiliki 3 sisi yang sama panjang',
    'ABD', -- Script insert ini sekarang akan diterima karena constraint sudah dihapus
    3, 'Matematika', 'Sulit',
    'Pertanyaan dengan multiple correct answers.',
    ARRAY['geometri', 'segitiga', 'sudut'],
    NULL, NULL,
    ARRAY['A', 'B', 'D'], true
);

-- 5. VERIFIKASI
SELECT question_type, correct_answer, correct_answers 
FROM public.questions 
WHERE question_text LIKE 'Manakah pernyataan berikut%';