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
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500, headers: corsHeaders });
    }

    // Cek apakah ini mode BATCH (Array soal)
    if (body.answers && Array.isArray(body.answers)) {
      const answers = body.answers;
      
      // Gabungkan 30 soal menjadi satu teks prompt
      let promptText = `Anda adalah guru matematika ahli. Analisis hasil ujian siswa berikut yang berisi ${answers.length} jawaban. Berikan evaluasi dalam format JSON murni.\n\n`;
      
      answers.forEach((item: any, idx: number) => {
        promptText += `Soal ${idx + 1}: ${item.question?.question_text || '-'}\nJawaban Siswa: ${item.answer?.answer_value || '-'}\nKunci: ${item.question?.correct_answer || '-'}\nStatus: ${item.answer?.is_correct ? 'BENAR' : 'SALAH'}\n\n`;
      });
      
      promptText += `\nBerikan output WAJIB HANYA berupa JSON dengan struktur: {"summary": "string", "strengths": ["string"], "weaknesses": ["string"], "learningSuggestions": ["string"]}`;

      // Tembak ke API Google Gemini
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
          })
        }
      );

      const geminiData = await geminiResponse.json();

      if (!geminiResponse.ok) {
         return new Response(JSON.stringify({ error: geminiData }), { status: 400, headers: corsHeaders });
      }

      const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid Payload: 'answers' array is missing" }), { status: 400, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
});