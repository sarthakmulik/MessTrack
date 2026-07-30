-- ============================================================
-- MessTrack Migration 007: Leave System
-- Students can mark themselves as skipping a meal.
-- Admins get a live headcount prediction for the day.
-- ============================================================

CREATE TABLE IF NOT EXISTS meal_leaves (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  leave_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type   TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A student can only mark leave once per meal per day
  UNIQUE (student_id, leave_date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_leaves_tenant_date ON meal_leaves(tenant_id, leave_date);
CREATE INDEX IF NOT EXISTS idx_meal_leaves_student ON meal_leaves(student_id);

ALTER TABLE meal_leaves ENABLE ROW LEVEL SECURITY;

-- Students can manage their own leave entries
CREATE POLICY "Students can manage own leaves"
  ON meal_leaves FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

-- Admins can view all leaves for their tenant
CREATE POLICY "Admins can view tenant leaves"
  ON meal_leaves FOR SELECT
  USING (get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id());

-- Super admin can view all
CREATE POLICY "Super admin can view all leaves"
  ON meal_leaves FOR SELECT
  USING (get_my_role() = 'super_admin');
