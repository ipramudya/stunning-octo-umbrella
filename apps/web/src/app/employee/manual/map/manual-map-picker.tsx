'use client';

import { ArrowLeft01Icon, Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Map, MapControls } from '@/components/ui/map';
import { cn } from '@/lib/utils';

type ClockType = 'clock-in' | 'clock-out';

interface Coordinate {
  latitude: number;
  longitude: number;
}

const initialCoordinate: Coordinate = {
  latitude: -6.2088,
  longitude: 106.8456,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const locationName = (responseBody: string) => {
  try {
    const value = JSON.parse(responseBody) as unknown;

    if (!isRecord(value) || !Object.hasOwn(value, 'display_name')) {
      return null;
    }

    const { display_name: displayName } = value;
    return typeof displayName === 'string' ? displayName : null;
  } catch {
    return null;
  }
};

export const ManualMapPicker = ({ type }: { type: ClockType }) => {
  const [coordinate, setCoordinate] = React.useState(initialCoordinate);
  const [address, setAddress] = React.useState('Mencari alamat...');

  React.useEffect(() => {
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      const findAddress = async () => {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coordinate.latitude}&lon=${coordinate.longitude}`,
            { signal: controller.signal },
          );

          if (response.ok) {
            const name = locationName(await response.text());

            if (name === null || name.length === 0) {
              setAddress('Alamat tidak tersedia.');
            } else {
              setAddress(name);
            }
          } else {
            setAddress('Alamat tidak tersedia.');
          }
        } catch {
          if (!controller.signal.aborted) {
            setAddress('Alamat tidak tersedia.');
          }
        }
      };

      void findAddress();
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [coordinate]);

  const search = new URLSearchParams({
    address,
    latitude: String(coordinate.latitude),
    longitude: String(coordinate.longitude),
  });

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href={`/employee/manual/${type}`}
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>
        <header className="mt-6">
          <p className="text-sm text-muted-foreground">Pilih lokasi</p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            Geser penanda ke lokasi Anda
          </h1>
        </header>
        <section className="mt-6 overflow-hidden border border-border bg-card">
          <Map
            center={[coordinate.longitude, coordinate.latitude]}
            className="h-96 outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
            onViewportChange={({ center }) => {
              setAddress('Memuat alamat...');
              setCoordinate({ latitude: center[1], longitude: center[0] });
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
        </section>
        <p className="mt-4 line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {address}
        </p>
        <Link
          className="mt-4 block"
          href={`/employee/manual/${type}?${search.toString()}`}
        >
          <Button className="w-full" type="button">
            Gunakan lokasi ini
          </Button>
        </Link>
      </div>
    </CenteredPage>
  );
};
