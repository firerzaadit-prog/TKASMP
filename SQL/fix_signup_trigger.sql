-- Fix for signup trigger causing database errors
-- Run this in Supabase SQL Editor to remove the problematic trigger

-- Drop the trigger that causes RLS policy conflicts during signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function as it's no longer needed (app handles profile creation)
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Note: The profiles table and RLS policies remain intact.
-- Profile creation is now handled by the application after successful signup,
-- which avoids RLS conflicts since the user is authenticated at that point.

SELECT 'Signup trigger removed successfully. Profiles will be created by the app.' as status;