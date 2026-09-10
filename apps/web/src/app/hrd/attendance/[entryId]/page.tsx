'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { z } from 'zod';

import { EvidenceViewer } from '@/components/evidence-viewer';
import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { api, mutateApi } from '@/lib/api';
import { attendanceEntrySchema } from '@/lib/contracts';
import type { AttendanceEntry } from '@/lib/contracts';
import { formatDateTime } from '@/lib/date-format';
import { cn } from '@/lib/utils';

export default function AttendanceDetailPage() {
  const rejectSchema = z.object({
    reason: z.string().trim().min(1, 'Alasan penolakan wajib diisi.').max(500),
  });
  const requestId = crypto.randomUUID();
  const requestKeys = {
    approve: `${requestId}-approve`,
    reject: `${requestId}-reject`,
  };
  const { entryId } = useParams<{ entryId: string }>();
  const key = `/hrd/attendance/${entryId}`;
  const {
    data: entry,
    error: loadError,
    isLoading,
  } = useSWR<AttendanceEntry, Error>(
    key,
    async (path: string) => await api(path, attendanceEntrySchema),
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<z.infer<typeof rejectSchema>>({
    resolver: zodResolver(rejectSchema),
  });

  const decide = async (decision: 'approve' | 'reject', reason?: string) => {
    try {
      await mutateApi(
        `/hrd/attendance/manual/${entryId}/${decision}`,
        attendanceEntrySchema,
        {
          body: decision === 'reject' ? JSON.stringify({ reason }) : undefined,
          headers: { 'Idempotency-Key': requestKeys[decision] },
          method: 'POST',
        },
        ['/hrd/attendance'],
      );
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error ? error.message : 'Keputusan gagal disimpan.',
      });
    }
  };
  const reject = handleSubmit(async ({ reason }) => {
    await decide('reject', reason);
  });
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

  const attendanceTime = [
    entry.occurredAt,
    entry.claimedAt,
    entry.submittedAt,
  ].find((value): value is string => Boolean(value));
  const isPendingManual = entry.status === 'PENDING_REVIEW';

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
          <p className="text-sm text-muted-foreground">
            {entry.source === 'MANUAL' ? 'Pengajuan manual' : 'Attendance'}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {entry.employee?.fullName ?? entry.employeeId}
          </h1>
        </header>

        <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Tipe clock</dt>
            <dd>{entry.clockType === 'CLOCK_IN' ? 'Clock in' : 'Clock out'}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Waktu kerja</dt>
            <dd>{formatDateTime(attendanceTime ?? entry.submittedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Lokasi</dt>
            <dd className="text-end">
              {entry.location?.address ?? 'Koordinat perangkat'}
            </dd>
          </div>
          {(entry.reason?.length ?? 0) > 0 && (
            <div className="py-3">
              <dt className="text-muted-foreground">Alasan</dt>
              <dd className="mt-1">{entry.reason}</dd>
            </div>
          )}
        </dl>

        <EvidenceViewer
          accessPath={`/hrd/attendance/${entryId}/evidence/access`}
          evidenceId={entry.evidenceId}
        />

        {isPendingManual && (
          <form
            className="mt-8"
            onSubmit={(event) => {
              void reject(event);
            }}
          >
            <label className="text-sm font-medium" htmlFor="reason">
              Alasan penolakan
            </label>
            <textarea
              {...register('reason')}
              className="mt-2 min-h-20 w-full border border-input bg-transparent px-3 py-2 text-sm"
              id="reason"
            />
            <p className="mt-1 text-xs text-destructive">
              {errors.reason?.message}
            </p>
            <p aria-live="polite" className="mt-2 text-sm text-destructive">
              {errors.root?.message}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button disabled={isSubmitting} type="submit" variant="outline">
                Tolak
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={() => {
                  void decide('approve');
                }}
                type="button"
              >
                Terima
              </Button>
            </div>
          </form>
        )}
      </div>
    </CenteredPage>
  );
}
