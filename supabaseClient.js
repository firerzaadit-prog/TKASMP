// supabaseClient.js - Untuk Admin Panel
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co';
// Gunakan SERVICE ROLE KEY untuk admin access
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzY5MTE5OSwiZXhwIjoyMDc5MjY3MTk5fQ.0ovVI04BphGbSCSZE6EhHI6_rtZCPSZReiaM9dKYcIA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export { supabase };