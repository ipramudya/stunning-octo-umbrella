'use client';

import { Location01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import useSWR from 'swr';

import { AccountMenu } from '@/components/account-menu';
import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiPages } from '@/lib/api';
import { hrdAttendanceListSchema } from '@/lib/contracts';
import type { AttendanceEntry } from '@/lib/contracts';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  year: 'numeric',
});
const apiDateFormatter = new Intl.DateTimeFormat('en-CA', {
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

type StatusFilter = 'ALL' | 'PENDING_REVIEW' | 'RECORDED';

export function HrdAttendanceLanding() {
  const now = new Date();
  const date = apiDateFormatter.format(now);
  const key = `/hrd/attendance?dateFrom=${date}&dateTo=${date}&limit=100`;
  const { data, error, isLoading } = useSWR<AttendanceEntry[], Error>(
    key,
    async (path: string) => await apiPages(path, hrdAttendanceListSchema),
  );
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<StatusFilter>('ALL');
  const items = (data ?? []).filter((entry) => {
    const matchesStatus = status === 'ALL' || entry.status === status;
    const { employee } = entry;
    const search = query.toLocaleLowerCase('id-ID');
    const matchesQuery =
      search.length === 0 ||
      (employee?.fullName.toLocaleLowerCase('id-ID').includes(search) ??
        false) ||
      (employee?.employeeNumber.toLocaleLowerCase('id-ID').includes(search) ??
        false);

    return matchesStatus && matchesQuery;
  });
  const recorded = data?.filter((entry) => entry.status === 'RECORDED');
  const pending = data?.filter((entry) => entry.status === 'PENDING_REVIEW');

  return (
    <CenteredPage>
      <div>
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {dateFormatter.format(now)}
            </p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Monitoring attendance
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}
              href="/hrd/employees"
            >
              Employee
            </Link>
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}
              href="/hrd/coverage"
            >
              <HugeiconsIcon aria-hidden="true" icon={Location01Icon} />
              Set coverage
            </Link>
            <AccountMenu />
          </div>
        </header>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Tercatat</p>
            <p className="mt-1 font-heading text-2xl font-semibold">
              {recorded?.length ?? 0}
            </p>
          </div>
          <div className="border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Menunggu review</p>
            <p className="mt-1 font-heading text-2xl font-semibold">
              {pending?.length ?? 0}
            </p>
          </div>
        </div>

        <section aria-labelledby="attendance-list-title" className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold" id="attendance-list-title">
              Attendance hari ini
            </h2>
            <Select
              onValueChange={(value) => {
                if (
                  value === 'ALL' ||
                  value === 'PENDING_REVIEW' ||
                  value === 'RECORDED'
                ) {
                  setStatus(value);
                }
              }}
              value={status}
            >
              <SelectTrigger aria-label="Filter attendance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" alignItemWithTrigger={false}>
                <SelectItem value="ALL">Semua status</SelectItem>
                <SelectItem value="PENDING_REVIEW">Menunggu review</SelectItem>
                <SelectItem value="RECORDED">Tercatat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative mt-4">
            <HugeiconsIcon
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
            />
            <Input
              aria-label="Cari employee"
              className="ps-10"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="Cari nama atau nomor employee"
              type="search"
              value={query}
            />
          </div>

          {error !== undefined && (
            <p className="mt-4 text-sm text-destructive">{error.message}</p>
          )}
          <ul
            aria-busy={isLoading}
            className="mt-4 divide-y divide-border border-y border-border"
          >
            {items.map((entry) => (
              <li
                className="flex items-center justify-between gap-4 py-4"
                key={entry.id}
              >
                <span className="text-sm font-medium">
                  {entry.employee?.fullName ?? entry.employeeId}
                </span>
                <Link
                  className="text-sm underline"
                  href={`/hrd/attendance/${entry.id}`}
                >
                  {entry.status === 'PENDING_REVIEW'
                    ? 'Menunggu review'
                    : `${entry.clockType === 'CLOCK_IN' ? 'Clock in' : 'Clock out'} · ${timeFormatter.format(new Date(entry.occurredAt ?? entry.claimedAt ?? entry.submittedAt))}`}
                </Link>
              </li>
            ))}
            {!isLoading && items.length === 0 && (
              <li className="py-4 text-sm text-muted-foreground">
                Tidak ada attendance.
              </li>
            )}
          </ul>
          <Link
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-4 w-full',
            )}
            href="/hrd/history"
          >
            Lihat riwayat attendance
          </Link>
        </section>
      </div>
    </CenteredPage>
  );
}
