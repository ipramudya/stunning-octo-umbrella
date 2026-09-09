import type { CallOptions, Metadata } from '@grpc/grpc-js';
import type {
  AttendanceEntry,
  AttendanceZone,
  AuthorizeAccessRequest,
  AuthorizeEvidenceAccessRequest,
  AuthorizeEvidenceUploadRequest,
  Authorization,
  BatchGetEmployeesRequest,
  BatchGetEmployeesResponse,
  CreateEmployeeRequest,
  CreateManualAttendanceRequest,
  CreateRegularAttendanceRequest,
  DecideManualAttendanceRequest,
  EmployeeProfile,
  Empty,
  EvidenceAccessAuthorization,
  EvidenceUploadAuthorization,
  GetAttendanceRequest,
  GetEmployeeRequest,
  GetManualAttendanceRequest,
  ListAttendanceRequest,
  ListAttendanceResponse,
  ListEmployeeAttendanceRequest,
  ListEmployeesRequest,
  ListEmployeesResponse,
  ListPendingManualAttendanceRequest,
  ListPendingManualAttendanceResponse,
  LoginRequest,
  LogoutSessionRequest,
  RefreshSessionRequest,
  ResetEmployeePasswordRequest,
  SessionCredentials,
  UpdateAttendanceZoneRequest,
  UpdateEmployeePhoneNumberRequest,
  UpdateEmployeeProfileRequest,
} from '@project/contracts';
import type { Observable } from 'rxjs';

type UnaryGrpcMethod<Request, Response> = (
  request: Request,
  metadata: Metadata,
  options: Partial<CallOptions>,
) => Observable<Response>;

export type IdentityGrpcClient = {
  login: UnaryGrpcMethod<LoginRequest, SessionCredentials>;
  refreshSession: UnaryGrpcMethod<RefreshSessionRequest, SessionCredentials>;
  logoutSession: UnaryGrpcMethod<LogoutSessionRequest, Empty>;
  authorizeAccess: UnaryGrpcMethod<AuthorizeAccessRequest, Authorization>;
  listEmployees: UnaryGrpcMethod<ListEmployeesRequest, ListEmployeesResponse>;
  createEmployee: UnaryGrpcMethod<CreateEmployeeRequest, EmployeeProfile>;
  getEmployee: UnaryGrpcMethod<GetEmployeeRequest, EmployeeProfile>;
  batchGetEmployees: UnaryGrpcMethod<
    BatchGetEmployeesRequest,
    BatchGetEmployeesResponse
  >;
  updateEmployeeProfile: UnaryGrpcMethod<
    UpdateEmployeeProfileRequest,
    EmployeeProfile
  >;
  updateEmployeePhoneNumber: UnaryGrpcMethod<
    UpdateEmployeePhoneNumberRequest,
    EmployeeProfile
  >;
  resetEmployeePassword: UnaryGrpcMethod<ResetEmployeePasswordRequest, Empty>;
};

export type AttendanceGrpcClient = {
  getAttendanceZone: UnaryGrpcMethod<Empty, AttendanceZone>;
  updateAttendanceZone: UnaryGrpcMethod<
    UpdateAttendanceZoneRequest,
    AttendanceZone
  >;
  authorizeEvidenceUpload: UnaryGrpcMethod<
    AuthorizeEvidenceUploadRequest,
    EvidenceUploadAuthorization
  >;
  authorizeEvidenceAccess: UnaryGrpcMethod<
    AuthorizeEvidenceAccessRequest,
    EvidenceAccessAuthorization
  >;
  createRegularAttendance: UnaryGrpcMethod<
    CreateRegularAttendanceRequest,
    AttendanceEntry
  >;
  createManualAttendance: UnaryGrpcMethod<
    CreateManualAttendanceRequest,
    AttendanceEntry
  >;
  listPendingManualAttendance: UnaryGrpcMethod<
    ListPendingManualAttendanceRequest,
    ListPendingManualAttendanceResponse
  >;
  getManualAttendance: UnaryGrpcMethod<
    GetManualAttendanceRequest,
    AttendanceEntry
  >;
  decideManualAttendance: UnaryGrpcMethod<
    DecideManualAttendanceRequest,
    AttendanceEntry
  >;
  listEmployeeAttendance: UnaryGrpcMethod<
    ListEmployeeAttendanceRequest,
    ListAttendanceResponse
  >;
  getEmployeeAttendance: UnaryGrpcMethod<GetAttendanceRequest, AttendanceEntry>;
  listAttendance: UnaryGrpcMethod<
    ListAttendanceRequest,
    ListAttendanceResponse
  >;
  getAttendance: UnaryGrpcMethod<GetAttendanceRequest, AttendanceEntry>;
};
