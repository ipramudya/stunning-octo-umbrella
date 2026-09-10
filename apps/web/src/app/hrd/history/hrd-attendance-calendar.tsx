'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const days = [
  { day: 4, items: ['Andi Pratama · Clock in 08.02'] },
  { day: 7, items: ['Rina Kusuma · Menunggu review'] },
  {
    day: 10,
    items: ['Andi Pratama · Clock out 17.01', 'Budi Santoso · Clock in 08.10'],
  },
];

const monthFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});

export function HrdAttendanceCalendar() {
  const month = new Date();
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from(
    { length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 },
    (_, index) => index - firstWeekday + 1,
  );
  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/hrd"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Riwayat attendance</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {monthFormatter.format(month)}
          </h1>
        </header>

        <section aria-label="Kalender attendance" className="mt-6">
          <div className="grid grid-cols-7 border border-b-0 border-border text-center text-xs text-muted-foreground">
            {weekdays.map((weekday) => (
              <div className="py-2" key={weekday}>
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-s border-t border-border">
            {cells.map((day, index) => {
              const itemCount = days.find((entry) => entry.day === day)?.items
                .length;
              const outside = day < 1 || day > daysInMonth;
              const hasItems = itemCount !== undefined;
              let cellClassName =
                'pointer-events-none min-h-24 border-e border-b border-border bg-background p-1.5 text-start';
              if (outside) {
                cellClassName =
                  'pointer-events-none min-h-24 border-e border-b border-border bg-muted/30';
              } else if (hasItems) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-background p-1.5 text-start hover:bg-accent';
              }
              return (
                <Link
                  className={cellClassName}
                  href={hasItems ? `/hrd/history/${day}` : '/hrd/history'}
                  key={index}
                >
                  {!outside && (
                    <span className="flex flex-col gap-1">
                      <span className="text-xs">{day}</span>
                      {(itemCount ?? 0) > 0 && (
                        <span className="text-[10px]">
                          {itemCount} attendance
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </CenteredPage>
  );
}
