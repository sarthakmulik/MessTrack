-- Migration 015: Guest Plate / Extra Meal Scanner

ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS is_guest_plate BOOLEAN DEFAULT false;

-- Replace flat unique constraint with a partial unique index so primary scans are 1-per-session while guest scans are allowed
ALTER TABLE attendance_records 
DROP CONSTRAINT IF EXISTS attendance_records_student_id_meal_session_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_primary_scan 
ON attendance_records (student_id, meal_session_id) 
WHERE (is_guest_plate IS FALSE OR is_guest_plate IS NULL);

CREATE INDEX IF NOT EXISTS idx_attendance_guest_plate 
ON attendance_records (tenant_id, is_guest_plate);
