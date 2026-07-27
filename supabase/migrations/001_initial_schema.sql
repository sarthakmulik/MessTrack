-- ============================================================
-- MessTrack: QR-Based Mess Attendance & Billing SaaS
-- Schema v1 — Multi-tenant, 3-tier hierarchy
-- Super Admin → Mess Admin → Student
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- One per auth user. Role determines access level.
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('super_admin', 'mess_admin', 'student')),
  tenant_id     UUID,                     -- NULL for super_admin
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TENANTS (Messes)
-- Only super_admin can INSERT. mess_admin is the owner.
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id      UUID NOT NULL REFERENCES auth.users(id),  -- the mess admin user
  name          TEXT NOT NULL,
  address       TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  meal_types    JSONB NOT NULL DEFAULT '["breakfast","lunch","dinner"]',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTION PLANS
-- Created by mess admin for their tenant.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  duration_days  INT NOT NULL,            -- e.g. 30 days
  price          NUMERIC(10,2) NOT NULL,
  days_included  INT NOT NULL,            -- billable days in the period
  meal_types     JSONB NOT NULL DEFAULT '["lunch","dinner"]',
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STUDENTS
-- Created by mess admin. Linked to an auth user (auth_user_id).
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  auth_user_id  UUID REFERENCES auth.users(id),   -- set when student first logs in
  name          TEXT NOT NULL,
  phone         TEXT,
  gender        TEXT CHECK (gender IN ('male', 'female', 'other')),
  photo_url     TEXT,
  email         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTIONS
-- Active plan for a student.
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES subscription_plans(id),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')) DEFAULT 'active',
  amount_paid   NUMERIC(10,2) DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEAL SESSIONS
-- Admin starts/ends sessions for each meal.
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time    TIMESTAMPTZ NOT NULL,
  end_time      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('scheduled', 'active', 'ended')) DEFAULT 'scheduled',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, meal_type, session_date)
);

-- ============================================================
-- QR TOKENS
-- Rotating tokens tied to a meal session.
-- New row every 15-20s; old ones expire.
-- ============================================================
CREATE TABLE IF NOT EXISTS qr_tokens (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meal_session_id  UUID NOT NULL REFERENCES meal_sessions(id) ON DELETE CASCADE,
  token            TEXT NOT NULL UNIQUE,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL
);

-- ============================================================
-- ATTENDANCE RECORDS (APPEND-ONLY)
-- One row per student per session. UNIQUE enforces anti-fraud.
-- NEVER UPDATE or DELETE — corrections via attendance_adjustments.
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id       UUID NOT NULL REFERENCES students(id),
  meal_session_id  UUID NOT NULL REFERENCES meal_sessions(id),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  qr_token_id      UUID REFERENCES qr_tokens(id),
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geo_lat          DOUBLE PRECISION,
  geo_lng          DOUBLE PRECISION,
  photo_audit_url  TEXT,
  status           TEXT NOT NULL CHECK (status IN ('present', 'absent', 'leave')) DEFAULT 'present',
  synced_offline   BOOLEAN NOT NULL DEFAULT FALSE,
  -- ANTI-FRAUD: one scan per student per session
  UNIQUE (student_id, meal_session_id)
);

