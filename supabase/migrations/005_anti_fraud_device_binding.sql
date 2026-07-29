-- Add device_id to students for Device Binding
ALTER TABLE students ADD COLUMN IF NOT EXISTS device_id TEXT;
