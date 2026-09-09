'use client';

import { ArrowLeft01Icon, MapPinIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ClockType = 'clock-in' | 'clock-out';

export const ManualAttendanceForm = ({ type }: { type: ClockType }) => {
  const searchParams = useSearchParams();
  const action = type === 'clock-in' ? 'Clock in' : 'Clock out';
  const address = searchParams.get('address') ?? '';
  const latitude = searchParams.get('latitude') ?? '';
  const longitude = searchParams.get('longitude') ?? '';

  return (
    <CenteredPage>
      <div>
        <Link
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
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

        <form className="mt-8 space-y-5">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="work-date">
              Tanggal kerja
            </label>
            <DatePicker id="work-date" name="workDate" required />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="claimed-at">
              Jam kerja
            </label>
            <Input id="claimed-at" name="claimedAt" required type="time" />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Lokasi</span>
            {address ? (
              <p className="border border-border bg-muted px-3 py-2 text-sm">
                {address}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Pilih titik lokasi pada peta.
              </p>
            )}
            <input name="address" type="hidden" value={address} />
            <input name="latitude" type="hidden" value={latitude} />
            <input name="longitude" type="hidden" value={longitude} />
            <Link
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
              href={`/employee/manual/map?type=${type}`}
            >
              <HugeiconsIcon aria-hidden="true" icon={MapPinIcon} />
              Buka peta
            </Link>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="reason">
              Alasan
            </label>
            <textarea
              className="min-h-24 w-full border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
              id="reason"
              maxLength={1000}
              name="reason"
              placeholder="Contoh: Lupa melakukan clock in karena kendala jaringan."
              required
            />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Bukti foto</span>
            <FileUpload />
          </div>
          <Button className="w-full" type="submit">
            Kirim pengajuan
          </Button>
        </form>
      </div>
    </CenteredPage>
  );
};