-- ============================================================
-- ATTENDANCE ADJUSTMENTS
-- Admin corrections — never touch attendance_records directly.
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_record_id UUID NOT NULL REFERENCES attendance_records(id),
  adjusted_by_admin_id UUID NOT NULL REFERENCES auth.users(id),
  reason               TEXT NOT NULL,
  action               TEXT NOT NULL CHECK (action IN ('mark_present', 'mark_absent', 'mark_leave', 'override')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- Auto-generated monthly billing per student.
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES students(id),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  days_present  INT NOT NULL DEFAULT 0,
  rate_per_day  NUMERIC(10,2) NOT NULL,
  total_amount  NUMERIC(10,2) NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'overdue')) DEFAULT 'draft',
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_attendance_student      ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session      ON attendance_records(meal_session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant       ON attendance_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_session       ON qr_tokens(meal_session_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires       ON qr_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_date    ON meal_sessions(tenant_id, session_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_student   ON subscriptions(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student        ON invoices(student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant         ON invoices(tenant_id);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY on all tables
-- ============================================================
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE students               ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens              ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices               ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTION: get current user role
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- HELPER: get current user tenant_id
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES --
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (id = auth.uid());

CREATE POLICY "Super admin can view all profiles"
  ON profiles FOR SELECT USING (get_my_role() = 'super_admin');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY "System can insert profiles"
  ON profiles FOR INSERT WITH CHECK (id = auth.uid());

-- TENANTS --
CREATE POLICY "Super admin can do everything with tenants"
  ON tenants FOR ALL USING (get_my_role() = 'super_admin');

CREATE POLICY "Mess admin can view their own tenant"
  ON tenants FOR SELECT USING (
    get_my_role() = 'mess_admin' AND owner_id = auth.uid()
  );

CREATE POLICY "Students can view their tenant"
  ON tenants FOR SELECT USING (
    get_my_role() = 'student' AND id = get_my_tenant_id()
  );

-- SUBSCRIPTION PLANS --
CREATE POLICY "Mess admin can manage own tenant plans"
  ON subscription_plans FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Students can view their tenant plans"
  ON subscription_plans FOR SELECT USING (
    get_my_role() = 'student' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Super admin can view all plans"
  ON subscription_plans FOR SELECT USING (get_my_role() = 'super_admin');

-- STUDENTS --
CREATE POLICY "Mess admin can manage own tenant students"
  ON students FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Student can view own record"
  ON students FOR SELECT USING (auth_user_id = auth.uid());

CREATE POLICY "Super admin can view all students"
  ON students FOR SELECT USING (get_my_role() = 'super_admin');

-- SUBSCRIPTIONS --
CREATE POLICY "Mess admin can manage own tenant subscriptions"
  ON subscriptions FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Student can view own subscriptions"
  ON subscriptions FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

-- MEAL SESSIONS --
CREATE POLICY "Mess admin can manage own sessions"
  ON meal_sessions FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Students can view their tenant sessions"
  ON meal_sessions FOR SELECT USING (
    get_my_role() = 'student' AND tenant_id = get_my_tenant_id()
  );

-- QR TOKENS --
CREATE POLICY "Mess admin can view own session tokens"
  ON qr_tokens FOR SELECT USING (
    get_my_role() = 'mess_admin'
    AND meal_session_id IN (
      SELECT id FROM meal_sessions WHERE tenant_id = get_my_tenant_id()
    )
  );

-- Students can read active tokens for scanning (via edge function is safer, but allow read)
CREATE POLICY "Students can read active tokens"
  ON qr_tokens FOR SELECT USING (
    get_my_role() = 'student'
    AND expires_at > NOW()
    AND meal_session_id IN (
      SELECT id FROM meal_sessions WHERE tenant_id = get_my_tenant_id()
    )
  );

-- ATTENDANCE RECORDS --
CREATE POLICY "Mess admin can view own tenant attendance"
  ON attendance_records FOR SELECT USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

-- Students can only view their own records
CREATE POLICY "Student can view own attendance"
  ON attendance_records FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

-- Inserts happen via Edge Function (SECURITY DEFINER), not direct client
CREATE POLICY "Edge function can insert attendance"
  ON attendance_records FOR INSERT WITH CHECK (TRUE);

-- ATTENDANCE ADJUSTMENTS --
CREATE POLICY "Mess admin can manage adjustments"
  ON attendance_adjustments FOR ALL USING (
    get_my_role() = 'mess_admin'
  );

-- INVOICES --
CREATE POLICY "Mess admin can view own tenant invoices"
  ON invoices FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Student can view own invoices"
  ON invoices FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Super admin can view all invoices"
  ON invoices FOR SELECT USING (get_my_role() = 'super_admin');
