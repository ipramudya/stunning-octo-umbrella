export type Session = {
  employeeId: string;
  credentialVersion: number;
  createdAt: number;
  expiresAt: number;
  refreshDigest: string;
};
