import { expect, test } from '@playwright/test';

import { employee, expectPath, hrd, signIn } from './helpers';

test('private routes require authentication', async ({ page }) => {
  await page.goto('/employee');
  await expectPath(page, '/login');

  await page.goto('/hrd');
  await expectPath(page, '/login');
});

test('invalid credentials show an actionable error', async ({ page }) => {
  await signIn(page, {
    phoneNumber: employee.phoneNumber,
    password: 'WrongPassword1!',
  });

  await expect(
    page.getByText('Nomor telepon atau kata sandi salah'),
  ).toBeVisible();
  await expectPath(page, '/login');
});

test('employee signs in, cannot open HRD routes, and signs out', async ({
  page,
}) => {
  await signIn(page, employee);
  await expectPath(page, '/employee');
  await expect(
    page.getByRole('heading', { name: /Selamat datang/ }),
  ).toBeVisible();

  await page.goto('/hrd');
  await expectPath(page, '/employee');

  await page.getByRole('button', { name: 'Buka menu akun' }).click();
  await page.getByRole('menuitem', { name: 'Keluar' }).click();
  await expectPath(page, '/login');
});

test('HRD signs in and can use employee features assigned to the role', async ({
  page,
}) => {
  await signIn(page, hrd);
  await expectPath(page, '/hrd');
  await expect(
    page.getByRole('heading', { name: 'Monitoring attendance' }),
  ).toBeVisible();

  await page.goto('/employee');
  await expectPath(page, '/employee');
  await expect(
    page.getByRole('heading', { name: /Selamat datang/ }),
  ).toBeVisible();
});
