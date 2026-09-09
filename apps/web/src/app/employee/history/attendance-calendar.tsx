'use client';

import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const formatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const today = new Date();
today.setHours(0, 0, 0, 0);

const attendance = new Map(
  [-6, -5, -4, -3, -2, -1].map((daysAgo, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + daysAgo);
    return [
      dateKey(date),
      {
        clockIn: `08:${String(index + 1).padStart(2, '0')}`,
        clockOut: '17:00',
      },
    ];
  }),
);

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

export const AttendanceCalendar = () => {
  const [month, setMonth] = React.useState(startOfMonth(today));
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
          href="/employee"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>

        <header className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Riwayat absensi</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
              {formatter.format(month)}
            </h1>
          </div>
          <div className="flex gap-2">
            <Button
              aria-label="Bulan sebelumnya"
              onClick={() => {
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() - 1, 1),
                );
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
            </Button>
            <Button
              aria-label="Bulan berikutnya"
              onClick={() => {
                setMonth(
                  (current) =>
                    new Date(current.getFullYear(), current.getMonth() + 1, 1),
                );
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} />
            </Button>
          </div>
        </header>

        <section
          aria-label={`Kalender absensi ${formatter.format(month)}`}
          className="mt-6"
        >
          <div className="grid grid-cols-7 border border-b-0 border-border text-center text-xs text-muted-foreground">
            {weekdays.map((weekday) => (
              <div className="py-2" key={weekday}>
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 border-s border-t border-border">
            {cells.map((day, index) => {
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const isOutsideMonth = day < 1 || day > daysInMonth;
              const isToday = dateKey(date) === dateKey(today);
              const entry = attendance.get(dateKey(date));
              let cellClassName =
                'min-h-24 border-e border-b border-border bg-background p-1.5';

              if (isOutsideMonth) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-muted/70';
              } else if (entry) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-card p-1.5';
              }

              return (
                <div className={cellClassName} key={index}>
                  {!isOutsideMonth && (
                    <>
                      <span
                        className={
                          isToday
                            ? 'grid size-6 place-items-center bg-primary text-xs font-medium text-primary-foreground'
                            : 'grid size-6 place-items-center text-xs'
                        }
                      >
                        {day}
                      </span>
                      {entry && (
                        <div className="mt-2 space-y-1 text-[10px] leading-3">
                          <p className="flex gap-1">
                            <span className="text-muted-foreground">In</span>
                            <time className="text-foreground/80">
                              {entry.clockIn}
                            </time>
                          </p>
                          <p className="flex gap-1">
                            <span className="text-muted-foreground">Out</span>
                            <time className="text-foreground/80">
                              {entry.clockOut}
                            </time>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </CenteredPage>
  );
};
