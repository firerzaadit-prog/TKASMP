// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { message } = await req.json()

    // 1. Ambil Key GEMINI dari Supabase Secrets
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('API Key Gemini belum disetting di Supabase')

    // 2. Kirim ke GEMINI menggunakan endpoint yang kompatibel dengan OpenAI
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gemini-1.5-flash", // Model murni Gemini
        messages: [
          { role: "system", content: "Anda adalah asisten guru matematika yang ahli. Berikan HANYA output JSON yang valid tanpa markdown tambahan." },
          { role: "user", content: message }
        ],
        temperature: 0.5
      })
    })

    const data = await response.json()

    if (data.error) {
      console.error("Gemini Error:", data.error)
      throw new Error(data.error.message)
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})