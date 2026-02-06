-- Tambahkan kolom untuk tipe soal, bab, dan sub bab ke tabel questions
-- Jalankan di Supabase SQL Editor

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS tipe_soal VARCHAR(50),
ADD COLUMN IF NOT EXISTS bab VARCHAR(100),
ADD COLUMN IF NOT EXISTS sub_bab VARCHAR(100);

-- Update beberapa contoh data (opsional, untuk testing)
UPDATE public.questions
SET tipe_soal = 'pilihan ganda', bab = 'Bilangan', sub_bab = 'Bilangan real'
WHERE question_text LIKE '%2 + 2%';

UPDATE public.questions
SET tipe_soal = 'pilihan ganda', bab = 'Aljabar', sub_bab = 'Persamaan dan pertidaksamaan linear'
WHERE question_text LIKE '%presiden%';

UPDATE public.questions
SET tipe_soal = 'pilihan ganda', bab = 'Geometri dan pengukuran', sub_bab = 'Objek geometri'
WHERE question_text LIKE '%ibukota%';

-- Verifikasi
SELECT id, question_text, tipe_soal, bab, sub_bab FROM public.questions LIMIT 5;