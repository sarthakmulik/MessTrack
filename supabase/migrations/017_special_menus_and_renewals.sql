-- Migration 017: Sunday Special Menus & Renewal Requests

-- 1. Sunday Special / Feast Menu Fields
ALTER TABLE daily_menus ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT false;
ALTER TABLE daily_menus ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'veg' CHECK (category IN ('veg', 'non_veg', 'special'));

-- 2. Student Renewal Requests Table
CREATE TABLE IF NOT EXISTS renewal_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id      UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes        TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_requests_tenant ON renewal_requests(tenant_id, status);

ALTER TABLE renewal_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Students can view and create own renewal requests"
  ON renewal_requests FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

CREATE POLICY "Admins can manage tenant renewal requests"
  ON renewal_requests FOR ALL
  USING (get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id());
