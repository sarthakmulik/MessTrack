-- Migration 014: Dine-In vs. Dabba (Tiffin) Mode

ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS dining_option TEXT DEFAULT 'dine_in' CHECK (dining_option IN ('dine_in', 'dabba'));

CREATE INDEX IF NOT EXISTS idx_attendance_dining_option ON attendance_records(tenant_id, dining_option);
