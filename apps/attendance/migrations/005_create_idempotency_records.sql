CREATE TABLE idempotency_records (
  actor_employee_id VARCHAR2(36 CHAR) NOT NULL,
  operation VARCHAR2(80 CHAR) NOT NULL,
  idempotency_key VARCHAR2(200 CHAR) NOT NULL,
  request_hash VARCHAR2(64 CHAR) NOT NULL,
  status VARCHAR2(11 CHAR) NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  response_status NUMBER(3),
  response_body CLOB CHECK (response_body IS JSON),
  created_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  expires_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP(3) WITH TIME ZONE,
  CONSTRAINT pk_idempotency_records PRIMARY KEY (actor_employee_id, operation, idempotency_key),
  CHECK ((status = 'IN_PROGRESS' AND response_status IS NULL AND completed_at IS NULL) OR
         (status = 'COMPLETED' AND response_status IS NOT NULL AND completed_at IS NOT NULL))
)
