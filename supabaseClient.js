// supabaseClient.js - Untuk Client / Frontend
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co';

// Gunakan ANON KEY (Public) untuk akses dari browser/frontend
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsIn... (dan seterusnya panjang sekali) ...';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export { supabase };