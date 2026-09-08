CREATE TABLE employee_roles (
  employee_id VARCHAR2(36 CHAR) NOT NULL,
  role VARCHAR2(16 CHAR) NOT NULL,
  created_at TIMESTAMP(3) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_employee_roles PRIMARY KEY (employee_id, role),
  CONSTRAINT fk_employee_roles_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT ck_employee_roles_role CHECK (role IN ('EMPLOYEE', 'HRD'))
)
