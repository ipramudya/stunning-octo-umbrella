'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft01Icon, Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { z } from 'zod';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Map, MapControls } from '@/components/ui/map';
import { Switch } from '@/components/ui/switch';
import { api, mutateApi } from '@/lib/api';
import { attendanceZoneSchema } from '@/lib/contracts';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  active: z.boolean(),
  address: z.string().trim().min(1, 'Alamat wajib diisi.').max(500),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().trim().min(1, 'Nama area wajib diisi.').max(120),
  radiusMeters: z.number().min(50).max(5000),
});

type FormValues = z.infer<typeof formSchema>;

export default function CoveragePage() {
  const { data } = useSWR('/attendance-zone', async (path: string) =>
    api(path, attendanceZoneSchema),
  );
  const {
    formState: { errors, isSubmitting, isSubmitSuccessful },
    handleSubmit,
    register,
    reset,
    setError,
    setValue,
    watch,
  } = useForm<FormValues>({
    defaultValues: {
      active: true,
      latitude: -6.2806863,
      longitude: 106.7264211,
    },
    resolver: zodResolver(formSchema),
  });
  React.useEffect(() => {
    if (data) {
      reset(data);
    }
  }, [data, reset]);
  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const active = watch('active');
  const submit = handleSubmit(async (values) => {
    try {
      await mutateApi(
        '/hrd/attendance-zone',
        attendanceZoneSchema,
        { body: JSON.stringify(values), method: 'PATCH' },
        ['/attendance-zone'],
      );
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error ? error.message : 'Coverage gagal disimpan.',
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
          href="/hrd"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Attendance regular</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Set coverage area
          </h1>
        </header>

        <form
          className="mt-8 space-y-5"
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <section aria-labelledby="coverage-map-title">
            <h2 className="text-sm font-medium" id="coverage-map-title">
              Titik pusat area
            </h2>
            <div
              className="relative mt-2 h-72 overflow-hidden border border-border bg-card"
            >
              <Map
                center={[longitude, latitude]}
                className="h-full"
                onViewportChange={({ center }) => {
                  setValue('latitude', center[1], { shouldDirty: true });
                  setValue('longitude', center[0], { shouldDirty: true });
                }}
                styles={{
                  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                  light:
                    'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
                }}
                zoom={14}
              >
                <MapControls
                  className="[&_button]:rounded-none [&>div]:rounded-none"
                  showLocate
                />
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-10 -translate-y-full text-primary-foreground drop-shadow-[0_1px_2px_oklch(0_0_0_/_0.5)]"
                    icon={Location01Icon}
                    strokeWidth={2}
                  />
                </div>
              </Map>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Geser peta untuk menentukan titik pusat coverage.
            </p>
          </section>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-name">
              Nama area
            </label>
            <Input
              {...register('name')}
              id="coverage-name"
              placeholder="Contoh: Kantor pusat"
            />
            <p className="text-xs text-destructive">{errors.name?.message}</p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-address">
              Alamat
            </label>
            <Input
              {...register('address')}
              id="coverage-address"
              placeholder="Masukkan alamat area"
            />
            <p className="text-xs text-destructive">
              {errors.address?.message}
            </p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-radius">
              Radius (meter)
            </label>
            <Input
              {...register('radiusMeters', { valueAsNumber: true })}
              id="coverage-radius"
              max="5000"
              min="50"
              placeholder="Contoh: 500"
              type="number"
            />
            <p className="text-xs text-destructive">
              {errors.radiusMeters?.message}
            </p>
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch
              checked={active}
              onCheckedChange={(checked) => {
                setValue('active', checked, { shouldDirty: true });
              }}
            />
            Aktifkan area coverage
          </label>
          <p aria-live="polite" className="text-sm text-destructive">
            {errors.root?.message}
          </p>
          {isSubmitSuccessful && !errors.root && (
            <p className="text-sm text-muted-foreground">Coverage tersimpan.</p>
          )}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Menyimpan...' : 'Simpan coverage area'}
          </Button>
        </form>
      </div>
    </CenteredPage>
  );
}
