-- Tambahkan kolom competence ke tabel questions
-- Jalankan di Supabase SQL Editor

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS competence TEXT;

-- Update beberapa contoh data (opsional)
UPDATE public.questions
SET competence = 'Memahami operasi aritmetika pada bilangan'
WHERE question_text LIKE '%2 + 2%';

UPDATE public.questions
SET competence = 'Memahami sejarah dan tokoh penting Indonesia'
WHERE question_text LIKE '%presiden%';

UPDATE public.questions
SET competence = 'Memahami konsep geografi dasar'
WHERE question_text LIKE '%ibukota%';

-- Verifikasi
SELECT id, question_text, competence FROM public.questions LIMIT 5;