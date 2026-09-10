'use client';

import { Clock01Icon, ClockCheckIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { AccountMenu } from '@/components/account-menu';
import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  year: 'numeric',
});

const hasClockedIn = false;

export function EmployeeLanding() {
  const today = dateFormatter.format(new Date());
  return (
    <CenteredPage>
      <div className="flex flex-col">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{today}</p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Selamat pagi, Rina
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
              <h2 id="attendance-title" className="mt-1 text-lg font-semibold">
                {hasClockedIn ? 'Sudah clock in' : 'Belum clock in'}
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
            {hasClockedIn ? (
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
            {hasClockedIn ? (
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
          <h2 id="today-history-title" className="text-sm font-semibold">
            Riwayat hari ini
          </h2>
          <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
            <li className="flex items-center justify-between gap-4 py-3">
              <span>Clock in</span>
              <span className="text-muted-foreground">
                {hasClockedIn ? 'Tercatat' : 'Belum tercatat'}
              </span>
            </li>
            <li className="flex items-center justify-between gap-4 py-3">
              <span>Clock out</span>
              <span className="text-muted-foreground">Belum tercatat</span>
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
