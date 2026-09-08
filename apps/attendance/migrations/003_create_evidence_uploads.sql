CREATE TABLE evidence_uploads (
  id VARCHAR2(36 CHAR) PRIMARY KEY,
  employee_id VARCHAR2(36 CHAR) NOT NULL,
  state VARCHAR2(16 CHAR) NOT NULL CHECK (state IN ('AUTHORIZED', 'FINALIZING', 'ATTACHED')),
  content_type VARCHAR2(10 CHAR) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
  size_bytes NUMBER(10) NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  staging_key VARCHAR2(500 CHAR) NOT NULL,
  staging_version VARCHAR2(200 CHAR),
  permanent_key VARCHAR2(500 CHAR),
  permanent_version VARCHAR2(200 CHAR),
  expires_at TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  attached_at TIMESTAMP(3) WITH TIME ZONE,
  created_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CHECK ((state = 'AUTHORIZED' AND permanent_key IS NULL AND attached_at IS NULL) OR
         (state = 'FINALIZING' AND permanent_key IS NOT NULL AND attached_at IS NULL) OR
         (state = 'ATTACHED' AND permanent_key IS NOT NULL AND attached_at IS NOT NULL))
)
