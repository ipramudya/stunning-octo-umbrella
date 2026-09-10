'use client';

import { Clock01Icon, ClockCheckIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import useSWR from 'swr';

import { AccountMenu } from '@/components/account-menu';
import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { employeeAttendanceListSchema, profileSchema } from '@/lib/contracts';
import type {
  AttendanceEntry,
  EmployeeAttendanceList,
  Profile,
} from '@/lib/contracts';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  month: '2-digit',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

function latest(
  entries: AttendanceEntry[],
  clockType: AttendanceEntry['clockType'],
) {
  return entries.findLast((entry) => entry.clockType === clockType);
}

export function EmployeeLanding() {
  const now = new Date();
  const month = monthFormatter.format(now);
  const today = dayFormatter.format(now);
  const { data: profile } = useSWR<Profile, Error>(
    '/auth/me',
    async (path: string) => await api(path, profileSchema),
  );
  const { data, error, isLoading } = useSWR<EmployeeAttendanceList, Error>(
    `/me/attendance?month=${month}`,
    async (path: string) => await api(path, employeeAttendanceListSchema),
  );
  const todayEntries =
    data?.items.filter((entry) => entry.workDate === today) ?? [];
  const clockIn = latest(todayEntries, 'CLOCK_IN');
  const clockOut = latest(todayEntries, 'CLOCK_OUT');

  return (
    <CenteredPage>
      <div className="flex flex-col">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {dateFormatter.format(now)}
            </p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Selamat datang, {profile?.fullName ?? 'Employee'}
            </h1>
          </div>
          <AccountMenu />
        </header>

        <section
          aria-labelledby="attendance-title"
          className="mt-8 border border-border bg-card p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Absensi hari ini</p>
              <h2 className="mt-1 text-lg font-semibold" id="attendance-title">
                {clockIn ? 'Sudah clock in' : 'Belum clock in'}
              </h2>
            </div>
            <HugeiconsIcon
              aria-hidden="true"
              className="size-6 text-muted-foreground"
              icon={Clock01Icon}
            />
          </div>

          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Untuk absensi, izinkan akses kamera dan lokasi.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {clockIn ? (
              <Button className="h-12 w-full" disabled type="button">
                <HugeiconsIcon aria-hidden="true" icon={ClockCheckIcon} />
                Clock in
              </Button>
            ) : (
              <Link
                className={cn(buttonVariants(), 'h-12 w-full')}
                href="/employee/clock/clock-in"
              >
                <HugeiconsIcon aria-hidden="true" icon={ClockCheckIcon} />
                Clock in
              </Link>
            )}
            {clockIn && !clockOut ? (
              <Link
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'h-12 w-full',
                )}
                href="/employee/clock/clock-out"
              >
                <HugeiconsIcon aria-hidden="true" icon={Clock01Icon} />
                Clock out
              </Link>
            ) : (
              <Button
                className="h-12 w-full"
                disabled
                type="button"
                variant="outline"
              >
                <HugeiconsIcon aria-hidden="true" icon={Clock01Icon} />
                Clock out
              </Button>
            )}
          </div>
        </section>

        <section aria-labelledby="today-history-title" className="mt-8">
          <h2 className="text-sm font-semibold" id="today-history-title">
            Riwayat hari ini
          </h2>
          {error !== undefined && (
            <p className="mt-3 text-sm text-destructive">{error.message}</p>
          )}
          <ul
            aria-busy={isLoading}
            className="mt-3 divide-y divide-border border-y border-border text-sm"
          >
            <li className="flex items-center justify-between gap-4 py-3">
              <span>Clock in</span>
              <span className="text-muted-foreground">
                {clockIn
                  ? timeFormatter.format(
                      new Date(
                        clockIn.occurredAt ??
                          clockIn.claimedAt ??
                          clockIn.submittedAt,
                      ),
                    )
                  : 'Belum tercatat'}
              </span>
            </li>
            <li className="flex items-center justify-between gap-4 py-3">
              <span>Clock out</span>
              <span className="text-muted-foreground">
                {clockOut
                  ? timeFormatter.format(
                      new Date(
                        clockOut.occurredAt ??
                          clockOut.claimedAt ??
                          clockOut.submittedAt,
                      ),
                    )
                  : 'Belum tercatat'}
              </span>
            </li>
          </ul>
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-4 w-full',
            )}
            href="/employee/history"
          >
            Lihat riwayat absensi
          </Link>
        </section>
      </div>
    </CenteredPage>
  );
}
