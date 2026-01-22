// clientSupabase.js - Client-side Supabase client with anon key
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tsgldkyuktqpsbeuevsn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZ2xka3l1a3RxcHNiZXVldnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTExOTksImV4cCI6MjA3OTI2NzE5OX0.C0g6iZcwd02ZFmuGFluYXScX9uuahntJtkPvHt5g1FE';

const supabase = createClient(supabaseUrl, supabaseKey);

export { supabase };