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
      
      // Gabungkan seluruh soal menjadi satu teks prompt dengan instruksi spesifik SMP
      let promptText = `Anda adalah guru matematika SMP. Analisis hasil ujian siswa berikut (Total ${answers.length} soal). Evaluasi pemahaman siswa berdasarkan Elemen/Materi, Sub-materi, dan Level Kognitif.\n\n`;
      
      answers.forEach((item: any, idx: number) => {
        // Ekstrak informasi dari database (jika ada)
        const bab = item.question?.bab || item.question?.chapter || 'Materi Umum';
        const subBab = item.question?.sub_bab || item.question?.sub_chapter || '-';
        const kognitif = item.question?.level_kognitif || '-';
        
        // Deteksi jawaban kosong / tidak dijawab
        const jwbSiswa = item.answer?.answer_value || item.answer?.selected_answer || '';
        const isKosong = (!jwbSiswa || jwbSiswa === '-' || jwbSiswa.trim() === '');
        const status = isKosong ? 'TIDAK DIJAWAB (KOSONG)' : (item.answer?.is_correct ? 'BENAR' : 'SALAH');

        promptText += `Soal ${idx + 1}:\n`;
        promptText += `- Materi: ${bab} (${subBab})\n`;
        promptText += `- Level Kognitif: ${kognitif}\n`;
        promptText += `- Pertanyaan: ${item.question?.question_text || '-'}\n`;
        promptText += `- Jawaban Siswa: ${isKosong ? '[KOSONG]' : jwbSiswa}\n`;
        promptText += `- Kunci Jawaban: ${item.question?.correct_answer || '-'}\n`;
        promptText += `- Status: ${status}\n\n`;
      });
      
      promptText += `Berikan output WAJIB HANYA berupa JSON murni (tanpa markdown, tanpa tag \`\`\`json) dengan struktur:
{
  "summary": "Ringkasan evaluasi performa secara keseluruhan (1-2 kalimat)",
  "strengths": ["Kekuatan 1 (sebutkan materi/konsep spesifik yang dikuasai)", "Kekuatan 2"],
  "weaknesses": ["Kelemahan 1 (identifikasi materi yang salah atau tidak dijawab oleh siswa)", "Kelemahan 2"],
  "learningSuggestions": ["Saran belajar 1 (sesuai letak kelemahan materi)", "Saran belajar 2"]
}`;

      // Tembak ke API Google Gemini
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            // Memastikan AI selalu merespons dengan JSON valid
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