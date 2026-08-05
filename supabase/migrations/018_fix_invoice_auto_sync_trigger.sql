-- Migration 018: Guaranteed Invoice Status & Paid Amount Synchronization Trigger

-- 1. Trigger function to ensure status and paid_amount are ALWAYS 100% in sync
CREATE OR REPLACE FUNCTION sync_invoice_paid_status()
RETURNS TRIGGER AS $$
BEGIN
  -- If total_amount > 0 and paid_amount >= total_amount, force status to 'paid'
  IF NEW.total_amount > 0 AND COALESCE(NEW.paid_amount, 0) >= NEW.total_amount THEN
    NEW.status := 'paid';
    NEW.paid_amount := NEW.total_amount;
  -- If status is set to 'paid', ensure paid_amount equals total_amount
  ELSIF NEW.status = 'paid' THEN
    IF NEW.paid_amount IS NULL OR NEW.paid_amount < NEW.total_amount THEN
      NEW.paid_amount := NEW.total_amount;
    END IF;
  -- If paid_amount > 0 and paid_amount < total_amount, set status to 'partially_paid'
  ELSIF COALESCE(NEW.paid_amount, 0) > 0 AND NEW.paid_amount < NEW.total_amount THEN
    NEW.status := 'partially_paid';
  -- Default fallback for unpaid
  ELSIF COALESCE(NEW.paid_amount, 0) = 0 AND (NEW.status IS NULL OR NEW.status = 'paid' OR NEW.status = 'partially_paid') THEN
    NEW.status := 'sent';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_sync_invoice_paid_status ON invoices;
CREATE TRIGGER trigger_sync_invoice_paid_status
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION sync_invoice_paid_status();

-- 2. Enhanced Payments Trigger (handles INSERT, UPDATE, and DELETE safely)
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC(10,2) := 0.00;
  v_invoice_total NUMERIC(10,2) := 0.00;
  v_inv_id UUID;
BEGIN
  v_inv_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;

  IF v_inv_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_paid FROM payments 
    WHERE invoice_id = v_inv_id AND (status = 'success' OR status = 'completed' OR status IS NULL);
    
    SELECT total_amount INTO v_invoice_total FROM invoices WHERE id = v_inv_id;
    
    IF v_total_paid >= v_invoice_total THEN
      UPDATE invoices SET paid_amount = v_total_paid, status = 'paid' WHERE id = v_inv_id;
    ELSIF v_total_paid > 0 THEN
      UPDATE invoices SET paid_amount = v_total_paid, status = 'partially_paid' WHERE id = v_inv_id;
    ELSE
      UPDATE invoices SET paid_amount = 0.00, status = 'sent' WHERE id = v_inv_id;
    END IF;
  END IF;
  
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_invoice_status ON payments;
CREATE TRIGGER trigger_update_invoice_status
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_invoice_status_on_payment();

-- 3. One-time Cleanup of Historical Invoice Records in DB
UPDATE invoices 
SET status = 'paid', paid_amount = total_amount 
WHERE (status = 'paid' AND paid_amount < total_amount) 
   OR (paid_amount >= total_amount AND total_amount > 0);

UPDATE invoices 
SET status = 'partially_paid' 
WHERE paid_amount > 0 AND paid_amount < total_amount AND status = 'sent';
