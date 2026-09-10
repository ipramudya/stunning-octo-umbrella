'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';
import { profileSchema } from '@/lib/contracts';
import type { Profile } from '@/lib/contracts';
import { cn } from '@/lib/utils';

import { EmployeeForms } from './employee-forms';

export default function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const key = `/hrd/employees/${employeeId}`;
  const {
    data: employee,
    error,
    isLoading,
  } = useSWR<Profile, Error>(
    key,
    async (path: string) => await api(path, profileSchema),
  );

  if (isLoading) {
    return <main aria-busy="true">Memuat employee...</main>;
  }

  if (error !== undefined || employee === undefined) {
    return (
      <main className="text-destructive">
        {error?.message ?? 'Employee tidak ditemukan.'}
      </main>
    );
  }

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/hrd/employees"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">
            {employee.employeeNumber}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {employee.fullName}
          </h1>
        </header>
        <EmployeeForms employee={employee} />
      </div>
    </CenteredPage>
  );
}
