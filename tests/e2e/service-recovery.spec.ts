import { execFileSync } from 'node:child_process';

import { expect, test } from '@playwright/test';

import { hrd, signIn } from './helpers';

function compose(...args: string[]) {
  execFileSync('docker', ['compose', ...args], { stdio: 'ignore' });
}

test('attendance outage is explained and the page recovers', async ({
  page,
}) => {
  await signIn(page, hrd);
  compose('stop', 'attendance');

  try {
    await page.reload();
    await expect(
      page.getByText(
        /The (request timed out|service is temporarily unavailable)/u,
      ),
    ).toBeVisible();
  } finally {
    compose('start', 'attendance');
  }

  await expect
    .poll(async () => {
      const response = await page.request.get(
        `${process.env.GATEWAY_URL}/health/ready`,
      );

      return response.ok();
    })
    .toBe(true);
  await page.reload();
  await expect(
    page.getByText(
      /The (request timed out|service is temporarily unavailable)/u,
    ),
  ).toHaveCount(0);
});
