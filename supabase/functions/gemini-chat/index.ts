import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── MODE 1: BATCH (array of 30 answers) ──────────────────────────────────
    if (body.answers && Array.isArray(body.answers)) {
      const { answers, sessionInfo } = body;

      // Build system prompt for batch evaluation
      const soalList = answers.map((item: any, idx: number) => {
        const q = item.question;
        const a = item.answer;
        const statusLabel = a.is_correct ? 'BENAR' : 'SALAH';
        return `
[Soal ${idx + 1}]
Elemen: ${q.bab || q.chapter || '-'}
Sub-elemen: ${q.sub_bab || q.sub_chapter || '-'}
Level Kognitif: ${q.level_kognitif || '-'}
Proses Berpikir: ${q.proses_berpikir || '-'}
Soal: ${q.question_text || '-'}
Kunci Jawaban: ${q.correct_answer || (q.correct_answers || []).join(', ') || '-'}
Pembahasan: ${q.explanation || '-'}
Jawaban Siswa: ${a.selected_answer || '-'}
Status: ${statusLabel}`;
      }).join('\n');

      const batchPrompt = `Kamu adalah guru matematika SMP yang menganalisis hasil ujian TKA (Tes Kemampuan Akademik).

Berikut adalah data 30 soal beserta jawaban siswa:
${soalList}

Tugas kamu:
1. Analisis pola kelemahan dan kekuatan siswa secara KESELURUHAN (bukan per soal)
2. Fokus pada soal yang SALAH untuk menentukan kelemahan
3. Fokus pada soal yang BENAR untuk menentukan kekuatan
4. Berikan rekomendasi belajar yang spesifik dan actionable

Aturan WAJIB:
- weaknesses HANYA berisi materi/konsep yang benar-benar salah dijawab siswa
- Jangan tulis "Tidak ada kelemahan" di weaknesses - jika tidak ada yang salah, tulis array kosong []
- strengths HANYA berisi materi yang dikuasai dengan baik
- Semua dalam bahasa Indonesia
- Maksimal 4 item per kategori

Output HANYA JSON valid tanpa markdown, tanpa teks apapun selain JSON:
{"summary":"ringkasan kemampuan siswa dalam 2-3 kalimat","strengths":["kekuatan spesifik 1","kekuatan spesifik 2"],"weaknesses":["kelemahan spesifik 1","kelemahan spesifik 2"],"learningSuggestions":["rekomendasi spesifik 1","rekomendasi spesifik 2"]}`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: batchPrompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            }
          })
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
        console.error('Gemini batch error:', JSON.stringify(geminiData));
        return new Response(
          JSON.stringify({ error: geminiData.error?.message || 'Gemini API error' }),
          { status: geminiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) {
        console.error('Empty batch response:', JSON.stringify(geminiData));
        return new Response(
          JSON.stringify({ error: 'Empty response from Gemini' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse JSON from response
      let parsed: any = {};
      try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch (e) {
        console.error('JSON parse error:', e);
        parsed = {
          summary: text.substring(0, 300),
          strengths: [],
          weaknesses: [],
          learningSuggestions: []
        };
      }

      return new Response(
        JSON.stringify({ batch: true, result: parsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── MODE 2: SINGLE (legacy compatibility) ────────────────────────────────
    const { message } = body;

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'message or answers is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: message }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error('Gemini API error:', JSON.stringify(geminiData));
      return new Response(
        JSON.stringify({ error: geminiData.error?.message || 'Gemini API error' }),
        { status: geminiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.error('Empty text from Gemini:', JSON.stringify(geminiData));
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: text } }]
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
