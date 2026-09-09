import { fileURLToPath } from 'node:url';

export * from './generated/grpc/health/v1/health.js';
export {
  type AttendanceDecision,
  AttendanceEntry,
  type AttendanceLocation,
  AttendanceOrder,
  AttendanceSource,
  AttendanceStatus,
  type AttendanceServiceClient,
  AttendanceServiceService,
  type AttendanceZone,
  type AuthorizeEvidenceAccessRequest,
  type AuthorizeEvidenceUploadRequest,
  ClockType,
  type CreateManualAttendanceRequest,
  type CreateRegularAttendanceRequest,
  type DecideManualAttendanceRequest,
  type EvidenceAccessAuthorization,
  type GetAttendanceRequest,
  type GetManualAttendanceRequest,
  type ListAttendanceRequest,
  type ListAttendanceResponse,
  type ListEmployeeAttendanceRequest,
  type ListPendingManualAttendanceRequest,
  type ListPendingManualAttendanceResponse,
  ManualAttendanceDecision,
  type EvidenceUploadAuthorization,
  type UpdateAttendanceZoneRequest,
} from './generated/dexa/attendance/v1/attendance.js';
export {
  type AudienceToken,
  type Authorization,
  type BatchGetEmployeesRequest,
  type BatchGetEmployeesResponse,
  type AuthorizeAccessRequest,
  type CreateEmployeeRequest,
  type EmployeeProfile,
  type GetEmployeeRequest,
  type IdentityServiceClient,
  IdentityServiceService,
  type ListEmployeesRequest,
  type ListEmployeesResponse,
  type LoginRequest,
  type LogoutSessionRequest,
  type RefreshSessionRequest,
  type ResetEmployeePasswordRequest,
  Role,
  type SessionCredentials,
  TokenAudience,
  type UpdateEmployeePhoneNumberRequest,
  type UpdateEmployeeProfileRequest,
} from './generated/dexa/identity/v1/identity.js';
export { type Empty } from './generated/google/protobuf/empty.js';

export const ATTENDANCE_PROTO_PATH = fileURLToPath(
  new URL('../proto/dexa/attendance/v1/attendance.proto', import.meta.url),
);

export const IDENTITY_PROTO_PATH = fileURLToPath(
  new URL('../proto/dexa/identity/v1/identity.proto', import.meta.url),
);

export const HEALTH_PROTO_PATH = fileURLToPath(
  new URL('../proto/grpc/health/v1/health.proto', import.meta.url),
);
