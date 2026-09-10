'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mutateApi } from '@/lib/api';
import { createEmployeeSchema, profileSchema } from '@/lib/contracts';
import type { CreateEmployeeValues } from '@/lib/contracts';
import { cn } from '@/lib/utils';

export default function NewEmployeePage() {
  const router = useRouter();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<CreateEmployeeValues>({
    resolver: zodResolver(createEmployeeSchema),
  });
  const submit = handleSubmit(async (values) => {
    try {
      await mutateApi(
        '/hrd/employees',
        profileSchema,
        { body: JSON.stringify(values), method: 'POST' },
        ['/hrd/employees'],
      );
      router.push('/hrd/employees');
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error ? error.message : 'Employee gagal dibuat.',
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
          href="/hrd/employees"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Administrasi HRD</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Tambah employee
          </h1>
        </header>

        <form
          className="mt-8 space-y-4"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="employeeNumber">
              Nomor employee
            </label>
            <Input
              {...register('employeeNumber')}
              autoComplete="off"
              id="employeeNumber"
              placeholder="Contoh: DEXA-001"
            />
            <p className="text-xs text-destructive">
              {errors.employeeNumber?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="fullName">
              Nama lengkap
            </label>
            <Input
              {...register('fullName')}
              autoComplete="name"
              id="fullName"
              placeholder="Masukkan nama lengkap"
            />
            <p className="text-xs text-destructive">
              {errors.fullName?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="phoneNumber">
              Nomor telepon
            </label>
            <Input
              {...register('phoneNumber')}
              autoComplete="tel"
              id="phoneNumber"
              placeholder="Contoh: +628123456789"
              type="tel"
            />
            <p className="text-xs text-destructive">
              {errors.phoneNumber?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              {...register('email')}
              autoComplete="email"
              id="email"
              placeholder="nama@perusahaan.com"
              type="email"
            />
            <p className="text-xs text-destructive">{errors.email?.message}</p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="password">
              Kata sandi awal
            </label>
            <Input
              {...register('password')}
              autoComplete="new-password"
              id="password"
              placeholder="Masukkan kata sandi awal"
              type="password"
            />
            <p className="text-xs text-destructive">
              {errors.password?.message}
            </p>
          </div>
          <p aria-live="polite" className="text-sm text-destructive">
            {errors.root?.message}
          </p>
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Menyimpan...' : 'Tambah employee'}
          </Button>
        </form>
      </div>
    </CenteredPage>
  );
}
