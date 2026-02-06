-- Create material_views table to track when users view materials
-- Run this in Supabase SQL Editor

-- Create material_views table
CREATE TABLE IF NOT EXISTS public.material_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    view_duration_seconds INTEGER DEFAULT 0,
    UNIQUE(user_id, material_id, viewed_at::date) -- One view per user per material per day
);

-- Enable RLS
ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own material views" ON public.material_views
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own material views" ON public.material_views
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_material_views_user ON public.material_views(user_id);
CREATE INDEX IF NOT EXISTS idx_material_views_material ON public.material_views(material_id);
CREATE INDEX IF NOT EXISTS idx_material_views_viewed_at ON public.material_views(viewed_at);

-- Function to record material view
CREATE OR REPLACE FUNCTION record_material_view(p_user_id UUID, p_material_id UUID, p_duration INTEGER DEFAULT 0)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.material_views (user_id, material_id, view_duration_seconds)
    VALUES (p_user_id, p_material_id, p_duration)
    ON CONFLICT (user_id, material_id, viewed_at::date) DO UPDATE SET
        view_duration_seconds = GREATEST(material_views.view_duration_seconds, p_duration),
        viewed_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert sample material view data (for testing)
-- This will only work if you have materials and authenticated users
INSERT INTO public.material_views (user_id, material_id, viewed_at, view_duration_seconds)
SELECT
    auth.uid() as user_id,
    m.id as material_id,
    NOW() - INTERVAL '1 day' * (random() * 7)::int as viewed_at,
    (random() * 300)::int as view_duration_seconds
FROM public.materials m
WHERE m.is_published = true
ORDER BY random()
LIMIT 3
ON CONFLICT DO NOTHING;

-- Verify setup
SELECT 'Material views table created successfully' as status;
SELECT COUNT(*) as total_material_views FROM public.material_views;