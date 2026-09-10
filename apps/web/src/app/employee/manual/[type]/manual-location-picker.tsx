'use client';

import { Location01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import React from 'react';
import { z } from 'zod';

import { Map, MapControls } from '@/components/ui/map';

const locationSchema = z.object({ display_name: z.string().optional() });
const initialCoordinate = {
  latitude: -6.2088,
  longitude: 106.8456,
};

export function ManualLocationPicker({
  onChange,
}: {
  onChange: (location: {
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
}) {
  const notifyChange = React.useEffectEvent(onChange);
  const [coordinate, setCoordinate] = React.useState(initialCoordinate);
  const [address, setAddress] = React.useState('Mencari alamat...');

  React.useEffect(() => {
    const controller = new AbortController();
    const findAddress = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coordinate.latitude}&lon=${coordinate.longitude}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setAddress('Alamat tidak tersedia.');
          return;
        }

        const result = locationSchema.safeParse(await response.json());
        const nextAddress = result.success
          ? result.data.display_name
          : undefined;

        if (nextAddress === undefined || nextAddress.length === 0) {
          setAddress('Alamat tidak tersedia.');
          return;
        }

        setAddress(nextAddress);
        notifyChange({ ...coordinate, address: nextAddress });
      } catch {
        if (!controller.signal.aborted) {
          setAddress('Alamat tidak tersedia.');
        }
      }
    };
    const timeout = window.setTimeout(() => {
      void findAddress();
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [coordinate]);

  return (
    <div>
      <div className="relative h-72 overflow-hidden border border-border bg-card">
        <Map
          center={[coordinate.longitude, coordinate.latitude]}
          className="h-full"
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
      </div>
      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {address}
      </p>
    </div>
  );
}
