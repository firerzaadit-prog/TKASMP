-- Add class_name column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_name TEXT;

-- Update the handle_new_user function to include class_name if available
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, nama_lengkap, email, avatar_url, class_name)
    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            NEW.user_metadata->>'full_name',
            NEW.user_metadata->>'name',
            SPLIT_PART(NEW.email, '@', 1)
        ),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.user_metadata->>'avatar_url'),
        COALESCE(
            NEW.raw_user_meta_data->>'class_name',
            NEW.raw_user_meta_data->>'class',
            NEW.user_metadata->>'class_name',
            NEW.user_metadata->>'class'
        )
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;