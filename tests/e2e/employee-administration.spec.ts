import { expect, test } from '@playwright/test';

import { expectPath, hrd, signIn } from './helpers';

const createdEmployee = {
  email: 'browser.employee@example.com',
  employeeNumber: 'E2E-001',
  fullName: 'Browser Employee',
  password: 'EmployeeInitial1!',
  phoneNumber: '+6280990000001',
};

test.beforeEach(async ({ page }) => {
  await signIn(page, hrd);
  await expectPath(page, '/hrd');
});

test('HRD searches employees and creates one on a dedicated page', async ({
  page,
}) => {
  await page.goto('/hrd/employees');
  await page.getByRole('searchbox', { name: 'Cari employee' }).fill('DEX-002');
  await expect(page.getByRole('link', { name: /Dexa Employee/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Dexa HRD/ })).toHaveCount(0);

  await page.getByRole('link', { name: 'Tambah employee' }).click();
  await expectPath(page, '/hrd/employees/new');
  await page.getByLabel('Nomor employee').fill(createdEmployee.employeeNumber);
  await page.getByLabel('Nama lengkap').fill(createdEmployee.fullName);
  await page.getByLabel('Nomor telepon').fill(createdEmployee.phoneNumber);
  await page.getByLabel('Email').fill(createdEmployee.email);
  await page.getByLabel('Kata sandi awal').fill(createdEmployee.password);
  await page.getByRole('button', { name: 'Tambah employee' }).click();

  await expectPath(page, '/hrd/employees');
  await page.getByRole('searchbox', { name: 'Cari employee' }).fill('E2E-001');
  await expect(
    page.getByRole('link', { name: /Browser Employee/ }),
  ).toBeVisible();
});

test('HRD updates an employee profile, phone number, and password', async ({
  page,
}) => {
  const response = await page.request.post('/api/v1/hrd/employees', {
    data: {
      ...createdEmployee,
      email: 'managed.employee@example.com',
      employeeNumber: 'E2E-002',
      phoneNumber: '+6280990000002',
    },
    headers: { origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100' },
  });

  expect(response.ok()).toBe(true);

  const profile = (await response.json()) as { id: string };

  await page.goto(`/hrd/employees/${profile.id}`);

  await page.getByLabel('Nama lengkap').fill('Managed Employee Updated');
  await page.getByRole('button', { name: 'Simpan profil' }).click();
  await expect(
    page.getByRole('heading', { name: 'Managed Employee Updated' }),
  ).toBeVisible();

  await page.getByLabel('Nomor telepon').fill('+6280990000092');
  await page.getByRole('button', { name: 'Simpan nomor telepon' }).click();
  await expect(page.getByLabel('Nomor telepon')).toHaveValue('+6280990000092');

  await page.getByLabel('Kata sandi baru').fill('EmployeeChanged1!');
  await page.getByRole('button', { name: 'Reset kata sandi' }).click();
  await expect(page.getByLabel('Kata sandi baru')).toHaveValue('');
});

test('HRD updates attendance coverage', async ({ page }) => {
  await page.goto('/hrd/coverage');
  await page.getByLabel('Nama area').fill('E2E Office');
  await page.getByLabel('Alamat').fill('Bintaro, Tangerang Selatan');
  await page.getByLabel('Radius (meter)').fill('750');
  await page.getByRole('button', { name: 'Simpan coverage area' }).click();

  await expect(page.getByText('Coverage tersimpan.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nama area')).toHaveValue('E2E Office');
  await expect(page.getByLabel('Radius (meter)')).toHaveValue('750');
});
