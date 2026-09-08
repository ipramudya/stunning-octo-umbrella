import { status } from "@grpc/grpc-js";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { argon2id, hash, verify } from "argon2";
import {
  Role,
  TokenAudience,
  type AudienceToken,
  type EmployeeProfile,
  type SessionCredentials,
} from "@project/contracts";
import { AuthError, type Employee, validateLogin } from "./auth.js";
import type { Environment } from "./config.schema.js";
import { EmployeeRepository } from "./employee.repository.js";
import { SessionStore } from "./session.store.js";
import { TokenService } from "./tokens.js";

const audienceNames = new Map([
  [TokenAudience.TOKEN_AUDIENCE_IDENTITY, "dexa-identity"],
  [TokenAudience.TOKEN_AUDIENCE_ATTENDANCE, "dexa-attendance"],
]);

function profile(employee: Employee): EmployeeProfile {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    phoneNumber: employee.phoneNumber,
    ...(employee.email ? { email: employee.email } : {}),
    roles: employee.roles.map((role) => (role === "HRD" ? Role.ROLE_HRD : Role.ROLE_EMPLOYEE)),
  };
}

async function passwordMatches(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

@Injectable()
export class IdentityAuthService {
  private dummyHash?: Promise<string>;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly employees: EmployeeRepository,
    private readonly sessions: SessionStore,
    private readonly tokens: TokenService,
  ) {}

  async login(phoneNumber: string, password: string): Promise<SessionCredentials> {
    const login = validateLogin(phoneNumber, password);
    const employee = await this.employees.findByPhone(login.phoneNumber);
    const dummyHash = await (this.dummyHash ??= hash("invalid-password-placeholder", {
      type: argon2id,
      memoryCost: this.config.get("ARGON2_MEMORY_COST", { infer: true }),
      timeCost: this.config.get("ARGON2_TIME_COST", { infer: true }),
      parallelism: this.config.get("ARGON2_PARALLELISM", { infer: true }),
    }));
    const validPassword = await passwordMatches(
      employee?.passwordHash ?? dummyHash,
      login.password,
    );
    if (!employee || !validPassword)
      throw new AuthError("INVALID_CREDENTIALS", status.UNAUTHENTICATED);
    const session = await this.sessions.create(employee.id, employee.credentialVersion);
    return this.credentials(employee, session.sid, session.refreshToken);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
    const current = await this.sessions.getByRefreshToken(refreshToken);
    if (current) {
      const employee = await this.employees.findById(current.session.employeeId);
      if (!employee || employee.credentialVersion !== current.session.credentialVersion) {
        await this.sessions.revoke(refreshToken);
        throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
      }
      const rotated = await this.sessions.rotate(refreshToken);
      return this.credentials(employee, rotated.sid, rotated.refreshToken);
    }
    await this.sessions.rotate(refreshToken);
    throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
  }

  revoke(refreshToken: string) {
    return refreshToken ? this.sessions.revoke(refreshToken) : Promise.resolve();
  }

  async authorize(accessToken: string, requestedAudiences: TokenAudience[] = []) {
    let claims;
    try {
      claims = await this.tokens.verify(accessToken, "dexa-gateway");
    } catch {
      throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
    }
    const requested = [...new Set(requestedAudiences)];
    if (
      requested.length !== requestedAudiences.length ||
      requested.length > 2 ||
      requested.some((value) => !audienceNames.has(value))
    ) {
      throw new AuthError("VALIDATION_ERROR", status.INVALID_ARGUMENT);
    }
    const session = await this.sessions.get(claims.sid);
    if (!session || session.employeeId !== claims.sub) {
      throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
    }
    const employee = await this.employees.findById(session.employeeId);
    if (!employee || employee.credentialVersion !== session.credentialVersion) {
      throw new AuthError("AUTHENTICATION_REQUIRED", status.UNAUTHENTICATED);
    }
    const tokens: AudienceToken[] = await Promise.all(
      requested.map(async (audience) => {
        const audienceName = audienceNames.get(audience);
        if (!audienceName) throw new AuthError("VALIDATION_ERROR", status.INVALID_ARGUMENT);
        return {
          audience,
          token: await this.tokens.sign({
            employeeId: employee.id,
            sid: claims.sid,
            roles: employee.roles,
            audience: audienceName,
            ttl: 60,
          }),
        };
      }),
    );
    return { profile: profile(employee), sessionId: claims.sid, tokens };
  }

  private async credentials(employee: Employee, sid: string, refreshToken: string) {
    return {
      profile: profile(employee),
      accessToken: await this.tokens.sign({
        employeeId: employee.id,
        sid,
        roles: employee.roles,
        audience: "dexa-gateway",
        ttl: this.config.get("ACCESS_TOKEN_TTL_SECONDS", { infer: true }),
      }),
      refreshToken,
    };
  }
}
