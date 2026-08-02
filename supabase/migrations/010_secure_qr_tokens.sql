-- Remove the insecure policy that allowed students to read active QR tokens.
-- Students never need to SELECT qr_tokens; they only need to pass the string from their camera
-- to the validate-scan Edge Function, which runs with a Service Role key.

DROP POLICY IF EXISTS "Students can read active tokens" ON qr_tokens;
