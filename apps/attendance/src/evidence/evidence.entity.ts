export type EvidenceUpload = {
  id: string;
  employeeId: string;
  status: 'AUTHORIZED' | 'FINALIZING' | 'ATTACHED';
  declaredContentType: string;
  declaredSizeBytes: number;
  stagingKey: string;
  stagingVersion: string | null;
  permanentKey: string | null;
  permanentVersion: string | null;
  expiresAt: Date;
};

export type EvidenceRow = {
  ID: string;
  EMPLOYEE_ID: string;
  STATUS: EvidenceUpload['status'];
  DECLARED_CONTENT_TYPE: string;
  DECLARED_SIZE_BYTES: number;
  STAGING_KEY: string;
  STAGING_VERSION: string | null;
  PERMANENT_KEY: string | null;
  PERMANENT_VERSION: string | null;
  EXPIRES_AT: Date;
};
