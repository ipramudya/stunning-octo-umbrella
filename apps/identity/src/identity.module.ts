import { Module } from '@nestjs/common';

import { SessionStore } from './auth/session.store.js';
import { TokenService } from './auth/tokens.js';
import { EmployeeAdminService } from './employee/employee-admin.service.js';
import { EmployeeRepository } from './employee/employee.repository.js';
import { IdentityController } from './identity/identity.controller.js';
import { IdentityAuthService } from './identity/identity.service.js';
import { OracleDatabase } from './oracle.js';

@Module({
  controllers: [IdentityController],
  providers: [
    EmployeeAdminService,
    EmployeeRepository,
    IdentityAuthService,
    OracleDatabase,
    SessionStore,
    TokenService,
  ],
  exports: [OracleDatabase, SessionStore],
})
export class IdentityModule {}
