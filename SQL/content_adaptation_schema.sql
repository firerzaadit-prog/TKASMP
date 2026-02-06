-- Content Adaptation Schema (FIXED)
-- Run this in Supabase SQL Editor

-- 1. Create Tables (Gunakan IF NOT EXISTS)
-- Pastikan tabel public.materials dan public.profiles sudah ada sebelumnya
CREATE TABLE IF NOT EXISTS public.content_adaptations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    strategy JSONB NOT NULL,
    performance_score FLOAT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.adaptation_effectiveness (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    content_id UUID REFERENCES public.materials(id) ON DELETE CASCADE,
    adaptation_strategy JSONB NOT NULL,
    performance_score FLOAT NOT NULL CHECK (performance_score BETWEEN 0 AND 1),
    -- Generated Column untuk perhitungan otomatis efektivitas
    effectiveness_score FLOAT GENERATED ALWAYS AS (
        CASE
            WHEN performance_score >= 0.8 THEN 1.0
            WHEN performance_score >= 0.6 THEN 0.7
            WHEN performance_score >= 0.4 THEN 0.4
            ELSE 0.1
        END
    ) STORED,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_adaptation_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE, -- Constraint UNIQUE penting untuk one-to-one
    preferred_difficulty JSONB DEFAULT '{"text": "intermediate", "video": "normal", "interactive": "partial_support"}',
    learning_style VARCHAR(50) DEFAULT 'visual',
    pace_preference VARCHAR(20) DEFAULT 'moderate' CHECK (pace_preference IN ('slow', 'moderate', 'fast')),
    multimedia_preferences JSONB DEFAULT '{"captions": true, "speed": 1.0}',
    hint_preference VARCHAR(20) DEFAULT 'adaptive' CHECK (hint_preference IN ('always', 'on_request', 'adaptive', 'never')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Enable RLS on all tables
ALTER TABLE public.content_adaptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptation_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_adaptation_preferences ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies (GUNAKAN DROP POLICY SEBELUM CREATE)

-- Policies for content_adaptations
DROP POLICY IF EXISTS "Users can view their own content adaptations" ON public.content_adaptations;
CREATE POLICY "Users can view their own content adaptations" ON public.content_adaptations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own content adaptations" ON public.content_adaptations;
CREATE POLICY "Users can insert their own content adaptations" ON public.content_adaptations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for adaptation_effectiveness
DROP POLICY IF EXISTS "Users can view their own adaptation effectiveness" ON public.adaptation_effectiveness;
CREATE POLICY "Users can view their own adaptation effectiveness" ON public.adaptation_effectiveness
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own adaptation effectiveness" ON public.adaptation_effectiveness;
CREATE POLICY "Users can insert their own adaptation effectiveness" ON public.adaptation_effectiveness
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for user_adaptation_preferences
DROP POLICY IF EXISTS "Users can view their own adaptation preferences" ON public.user_adaptation_preferences;
CREATE POLICY "Users can view their own adaptation preferences" ON public.user_adaptation_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own adaptation preferences" ON public.user_adaptation_preferences;
CREATE POLICY "Users can insert their own adaptation preferences" ON public.user_adaptation_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own adaptation preferences" ON public.user_adaptation_preferences;
CREATE POLICY "Users can update their own adaptation preferences" ON public.user_adaptation_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_adaptations_user ON public.content_adaptations(user_id);
CREATE INDEX IF NOT EXISTS idx_content_adaptations_content ON public.content_adaptations(content_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_effectiveness_user ON public.adaptation_effectiveness(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_effectiveness_content ON public.adaptation_effectiveness(content_id);
CREATE INDEX IF NOT EXISTS idx_user_adaptation_preferences_user ON public.user_adaptation_preferences(user_id);

-- 5. Triggers for updated_at
-- Pastikan fungsi handle_updated_at sudah ada (biasanya dibuat di script base)
-- Jika belum ada, uncomment baris berikut:
/*
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/

DROP TRIGGER IF EXISTS handle_updated_at_user_adaptation_preferences ON public.user_adaptation_preferences;
CREATE TRIGGER handle_updated_at_user_adaptation_preferences
    BEFORE UPDATE ON public.user_adaptation_preferences
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 6. Insert default preferences for existing users
-- Ini akan mengisi preferensi default untuk user yang sudah ada di tabel profiles
INSERT INTO public.user_adaptation_preferences (user_id)
SELECT id FROM public.profiles
WHERE id NOT IN (SELECT user_id FROM public.user_adaptation_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- Verify setup
SELECT 'Content adaptation schema updated successfully' as status;