-- Migration 016: Unified Payments Schema Fix, Partial Payments & UPI Configuration

-- 1. Tenant UPI Configuration
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS upi_name TEXT;

-- 2. Fix Payments Table Schema Collision (from Migration 006 & 011)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method TEXT CHECK (method IN ('phonepe', 'cash', 'upi', 'bank_transfer', 'other')) DEFAULT 'phonepe';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS logged_by UUID REFERENCES auth.users(id);
ALTER TABLE payments ALTER COLUMN transaction_id DROP NOT NULL;

-- 3. Invoices Partial Payment Support & Constraints
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- Drop old status check if exists and re-add with partially_paid
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS unique_student_monthly_invoice;
ALTER TABLE invoices ADD CONSTRAINT unique_student_monthly_invoice UNIQUE (tenant_id, student_id, period_start);

-- 4. Unified Trigger for Auto-Updating Invoices on Payment
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC(10,2) := 0.00;
  v_invoice_total NUMERIC(10,2) := 0.00;
BEGIN
  IF NEW.invoice_id IS NOT NULL AND (NEW.status = 'success' OR NEW.status = 'completed' OR NEW.status IS NULL) THEN
    -- Sum all successful/logged payments for this invoice
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_paid 
    FROM payments 
    WHERE invoice_id = NEW.invoice_id 
      AND (status = 'success' OR status = 'completed' OR status IS NULL);
    
    SELECT total_amount INTO v_invoice_total FROM invoices WHERE id = NEW.invoice_id;
    
    IF v_total_paid >= v_invoice_total THEN
      UPDATE invoices SET paid_amount = v_total_paid, status = 'paid' WHERE id = NEW.invoice_id;
    ELSIF v_total_paid > 0 THEN
      UPDATE invoices SET paid_amount = v_total_paid, status = 'partially_paid' WHERE id = NEW.invoice_id;
    ELSE
      UPDATE invoices SET paid_amount = 0.00 WHERE id = NEW.invoice_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_invoice_status ON payments;
CREATE TRIGGER trigger_update_invoice_status
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_payment();
