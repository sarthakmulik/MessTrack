-- Add subscription_id to attendance_records to link scans directly to the authorizing subscription

ALTER TABLE attendance_records 
ADD COLUMN subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL;

CREATE INDEX idx_attendance_subscription ON attendance_records(subscription_id);
