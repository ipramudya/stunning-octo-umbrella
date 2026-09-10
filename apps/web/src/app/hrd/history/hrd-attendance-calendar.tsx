'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import useSWR from 'swr';

import { CenteredPage } from '@/components/layout/centered-page';
import { MonthNavigation } from '@/components/month-navigation';
import { buttonVariants } from '@/components/ui/button';
import { apiPages } from '@/lib/api';
import { calendarMonth, dateKey, shiftMonth } from '@/lib/calendar';
import { hrdAttendanceListSchema } from '@/lib/contracts';
import type { AttendanceEntry } from '@/lib/contracts';
import { cn } from '@/lib/utils';

const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export function HrdAttendanceCalendar() {
  const [month, setMonth] = React.useState(() => shiftMonth(new Date(), 0));
  const { cells, dateFrom, dateTo, daysInMonth } = calendarMonth(month);
  const key = `/hrd/attendance?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=100`;
  const { data, error, isLoading } = useSWR<AttendanceEntry[], Error>(
    key,
    async (path: string) => await apiPages(path, hrdAttendanceListSchema),
  );
  const byDate = Map.groupBy(data ?? [], (entry) => entry.workDate);

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
        <MonthNavigation
          eyebrow="Riwayat attendance"
          month={month}
          onNext={() => {
            setMonth((current) => shiftMonth(current, 1));
          }}
          onPrevious={() => {
            setMonth((current) => shiftMonth(current, -1));
          }}
        />

        {error !== undefined && (
          <p className="mt-4 text-sm text-destructive">{error.message}</p>
        )}
        <section
          aria-busy={isLoading}
          aria-label="Kalender attendance"
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
            {cells.map((day) => {
              const outside = day < 1 || day > daysInMonth;
              const itemCount = outside
                ? 0
                : (byDate.get(
                    dateKey(
                      new Date(month.getFullYear(), month.getMonth(), day),
                    ),
                  )?.length ?? 0);
              let cellClassName =
                'pointer-events-none min-h-24 border-e border-b border-border bg-background p-1.5 text-start';
              if (outside) {
                cellClassName =
                  'pointer-events-none min-h-24 border-e border-b border-border bg-muted/30';
              } else if (itemCount > 0) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-background p-1.5 text-start hover:bg-accent';
              }

              return (
                <Link
                  aria-disabled={itemCount === 0}
                  className={cellClassName}
                  href={
                    itemCount > 0
                      ? `/hrd/history/${day}?month=${dateFrom.slice(0, 7)}`
                      : '/hrd/history'
                  }
                  key={`${dateFrom}-${day}`}
                >
                  {!outside && (
                    <span className="flex flex-col gap-1">
                      <span className="text-xs">{day}</span>
                      {itemCount > 0 && (
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
