-- Migration 013: Advance Date-Range Leaves Function

CREATE OR REPLACE FUNCTION apply_advance_leave(
  p_student_id UUID,
  p_tenant_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_meal_types TEXT[],
  p_reason TEXT DEFAULT 'Going Home'
) RETURNS INTEGER AS $$
DECLARE
  v_curr_date DATE := p_start_date;
  v_meal_type TEXT;
  v_inserted_count INTEGER := 0;
BEGIN
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Start date cannot be after End date';
  END IF;

  WHILE v_curr_date <= p_end_date LOOP
    FOREACH v_meal_type IN ARRAY p_meal_types LOOP
      INSERT INTO meal_leaves (student_id, tenant_id, leave_date, meal_type, reason)
      VALUES (p_student_id, p_tenant_id, v_curr_date, v_meal_type, p_reason)
      ON CONFLICT (student_id, leave_date, meal_type) DO UPDATE
      SET reason = EXCLUDED.reason, created_at = NOW();
      
      v_inserted_count := v_inserted_count + 1;
    END LOOP;

    v_curr_date := v_curr_date + INTERVAL '1 day';
  END LOOP;

  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
