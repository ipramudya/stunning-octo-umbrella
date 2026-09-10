'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import useSWR from 'swr';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { apiPages } from '@/lib/api';
import { hrdAttendanceListSchema } from '@/lib/contracts';
import type { AttendanceEntry } from '@/lib/contracts';
import { formatTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

export default function HrdAttendanceDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const { day } = React.use(params);
  const monthValue = React.use(searchParams).month;
  const month = typeof monthValue === 'string' ? monthValue : '';
  const date = `${month}-${day.padStart(2, '0')}`;
  const key = /^\d{4}-\d{2}-\d{2}$/u.test(date)
    ? `/hrd/attendance?dateFrom=${date}&dateTo=${date}&limit=100`
    : null;
  const { data, error, isLoading } = useSWR<AttendanceEntry[], Error>(
    key,
    async (path: string) => await apiPages(path, hrdAttendanceListSchema),
  );

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/hrd/history"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Riwayat attendance</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Attendance tanggal {day}
          </h1>
        </header>
        {error !== undefined && (
          <p className="mt-4 text-sm text-destructive">{error.message}</p>
        )}
        <ul
          aria-busy={isLoading}
          className="mt-8 divide-y divide-border border-y border-border text-sm"
        >
          {data?.map((entry) => (
            <li className="py-4" key={entry.id}>
              <Link className="underline" href={`/hrd/attendance/${entry.id}`}>
                {entry.employee?.fullName ?? entry.employeeId} ·{' '}
                {entry.clockType === 'CLOCK_IN' ? 'Clock in' : 'Clock out'}{' '}
                {formatTime(
                  entry.occurredAt ?? entry.claimedAt ?? entry.submittedAt,
                )}
              </Link>
            </li>
          ))}
          {!isLoading && data?.length === 0 && (
            <li className="py-4 text-muted-foreground">
              Tidak ada attendance.
            </li>
          )}
        </ul>
      </div>
    </CenteredPage>
  );
}
