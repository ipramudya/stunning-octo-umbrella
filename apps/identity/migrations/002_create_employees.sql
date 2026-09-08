CREATE TABLE employees (
  id VARCHAR2(36 CHAR) PRIMARY KEY,
  employee_number VARCHAR2(32 CHAR) NOT NULL UNIQUE,
  full_name VARCHAR2(120 CHAR) NOT NULL,
  phone_number VARCHAR2(16 CHAR) NOT NULL UNIQUE,
  email VARCHAR2(254 CHAR) UNIQUE,
  password_hash VARCHAR2(255 CHAR) NOT NULL,
  credential_version NUMBER(10) DEFAULT 1 NOT NULL,
  created_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  updated_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  created_by VARCHAR2(36 CHAR),
  updated_by VARCHAR2(36 CHAR),
  CONSTRAINT ck_employees_phone CHECK (REGEXP_LIKE(phone_number, '^\+62[0-9]+$')),
  CONSTRAINT fk_employees_created_by FOREIGN KEY (created_by) REFERENCES employees(id),
  CONSTRAINT fk_employees_updated_by FOREIGN KEY (updated_by) REFERENCES employees(id)
)
