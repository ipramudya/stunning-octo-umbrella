'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { mutateApi, uploadEvidence } from '@/lib/api';
import { attendanceEntrySchema } from '@/lib/contracts';
import { cn } from '@/lib/utils';

import { ManualLocationPicker } from './manual-location-picker';

type ClockType = 'clock-in' | 'clock-out';

const formSchema = z.object({
  claimedAt: z.string().min(1, 'Pilih jam kerja.'),
  reason: z.string().trim().min(1, 'Alasan wajib diisi.').max(1000),
  workDate: z.iso.date('Pilih tanggal kerja.'),
});

type FormValues = z.infer<typeof formSchema>;

export function ManualAttendanceForm({ type }: { type: ClockType }) {
  const router = useRouter();
  const requestKey = React.useId();
  const [file, setFile] = React.useState<File | null>(null);
  const [showMap, setShowMap] = React.useState(false);
  const [location, setLocation] = React.useState<{
    address: string;
    latitude: number;
    longitude: number;
  }>();
  const action = type === 'clock-in' ? 'Clock in' : 'Clock out';
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });
  const submit = handleSubmit(async (values) => {
    if (location === undefined) {
      setError('root', { message: 'Pilih lokasi terlebih dahulu.' });
      return;
    }

    if (!file) {
      setError('root', { message: 'Bukti foto wajib dipilih.' });
      return;
    }

    try {
      const evidenceUploadId = await uploadEvidence(file);
      const month = values.workDate.slice(0, 7);

      await mutateApi(
        '/me/attendance/manual',
        attendanceEntrySchema,
        {
          body: JSON.stringify({
            address: location.address,
            claimedAt: `${values.workDate}T${values.claimedAt}:00+07:00`,
            clockType: type === 'clock-in' ? 'CLOCK_IN' : 'CLOCK_OUT',
            evidenceUploadId,
            latitude: location.latitude,
            longitude: location.longitude,
            reason: values.reason,
            workDate: values.workDate,
          }),
          headers: { 'Idempotency-Key': requestKey },
          method: 'POST',
        },
        [`/me/attendance?month=${month}`],
      );
      router.replace('/employee/history');
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error
            ? error.message
            : 'Pengajuan tidak dapat dikirim.',
      });
    }
  });

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href={`/employee/clock/${type}`}
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>

        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Absensi manual</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {action}
          </h1>
        </header>

        <form
          className="mt-8 space-y-5"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="workDate">
              Tanggal kerja
            </label>
            <Input {...register('workDate')} id="workDate" type="date" />
            <p className="text-xs text-destructive">
              {errors.workDate?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="claimedAt">
              Jam kerja
            </label>
            <Input {...register('claimedAt')} id="claimedAt" type="time" />
            <p className="text-xs text-destructive">
              {errors.claimedAt?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Lokasi</span>
            <p className="border border-border bg-muted px-3 py-2 text-sm">
              {location?.address ?? 'Pilih titik lokasi pada peta.'}
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setShowMap((visible) => !visible);
              }}
              type="button"
              variant="outline"
            >
              {showMap ? 'Tutup peta' : 'Buka peta'}
            </Button>
            {showMap && <ManualLocationPicker onChange={setLocation} />}
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="reason">
              Alasan
            </label>
            <textarea
              {...register('reason')}
              className="min-h-24 w-full border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              id="reason"
              placeholder="Contoh: Lupa melakukan clock in karena kendala jaringan."
            />
            <p className="text-xs text-destructive">{errors.reason?.message}</p>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Bukti foto</span>
            <FileUpload onChange={setFile} />
          </div>
          <p aria-live="polite" className="text-sm text-destructive">
            {errors.root?.message}
          </p>
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Mengirim...' : 'Kirim pengajuan'}
          </Button>
        </form>
      </div>
    </CenteredPage>
  );
}
