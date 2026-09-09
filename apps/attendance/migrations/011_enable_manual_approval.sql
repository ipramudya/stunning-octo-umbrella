DECLARE
  source_constraint VARCHAR2(128);
BEGIN
  SELECT constraint_name INTO source_constraint
  FROM user_constraints
  WHERE table_name = 'ATTENDANCE_ENTRIES'
    AND constraint_type = 'C'
    AND search_condition_vc LIKE '%source = ''MANUAL'' AND occurred_at IS NULL%';

  EXECUTE IMMEDIATE 'ALTER TABLE attendance_entries DROP CONSTRAINT ' || source_constraint;
  EXECUTE IMMEDIATE q'[
    ALTER TABLE attendance_entries ADD CONSTRAINT ck_attendance_source_fields
    CHECK (
      (source = 'REGULAR' AND occurred_at IS NOT NULL AND claimed_at IS NULL AND reason IS NULL) OR
      (source = 'MANUAL' AND claimed_at IS NOT NULL AND reason IS NOT NULL AND
        ((status = 'RECORDED' AND occurred_at = claimed_at) OR
         (status IN ('PENDING_REVIEW', 'REJECTED') AND occurred_at IS NULL)))
    )
  ]';
END;
