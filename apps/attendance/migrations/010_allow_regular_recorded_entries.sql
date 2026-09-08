DECLARE
  status_constraint VARCHAR2(128);
BEGIN
  SELECT constraint_name INTO status_constraint
  FROM user_constraints
  WHERE table_name = 'ATTENDANCE_ENTRIES'
    AND constraint_type = 'C'
    AND search_condition_vc LIKE '%decided_at IS NULL%'
    AND search_condition_vc LIKE '%PENDING_REVIEW%';

  EXECUTE IMMEDIATE 'ALTER TABLE attendance_entries DROP CONSTRAINT ' || status_constraint;
  EXECUTE IMMEDIATE 'ALTER TABLE attendance_entries MODIFY address NULL';
  EXECUTE IMMEDIATE q'[
    ALTER TABLE attendance_entries ADD CONSTRAINT ck_attendance_decision
    CHECK (
      (status = 'PENDING_REVIEW' AND decided_at IS NULL AND decided_by_employee_id IS NULL) OR
      (source = 'MANUAL' AND status IN ('RECORDED', 'REJECTED') AND decided_at IS NOT NULL AND decided_by_employee_id IS NOT NULL) OR
      (source = 'REGULAR' AND status = 'RECORDED' AND decided_at IS NULL AND decided_by_employee_id IS NULL)
    )
  ]';
END;
