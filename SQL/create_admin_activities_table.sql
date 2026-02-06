-- Create admin_activities table for EduLearn TKA
-- Run this in Supabase SQL Editor

-- Create admin_activities table
CREATE TABLE IF NOT EXISTS public.admin_activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_id UUID REFERENCES auth.users(id), -- Nullable for now since admin auth is simulated
    activity_type VARCHAR(50) NOT NULL, -- 'material', 'question', 'user', 'system', etc.
    action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'deleted', etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    entity_type VARCHAR(50), -- 'material', 'question', 'user', etc.
    entity_id UUID, -- ID of the affected entity
    metadata JSONB, -- Additional data like old/new values
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.admin_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admin_activities
-- Only admins can view admin activities
CREATE POLICY "Only admins can view admin activities" ON public.admin_activities
    FOR SELECT USING (auth.jwt() ->> 'role' = 'admin' OR auth.uid() IN (
        SELECT id FROM public.profiles WHERE email = 'admin@edulearn.com'
    ));

-- Allow inserts for admin activities (since admin panel uses simple auth)
CREATE POLICY "Allow admin activity inserts" ON public.admin_activities
    FOR INSERT WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_activities_type ON public.admin_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_admin_activities_created_at ON public.admin_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activities_entity ON public.admin_activities(entity_type, entity_id);

-- Insert sample activities for testing
INSERT INTO public.admin_activities (activity_type, action, title, description, entity_type, created_at) VALUES
('material', 'created', 'Materi baru ditambahkan', 'Materi "Persamaan Linier" berhasil ditambahkan', 'material', NOW() - INTERVAL '2 hours'),
('user', 'registered', 'Siswa baru bergabung', '5 siswa baru mendaftar ke platform', 'user', NOW() - INTERVAL '4 hours'),
('question', 'created', 'Soal baru dibuat', 'Soal TKA Matematika bab Aljabar ditambahkan', 'question', NOW() - INTERVAL '6 hours'),
('system', 'milestone', 'Pencapaian milestone', '1000 soal berhasil diselesaikan siswa', 'system', NOW() - INTERVAL '1 day');

-- Verify setup
SELECT 'Admin activities table created successfully' as status;
SELECT COUNT(*) as total_activities FROM public.admin_activities;