'use client';

import { ArrowLeft01Icon, Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import React from 'react';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Map, MapControls } from '@/components/ui/map';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export default function CoveragePage() {
  const [coordinate, setCoordinate] = React.useState({
    latitude: -6.2806863,
    longitude: 106.7264211,
  });
  const [active, setActive] = React.useState(true);

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

        <form className="mt-8 space-y-5">
          <section aria-labelledby="coverage-map-title">
            <h2 id="coverage-map-title" className="text-sm font-medium">
              Titik pusat area
            </h2>
            <div
              className="relative mt-2 overflow-hidden border border-border bg-card"
              style={{ height: 288 }}
            >
              <Map
                center={[coordinate.longitude, coordinate.latitude]}
                className="h-full"
                onViewportChange={({ center }) => {
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
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Geser peta untuk menentukan titik pusat coverage.
            </p>
            <input name="latitude" type="hidden" value={coordinate.latitude} />
            <input
              name="longitude"
              type="hidden"
              value={coordinate.longitude}
            />
          </section>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-name">
              Nama area
            </label>
            <Input
              id="coverage-name"
              name="name"
              placeholder="Contoh: Kantor pusat"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-address">
              Alamat
            </label>
            <Input
              id="coverage-address"
              name="address"
              placeholder="Masukkan alamat area"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="coverage-radius">
              Radius (meter)
            </label>
            <Input
              id="coverage-radius"
              max="5000"
              min="50"
              name="radiusMeters"
              placeholder="Contoh: 500"
              required
              type="number"
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium">
            <Switch
              checked={active}
              name="active"
              onCheckedChange={setActive}
            />
            Aktifkan area coverage
          </label>
          <Button className="w-full" type="submit">
            Simpan coverage area
          </Button>
        </form>
      </div>
    </CenteredPage>
  );
}
