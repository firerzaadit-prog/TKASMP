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

    // ── MODE 1: BATCH ────────────────────────────────────────────────────────
    if (body.answers && Array.isArray(body.answers) && body.answers.length > 0) {
      const answers = body.answers;

      // Validasi setiap item punya question dan answer
      const validAnswers = answers.filter((item: any) =>
        item?.question?.question_text && item?.answer
      );

      if (validAnswers.length === 0) {
        return new Response(
          JSON.stringify({ error: 'No valid answers with question data in payload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[Batch] Processing ${validAnswers.length} answers`);

      // Build soal list dengan fallback aman untuk setiap field
      const soalList = validAnswers.map((item: any, idx: number) => {
        const q = item.question || {};
        const a = item.answer || {};
        const statusLabel = a.is_correct === true ? 'BENAR' : 'SALAH';
        const kunci = q.correct_answer || (Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : '') || '-';
        const elemen = q.bab || q.chapter || '-';
        const subElemen = q.sub_bab || q.sub_chapter || '-';

        return `[Soal ${idx + 1}] (${elemen} - ${subElemen}) | Status: ${statusLabel}
Soal: ${(q.question_text || '').substring(0, 300)}
Kunci: ${kunci} | Jawaban Siswa: ${a.selected_answer || '-'}
Level: ${q.level_kognitif || '-'} | Proses: ${q.proses_berpikir || '-'}`;
      }).join('\n\n');

      const batchPrompt = `Kamu adalah guru matematika SMP. Analisis hasil ujian TKA berikut secara KESELURUHAN:

${soalList}

Instruksi:
- weaknesses: HANYA dari soal yang SALAH, spesifik ke konsep/materi yang tidak dikuasai
- strengths: HANYA dari soal yang BENAR, kompetensi yang dikuasai
- Jika semua benar, weaknesses = []
- Jika semua salah, strengths = []
- Maksimal 4 item per kategori, dalam bahasa Indonesia
- summary: 2-3 kalimat ringkasan kemampuan siswa

Output JSON saja, tanpa markdown:
{"summary":"...","strengths":["..."],"weaknesses":["..."],"learningSuggestions":["..."]}`;

      // Panggil Gemini API
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
        const errMsg = geminiData?.error?.message || `Gemini error ${geminiResponse.status}`;
        console.error('[Batch] Gemini error:', errMsg);
        return new Response(
          JSON.stringify({ error: errMsg }),
          { status: geminiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text) {
        console.error('[Batch] Empty response from Gemini:', JSON.stringify(geminiData).substring(0, 500));
        return new Response(
          JSON.stringify({ error: 'Empty response from Gemini' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse JSON result
      let parsed: any = { summary: '', strengths: [], weaknesses: [], learningSuggestions: [] };
      try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch (e) {
        console.error('[Batch] JSON parse error:', e, 'Raw text:', text.substring(0, 200));
        // Fallback: gunakan text sebagai summary
        parsed.summary = text.substring(0, 500);
      }

      return new Response(
        JSON.stringify({ batch: true, result: parsed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── MODE 2: SINGLE (legacy) ──────────────────────────────────────────────
    const { message } = body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'message or answers[] is required' }),
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
        })
      }
    );

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const errMsg = geminiData?.error?.message || 'Gemini API error';
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: geminiResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new Response(
      JSON.stringify({ choices: [{ message: { content: text } }] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Edge Function] Unhandled error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
