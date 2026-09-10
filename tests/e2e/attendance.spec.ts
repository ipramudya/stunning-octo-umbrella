import { expect, test } from '@playwright/test';

import { employee, expectPath, hrd, signIn } from './helpers';

const png = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
]);

const workDate = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
}).format(new Date(Date.now() - 86_400_000));

const historyPath = `/hrd/history/${workDate.slice(8)}?month=${workDate.slice(0, 7)}`;

test('regular attendance accepts camera and accurate location', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getCurrentPosition = navigator.geolocation.getCurrentPosition.bind(
      navigator.geolocation,
    );

    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      getCurrentPosition(
        (position) => {
          success({
            coords: {
              accuracy: 10,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              latitude: -6.2806863,
              longitude: 106.7264211,
              speed: position.coords.speed,
              toJSON: () => ({}),
            },
            timestamp: position.timestamp,
            toJSON: () => ({}),
          });
        },
        error,
        options,
      );
    };
  });
  await signIn(page, employee);
  await page.getByRole('link', { name: 'Clock in' }).click();

  const submit = page.getByRole('button', { name: 'Clock in' });

  await expect(submit).toBeEnabled();
  await expect(page.getByText(/Bintaro/u)).toBeVisible();
});

test('manual attendance is validated, submitted, listed, and approved', async ({
  page,
}) => {
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { display_name: 'E2E Office, Bintaro' },
    });
  });
  await signIn(page, employee);
  await page.goto('/employee/manual/clock-in');

  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expect(page.getByText('Pilih tanggal kerja.')).toBeVisible();
  await expect(page.getByText('Pilih jam kerja.')).toBeVisible();
  await expect(page.getByText('Alasan wajib diisi.')).toBeVisible();

  await page.getByLabel('Tanggal kerja').fill('2000-01-12');
  await page.getByLabel('Jam kerja').fill('08:00');
  await page.getByLabel('Alasan').fill('Kendala jaringan saat memulai kerja.');
  await page.getByRole('button', { name: 'Buka peta' }).click();
  await expect(page.getByText('E2E Office, Bintaro').first()).toBeVisible();
  await page.getByLabel('Unggah foto').setInputFiles({
    buffer: png,
    mimeType: 'image/png',
    name: 'attendance.png',
  });
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expect(
    page.getByText(
      'Tanggal absensi manual berada di luar rentang yang diizinkan',
    ),
  ).toBeVisible();

  await page.getByLabel('Tanggal kerja').fill(workDate);
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expectPath(page, '/employee/history');

  const historyEntry = page.locator('a[href^="/employee/attendance/"]').first();

  await expect(historyEntry).toBeVisible();
  await historyEntry.click();
  await expect(page.getByRole('heading', { name: 'Clock in' })).toBeVisible();
  await expect(page.getByText('PENDING_REVIEW')).toBeVisible();

  await page.goto('/employee');
  await expect(page.getByText('Riwayat hari ini')).toBeVisible();

  await page.getByRole('button', { name: 'Buka menu akun' }).click();
  await page.getByRole('menuitem', { name: 'Keluar' }).click();
  await signIn(page, hrd);
  await page.goto(historyPath);

  const pendingClockIn = page.getByRole('link', {
    name: /Dexa Employee · Clock in/u,
  });

  await expect(pendingClockIn).toBeVisible();
  await pendingClockIn.click();
  await expect(
    page.getByText('Kendala jaringan saat memulai kerja.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan bukti foto' }).click();
  await expect(
    page.getByRole('img', { name: 'Bukti attendance' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Terima' }).click();

  await expect(page.getByRole('button', { name: 'Terima' })).toHaveCount(0);

  await page.goto('/hrd');
  await page.getByRole('button', { name: 'Buka menu akun' }).click();
  await page.getByRole('menuitem', { name: 'Keluar' }).click();
  await signIn(page, employee);
  await page.goto('/employee/manual/clock-out');
  await page.getByLabel('Tanggal kerja').fill(workDate);
  await page.getByLabel('Jam kerja').fill('15:00');
  await page
    .getByLabel('Alasan')
    .fill('Tidak dapat mengakses aplikasi saat pulang.');
  await page.getByRole('button', { name: 'Buka peta' }).click();
  await expect(page.getByText('E2E Office, Bintaro').first()).toBeVisible();
  await page.getByLabel('Unggah foto').setInputFiles({
    buffer: png,
    mimeType: 'image/png',
    name: 'clock-out.png',
  });
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await expectPath(page, '/employee/history');

  await page.goto('/employee');
  await page.getByRole('button', { name: 'Buka menu akun' }).click();
  await page.getByRole('menuitem', { name: 'Keluar' }).click();
  await signIn(page, hrd);
  await page.goto(historyPath);
  await page.getByRole('link', { name: /Dexa Employee · Clock out/u }).click();
  await page.getByLabel('Alasan penolakan').fill('Bukti tidak sesuai.');
  await page.getByRole('button', { name: 'Tolak' }).click();

  await expect(page.getByRole('button', { name: 'Tolak' })).toHaveCount(0);
});
