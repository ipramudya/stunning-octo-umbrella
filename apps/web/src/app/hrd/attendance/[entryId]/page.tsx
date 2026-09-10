import { ArrowLeft01Icon, Camera01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function AttendanceDetailPage({
  params,
}: PageProps<'/hrd/attendance/[entryId]'>) {
  const { entryId } = await params;
  const isManual = entryId.startsWith('manual-');
  const employee = isManual ? 'Rina Kusuma' : 'Andi Pratama';

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
            {isManual ? 'Pengajuan manual' : 'Attendance'}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {employee}
          </h1>
        </header>

        <dl className="mt-8 divide-y divide-border border-y border-border text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Tipe clock</dt>
            <dd>Clock in</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Waktu kerja</dt>
            <dd>08.05 WIB</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Lokasi</dt>
            <dd className="text-end">Jakarta Selatan</dd>
          </div>
          {isManual && (
            <div className="py-3">
              <dt className="text-muted-foreground">Alasan</dt>
              <dd className="mt-1">Kendala jaringan saat clock in.</dd>
            </div>
          )}
        </dl>

        <section aria-labelledby="evidence-title" className="mt-8">
          <h2 id="evidence-title" className="text-sm font-semibold">
            Bukti foto
          </h2>
          <div className="mt-3 grid aspect-video place-items-center border border-border bg-muted text-sm text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <HugeiconsIcon
                aria-hidden="true"
                className="size-6"
                icon={Camera01Icon}
              />
              Bukti foto akan ditampilkan di sini
            </div>
          </div>
        </section>

        {isManual && (
          <div className="mt-8 grid grid-cols-2 gap-3">
            <Button type="button" variant="outline">
              Tolak
            </Button>
            <Button type="button">Terima</Button>
          </div>
        )}
      </div>
    </CenteredPage>
  );
}
