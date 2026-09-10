'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import useSWR from 'swr';

import { CenteredPage } from '@/components/layout/centered-page';
import { MonthNavigation } from '@/components/month-navigation';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { calendarMonth, dateKey, shiftMonth } from '@/lib/calendar';
import { employeeAttendanceListSchema } from '@/lib/contracts';
import type { EmployeeAttendanceList } from '@/lib/contracts';
import { cn } from '@/lib/utils';

const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});
export function AttendanceCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [month, setMonth] = React.useState(() => shiftMonth(today, 0));
  const monthKey = dateKey(month).slice(0, 7);
  const { data, error, isLoading } = useSWR<EmployeeAttendanceList, Error>(
    `/me/attendance?month=${monthKey}`,
    async (path: string) => await api(path, employeeAttendanceListSchema),
  );
  const { cells, daysInMonth } = calendarMonth(month);
  const attendance = Map.groupBy(data?.items ?? [], (entry) => entry.workDate);

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

        <MonthNavigation
          eyebrow="Riwayat absensi"
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
          aria-label={`Kalender absensi ${monthKey}`}
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
              const date = new Date(month.getFullYear(), month.getMonth(), day);
              const isOutsideMonth = day < 1 || day > daysInMonth;
              const isToday = dateKey(date) === dateKey(today);
              const entries = attendance.get(dateKey(date)) ?? [];
              let cellClassName =
                'min-h-24 border-e border-b border-border bg-background p-1.5';
              if (isOutsideMonth) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-muted/70';
              } else if (entries.length > 0) {
                cellClassName =
                  'min-h-24 border-e border-b border-border bg-card p-1.5';
              }

              return (
                <div className={cellClassName} key={dateKey(date)}>
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
                      <div className="mt-2 space-y-1 text-[10px] leading-3">
                        {entries.map((entry) => (
                          <Link
                            className="flex gap-1 underline"
                            href={`/employee/attendance/${entry.id}`}
                            key={entry.id}
                          >
                            <span className="text-muted-foreground">
                              {entry.clockType === 'CLOCK_IN' ? 'In' : 'Out'}
                            </span>
                            <time className="text-foreground/80">
                              {timeFormatter.format(
                                new Date(
                                  entry.occurredAt ??
                                    entry.claimedAt ??
                                    entry.submittedAt,
                                ),
                              )}
                            </time>
                          </Link>
                        ))}
                      </div>
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
}
