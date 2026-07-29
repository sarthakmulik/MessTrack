-- ============================================================
-- PhonePe Business Integration Migration
-- ============================================================

-- 1. Tenant Secrets Table (Store API Keys securely)
CREATE TABLE IF NOT EXISTS tenant_secrets (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  phonepe_merchant_id TEXT,
  phonepe_salt_key TEXT,
  phonepe_salt_index TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Payments Table (Transaction Ledger)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL, 
  plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL, 
  transaction_id TEXT UNIQUE NOT NULL, -- Our generated ID (e.g. MT_12345)
  provider_txn_id TEXT, -- PhonePe Transaction ID
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- tenant_secrets Policies
-- ONLY Mess Admin owner can manage their own secrets
CREATE POLICY "Mess admin can manage their own secrets"
  ON tenant_secrets FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = tenant_secrets.tenant_id 
      AND tenants.owner_id = auth.uid()
    )
  );

-- payments Policies
-- Students can read their own payments
CREATE POLICY "Students can view their own payments"
  ON payments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students 
      WHERE students.id = payments.student_id 
      AND students.auth_user_id = auth.uid()
    )
  );

-- Mess Admins can view payments for their tenant
CREATE POLICY "Mess admins can view their tenant payments"
  ON payments FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenants 
      WHERE tenants.id = payments.tenant_id 
      AND tenants.owner_id = auth.uid()
    )
  );

-- Only Edge Functions (Service Role) can insert/update payments!
-- (RLS automatically allows Service Role to bypass all policies)
