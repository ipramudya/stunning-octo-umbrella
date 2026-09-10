import { status } from '@grpc/grpc-js';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AudienceToken,
  SessionCredentials,
  TokenAudience,
} from '@project/contracts';

import { validateLogin } from '../auth/auth.helper.js';
import { SessionStore } from '../auth/session.store.js';
import { TokenService } from '../auth/tokens.js';
import type { Environment } from '../config/config-typedef.js';
import type { Employee } from '../employee/employee.entity.js';
import { profile } from '../employee/employee.helper.js';
import { EmployeeRepository } from '../employee/employee.repository.js';
import { audienceNames } from './identity.constant.js';
import { IdentityError } from './identity.error.js';

@Injectable()
export class IdentityAuthService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly employees: EmployeeRepository,
    private readonly sessions: SessionStore,
    private readonly tokens: TokenService,
  ) {}

  async login(
    phoneNumber: string,
    password: string,
  ): Promise<SessionCredentials> {
    const login = validateLogin(phoneNumber, password);

    const employee = await this.employees.findByPhone(login.phoneNumber);

    if (!employee) {
      throw new IdentityError('INVALID_CREDENTIALS', status.UNAUTHENTICATED);
    }

    const session = await this.sessions.create(
      employee.id,
      employee.credentialVersion,
    );

    return this.credentials(employee, session.sid, session.refreshToken);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new IdentityError(
        'AUTHENTICATION_REQUIRED',
        status.UNAUTHENTICATED,
      );
    }

    const current = await this.sessions.getByRefreshToken(refreshToken);

    if (current) {
      const employee = await this.employees.findById(
        current.session.employeeId,
      );

      if (
        !employee ||
        employee.credentialVersion !== current.session.credentialVersion
      ) {
        await this.sessions.revoke(refreshToken);

        throw new IdentityError(
          'AUTHENTICATION_REQUIRED',
          status.UNAUTHENTICATED,
        );
      }

      const rotated = await this.sessions.rotate(refreshToken);

      return this.credentials(employee, rotated.sid, rotated.refreshToken);
    }

    await this.sessions.rotate(refreshToken);

    throw new IdentityError('AUTHENTICATION_REQUIRED', status.UNAUTHENTICATED);
  }

  revoke(refreshToken: string) {
    if (refreshToken) {
      return this.sessions.revoke(refreshToken);
    }

    return Promise.resolve();
  }

  async authorize(
    accessToken: string,
    requestedAudiences: TokenAudience[] = [],
  ) {
    let claims;

    try {
      claims = await this.tokens.verify(accessToken, 'dexa-gateway');
    } catch {
      throw new IdentityError(
        'AUTHENTICATION_REQUIRED',
        status.UNAUTHENTICATED,
      );
    }

    const requested = [...new Set(requestedAudiences)];

    if (
      requested.length !== requestedAudiences.length ||
      requested.length > 2 ||
      requested.some((value) => !audienceNames.has(value))
    ) {
      throw new IdentityError('VALIDATION_ERROR', status.INVALID_ARGUMENT);
    }

    const session = await this.sessions.get(claims.sid);

    if (!session || session.employeeId !== claims.sub) {
      throw new IdentityError(
        'AUTHENTICATION_REQUIRED',
        status.UNAUTHENTICATED,
      );
    }

    const employee = await this.employees.findById(session.employeeId);

    if (!employee || employee.credentialVersion !== session.credentialVersion) {
      throw new IdentityError(
        'AUTHENTICATION_REQUIRED',
        status.UNAUTHENTICATED,
      );
    }

    const tokens: AudienceToken[] = await Promise.all(
      requested.map(async (audience) => {
        const audienceName = audienceNames.get(audience);

        if (!audienceName) {
          throw new IdentityError('VALIDATION_ERROR', status.INVALID_ARGUMENT);
        }

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

  private async credentials(
    employee: Employee,
    sid: string,
    refreshToken: string,
  ) {
    return {
      profile: profile(employee),
      accessToken: await this.tokens.sign({
        employeeId: employee.id,
        sid,
        roles: employee.roles,
        audience: 'dexa-gateway',
        ttl: this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      }),
      refreshToken,
    };
  }
}
