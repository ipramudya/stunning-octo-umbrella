import { SetMetadata } from '@nestjs/common';

import type { InternalRole } from './internal-token.js';

export const ROLES_KEY = 'roles';

export function Roles(...roles: InternalRole[]) {
  return SetMetadata(ROLES_KEY, roles);
}
