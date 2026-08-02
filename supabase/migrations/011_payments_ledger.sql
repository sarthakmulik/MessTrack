-- ============================================================
-- Add Payments Ledger to track offline cash/UPI payments
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students(id),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'bank_transfer', 'other')),
  notes         TEXT,
  logged_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by invoice
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mess admin can manage payments for own tenant"
  ON payments FOR ALL USING (
    get_my_role() = 'mess_admin' AND tenant_id = get_my_tenant_id()
  );

CREATE POLICY "Student can view own payments"
  ON payments FOR SELECT USING (
    student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid())
  );

-- Function to auto-update invoice status to 'paid' when payments cover the total amount
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  total_paid NUMERIC;
  invoice_total NUMERIC;
BEGIN
  -- Sum all payments for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO total_paid FROM payments WHERE invoice_id = NEW.invoice_id;
  
  -- Get the total due for the invoice
  SELECT total_amount INTO invoice_total FROM invoices WHERE id = NEW.invoice_id;
  
  -- If paid in full, mark as paid
  IF total_paid >= invoice_total THEN
    UPDATE invoices SET status = 'paid' WHERE id = NEW.invoice_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoice_status
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_payment();
