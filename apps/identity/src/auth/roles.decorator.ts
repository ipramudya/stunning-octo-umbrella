import { SetMetadata } from '@nestjs/common';

import type { RoleName } from '../employee/employee.entity.js';

export const ROLES_KEY = 'roles';

export function Roles(...roles: RoleName[]) {
  return SetMetadata(ROLES_KEY, roles);
}
