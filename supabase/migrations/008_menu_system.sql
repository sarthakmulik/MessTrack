-- ============================================================
-- MessTrack Migration 008: Daily Menu & Ratings
-- Admins post the day's menu. Students can rate meals.
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_menus (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  items       TEXT[] NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, menu_date, meal_type)
);

CREATE TABLE IF NOT EXISTS meal_ratings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_id     UUID NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one rating per student per menu item
  UNIQUE (student_id, menu_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_menus_tenant_date ON daily_menus(tenant_id, menu_date);
CREATE INDEX IF NOT EXISTS idx_meal_ratings_menu ON meal_ratings(menu_id);

ALTER TABLE daily_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_ratings ENABLE ROW LEVEL SECURITY;

-- Admins can fully manage their menus
CREATE POLICY "Admins can manage own menus"
  ON daily_menus FOR ALL
  USING (get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id());

-- Students can view their tenant's menus
CREATE POLICY "Students can view their tenant menus"
  ON daily_menus FOR SELECT
  USING (get_my_role() = 'student' AND tenant_id = get_my_tenant_id());

-- Super admin
CREATE POLICY "Super admin can view all menus"
  ON daily_menus FOR SELECT
  USING (get_my_role() = 'super_admin');

-- Students can manage their own ratings
CREATE POLICY "Students can manage own ratings"
  ON meal_ratings FOR ALL
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

-- Admins can view all ratings for their tenant
CREATE POLICY "Admins can view tenant ratings"
  ON meal_ratings FOR SELECT
  USING (get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id());
