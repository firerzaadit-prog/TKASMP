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

    // Ambil Key GROQ
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) throw new Error('API Key Groq belum disetting di Supabase')

    // Kirim ke GROQ (Gunakan Model TERBARU: llama-3.3-70b-versatile)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile", // Model terbaru & aktif
        messages: [
          { role: "system", content: "Anda adalah asisten guru matematika yang ahli. Berikan output JSON valid." },
          { role: "user", content: message }
        ],
        temperature: 0.5
      })
    })

    const data = await response.json()

    if (data.error) {
      console.error("Groq Error:", data.error)
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