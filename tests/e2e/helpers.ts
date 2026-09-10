import { execFileSync } from 'node:child_process';

import { expect, type Page } from '@playwright/test';

function env(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const employee = {
  password: env('DEMO_EMPLOYEE_PASSWORD'),
  phoneNumber: '+6280000000002',
};
export const hrd = {
  password: env('DEMO_HRD_PASSWORD'),
  phoneNumber: '+6280000000001',
};

export async function signIn(
  page: Page,
  account: { phoneNumber: string; password: string },
) {
  await page.goto('/login');
  await page
    .getByRole('textbox', { name: 'Nomor telepon', exact: true })
    .fill(account.phoneNumber);
  await page
    .getByRole('textbox', { name: 'Kata sandi', exact: true })
    .fill(account.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'redis',
      'sh',
      '-c',
      `redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning --scan --pattern 'rate:*' | xargs -r redis-cli --user gateway -a "$RATE_LIMIT_REDIS_PASSWORD" --no-auth-warning del`,
    ],
    { stdio: 'ignore' },
  );
}

export async function expectPath(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
}
