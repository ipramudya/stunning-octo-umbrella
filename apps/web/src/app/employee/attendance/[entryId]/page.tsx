'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

import { EvidenceViewer } from '@/components/evidence-viewer';
import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { attendanceEntrySchema } from '@/lib/contracts';
import type { AttendanceEntry } from '@/lib/contracts';
import { formatDateTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

export default function EmployeeAttendanceDetailPage() {
  const { entryId } = useParams<{ entryId: string }>();
  const {
    data: entry,
    error: loadError,
    isLoading,
  } = useSWR<AttendanceEntry, Error>(
    `/me/attendance/${entryId}`,
    async (path: string) => await api(path, attendanceEntrySchema),
  );
  if (isLoading) {
    return <main aria-busy="true">Memuat attendance...</main>;
  }

  if (loadError !== undefined || entry === undefined) {
    return (
      <main className="text-destructive">
        {loadError?.message ?? 'Attendance tidak ditemukan.'}
      </main>
    );
  }

  const decisionReason = entry.decision?.reason;

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/employee/history"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">
            {entry.source === 'MANUAL' ? 'Absensi manual' : 'Absensi regular'}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {entry.clockType === 'CLOCK_IN' ? 'Clock in' : 'Clock out'}
          </h1>
        </header>
        <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Waktu</dt>
            <dd>
              {formatDateTime(
                entry.occurredAt ?? entry.claimedAt ?? entry.submittedAt,
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Status</dt>
            <dd>{entry.status}</dd>
          </div>
          {(entry.reason?.length ?? 0) > 0 && (
            <div className="py-3">
              <dt className="text-muted-foreground">Alasan</dt>
              <dd className="mt-1">{entry.reason}</dd>
            </div>
          )}
          {(decisionReason?.length ?? 0) > 0 && (
            <div className="py-3">
              <dt className="text-muted-foreground">Alasan keputusan</dt>
              <dd className="mt-1">{decisionReason}</dd>
            </div>
          )}
        </dl>
        <EvidenceViewer
          accessPath={`/evidence/${entry.evidenceId ?? ''}/access`}
          evidenceId={entry.evidenceId}
        />
      </div>
    </CenteredPage>
  );
}
