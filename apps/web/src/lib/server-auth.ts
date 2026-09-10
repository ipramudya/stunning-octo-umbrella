import { cookies } from 'next/headers';

import { profileSchema } from './contracts';

const gatewayUrl = process.env.GATEWAY_URL ?? 'http://localhost:3001';

export async function currentProfile() {
  const requestCookies = await cookies();
  const response = await fetch(`${gatewayUrl}/api/v1/auth/me`, {
    cache: 'no-store',
    headers: { cookie: requestCookies.toString() },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Authentication service returned ${response.status}`);
  }

  return profileSchema.parse(await response.json());
}
