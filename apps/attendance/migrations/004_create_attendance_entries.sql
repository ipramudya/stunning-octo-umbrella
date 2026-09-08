CREATE TABLE attendance_entries (
  id VARCHAR2(36 CHAR) PRIMARY KEY,
  employee_id VARCHAR2(36 CHAR) NOT NULL,
  work_date DATE NOT NULL CHECK (work_date = TRUNC(work_date)),
  clock_type VARCHAR2(9 CHAR) NOT NULL CHECK (clock_type IN ('CLOCK_IN', 'CLOCK_OUT')),
  source VARCHAR2(7 CHAR) NOT NULL CHECK (source IN ('REGULAR', 'MANUAL')),
  status VARCHAR2(14 CHAR) NOT NULL CHECK (status IN ('PENDING_REVIEW', 'RECORDED', 'REJECTED')),
  occurred_at TIMESTAMP(3) WITH TIME ZONE,
  claimed_at TIMESTAMP(3) WITH TIME ZONE,
  submitted_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  address VARCHAR2(500 CHAR) NOT NULL,
  latitude NUMBER(10,7) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMBER(10,7) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters NUMBER(10,2) CHECK (accuracy_meters >= 0),
  distance_meters NUMBER(10,2) CHECK (distance_meters >= 0),
  reason VARCHAR2(1000 CHAR),
  evidence_id VARCHAR2(36 CHAR) UNIQUE REFERENCES evidence_uploads(id),
  decided_at TIMESTAMP(3) WITH TIME ZONE,
  decided_by_employee_id VARCHAR2(36 CHAR),
  decision_reason VARCHAR2(1000 CHAR),
  updated_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT uq_attendance_action UNIQUE (employee_id, work_date, clock_type),
  CHECK ((source = 'REGULAR' AND occurred_at IS NOT NULL AND claimed_at IS NULL AND reason IS NULL) OR
         (source = 'MANUAL' AND occurred_at IS NULL AND claimed_at IS NOT NULL AND reason IS NOT NULL)),
  CHECK ((status = 'PENDING_REVIEW' AND decided_at IS NULL AND decided_by_employee_id IS NULL) OR
         (status IN ('RECORDED', 'REJECTED') AND decided_at IS NOT NULL AND decided_by_employee_id IS NOT NULL))
)
