-- ============================================================
-- MessTrack Migration 009: Security Fixes & Schema Corrections
-- ============================================================

-- FIX 1: Add missing is_active column to students table
-- (StudentDashboardScreen queries .eq('is_active', true) but the column didn't exist)
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_students_active ON students(tenant_id, is_active);

-- FIX 2: Drop insecure QR token student SELECT policy
-- Students can read qr_tokens directly from the client, allowing spoofed scans.
-- Tokens should only be readable by the validate-scan Edge Function (service role).
DROP POLICY IF EXISTS "Students can read active tokens" ON qr_tokens;

-- FIX 3: Add tenant_id index on profiles for faster role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id);

-- FIX 4: Add cascading soft-delete support - update_at tracking on key tables
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- FIX 5: Add subscription renewal tracking
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- FIX 6: Add invoice payment tracking columns
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
