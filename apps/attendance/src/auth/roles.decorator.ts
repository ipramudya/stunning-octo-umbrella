import { SetMetadata } from '@nestjs/common';

import type { InternalRole } from './internal-token.js';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: InternalRole[]) =>
  SetMetadata(ROLES_KEY, roles);
