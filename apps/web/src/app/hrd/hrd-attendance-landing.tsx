import { Location01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

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
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  year: 'numeric',
});

const attendance = [
  {
    id: 'regular-andi-pratama',
    name: 'Andi Pratama',
    status: 'Clock in · 08.02',
    tone: 'text-foreground',
  },
  {
    id: 'manual-rina-kusuma',
    name: 'Rina Kusuma',
    status: 'Menunggu review',
    tone: 'text-destructive',
  },
  {
    id: 'missing-budi-santoso',
    name: 'Budi Santoso',
    status: 'Belum clock in',
    tone: 'text-muted-foreground',
  },
];

export function HrdAttendanceLanding() {
  const today = dateFormatter.format(new Date());
  return (
    <CenteredPage>
      <div>
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{today}</p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Monitoring attendance
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
            <p className="text-sm text-muted-foreground">Sudah clock in</p>
            <p className="mt-1 font-heading text-2xl font-semibold">12</p>
          </div>
          <div className="border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Menunggu review</p>
            <p className="mt-1 font-heading text-2xl font-semibold">3</p>
          </div>
        </div>

        <section aria-labelledby="attendance-list-title" className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <h2 id="attendance-list-title" className="text-sm font-semibold">
              Attendance hari ini
            </h2>
            <Select defaultValue="Semua status">
              <SelectTrigger aria-label="Filter attendance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" alignItemWithTrigger={false}>
                <SelectItem value="Semua status">Semua status</SelectItem>
                <SelectItem value="Menunggu review">Menunggu review</SelectItem>
                <SelectItem value="Tercatat">Tercatat</SelectItem>
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
              placeholder="Cari nama atau nomor employee"
              type="search"
            />
          </div>

          <ul className="mt-4 divide-y divide-border border-y border-border">
            {attendance.slice(0, 5).map((entry) => (
              <li
                className="flex items-center justify-between gap-4 py-4"
                key={entry.name}
              >
                <span className="text-sm font-medium">{entry.name}</span>
                {entry.status === 'Belum clock in' ? (
                  <span className={`text-sm ${entry.tone}`}>
                    {entry.status}
                  </span>
                ) : (
                  <Link
                    className={`text-sm underline ${entry.tone}`}
                    href={`/hrd/attendance/${entry.id}`}
                  >
                    {entry.status}
                  </Link>
                )}
              </li>
            ))}
            {Array.from({ length: 5 - attendance.length }, (_, index) => (
              <li
                aria-hidden="true"
                className="flex items-center py-4"
                key={index}
              >
                <span className="h-4 w-2/5 bg-muted" />
              </li>
            ))}
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
