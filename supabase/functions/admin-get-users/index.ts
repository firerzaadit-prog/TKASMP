// @ts-nocheck
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// @ts-ignore
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validasi environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Verifikasi authentication dari client
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: No token provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '')

    // 2. Verifikasi user adalah admin melalui Supabase Auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Cek role admin di tabel admin_users
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('role, is_admin')
      .eq('id', user.id)
      .maybeSingle()

    // Jika tidak ada di admin_users atau bukan admin, cek alternatif
    let isAdmin = false
    if (!adminError && adminData && (adminData.is_admin === true || adminData.role === 'admin' || adminData.role === 'super_admin')) {
      isAdmin = true
    } else {
      // Cek di profiles dengan role
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      
      if (profileData?.role === 'admin' || profileData?.role === 'super_admin') {
        isAdmin = true
      }
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Ambil data users dengan service role (hanya untuk admin)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, email, phone, school, created_at')
      .order('created_at', { ascending: false })

    if (profilesError) {
      return new Response(
        JSON.stringify({ error: profilesError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Return data ke client
    return new Response(
      JSON.stringify({ 
        success: true, 
        users: profiles,
        count: profiles?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})