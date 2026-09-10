'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import useSWR from 'swr';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiPages } from '@/lib/api';
import { employeeListSchema } from '@/lib/contracts';
import type { Profile } from '@/lib/contracts';
import { cn } from '@/lib/utils';

export default function EmployeesPage() {
  const [query, setQuery] = React.useState('');
  const key = `/hrd/employees?limit=100&q=${encodeURIComponent(query)}`;
  const {
    data,
    error: loadError,
    isLoading,
  } = useSWR<Profile[], Error>(
    key,
    async (path: string) => await apiPages(path, employeeListSchema),
  );

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
        <header className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Administrasi HRD</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
              Employee
            </h1>
          </div>
          <Link className={buttonVariants()} href="/hrd/employees/new">
            Tambah employee
          </Link>
        </header>

        <section aria-labelledby="employee-list-title" className="mt-8">
          <h2 className="text-sm font-semibold" id="employee-list-title">
            Daftar employee
          </h2>
          <Input
            aria-label="Cari employee"
            className="mt-3"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Cari nama atau nomor employee"
            type="search"
            value={query}
          />
          {loadError !== undefined && (
            <p className="mt-3 text-sm text-destructive">{loadError.message}</p>
          )}
          <ul
            aria-busy={isLoading}
            className="mt-3 divide-y divide-border border-y border-border"
          >
            {data?.map((employee) => (
              <li className="py-3" key={employee.id}>
                <Link
                  className="flex justify-between gap-4 text-sm underline"
                  href={`/hrd/employees/${employee.id}`}
                >
                  <span>{employee.fullName}</span>
                  <span className="text-muted-foreground">
                    {employee.employeeNumber}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </CenteredPage>
  );
}
