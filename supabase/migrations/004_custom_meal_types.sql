-- 004_custom_meal_types.sql
-- Removes hardcoded meal type constraint and adds custom meal configurations to tenants

-- 1. Drop the check constraint on meal_sessions for meal_type
DO $$ 
DECLARE 
  const_name TEXT;
BEGIN
  -- Find the check constraint on meal_type column
  SELECT constraint_name INTO const_name 
  FROM information_schema.constraint_column_usage 
  WHERE table_name = 'meal_sessions' AND column_name = 'meal_type'
  LIMIT 1;
  
  IF const_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE meal_sessions DROP CONSTRAINT ' || const_name;
  END IF;
END $$;

-- 2. Add meal_configs JSONB to tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meal_configs JSONB NOT NULL DEFAULT '{
  "breakfast": { "id": "breakfast", "icon": "🌅", "color": "#F4A261", "label": "Breakfast", "durationHours": 2 },
  "lunch": { "id": "lunch", "icon": "☀️", "color": "#E76F51", "label": "Lunch", "durationHours": 2 },
  "dinner": { "id": "dinner", "icon": "🌙", "color": "#264653", "label": "Dinner", "durationHours": 2 }
}'::jsonb;

-- 3. (Optional Fix) Add missing insert policy for qr_tokens for Mess Admin
DROP POLICY IF EXISTS "Mess admin can insert session tokens" ON qr_tokens;
CREATE POLICY "Mess admin can insert session tokens"
  ON qr_tokens FOR INSERT WITH CHECK (
    get_my_role() = 'mess_admin'
    AND meal_session_id IN (
      SELECT id FROM meal_sessions WHERE tenant_id = get_my_tenant_id()
    )
  );
