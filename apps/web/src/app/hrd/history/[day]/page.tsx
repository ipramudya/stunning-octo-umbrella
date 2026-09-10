import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function HrdAttendanceDayPage({
  params,
}: PageProps<'/hrd/history/[day]'>) {
  const { day } = await params;
  const items =
    (
      {
        '10': [
          'Andi Pratama · Clock out 17.01',
          'Budi Santoso · Clock in 08.10',
        ],
        '4': ['Andi Pratama · Clock in 08.02'],
        '7': ['Rina Kusuma · Menunggu review'],
      } as Record<string, string[]>
    )[day] ?? [];

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/hrd/history"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Riwayat attendance</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Attendance tanggal {day}
          </h1>
        </header>
        <ul className="mt-8 divide-y divide-border border-y border-border text-sm">
          {items.map((item) => (
            <li className="py-4" key={item}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </CenteredPage>
  );
}
