-- ============================================================
-- MessTrack: Auto-create profile on signup
-- Trigger on auth.users INSERT
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'name', 'New User'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Auto-expire old QR tokens when new one is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION expire_old_qr_tokens()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE qr_tokens
  SET expires_at = NOW()
  WHERE meal_session_id = NEW.meal_session_id
    AND id != NEW.id
    AND expires_at > NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_qr_token ON qr_tokens;
CREATE TRIGGER on_new_qr_token
  AFTER INSERT ON qr_tokens
  FOR EACH ROW EXECUTE FUNCTION expire_old_qr_tokens();
