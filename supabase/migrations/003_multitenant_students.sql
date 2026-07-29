-- ============================================================
-- MessTrack Migration 3: Multi-tenant students & soft deletes
-- ============================================================

-- Add is_active column to students for soft deleting
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Create an index to quickly filter out inactive students
CREATE INDEX IF NOT EXISTS idx_students_active ON public.students(tenant_id, is_active);
