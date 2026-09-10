'use client';

import React from 'react';
import useSWR from 'swr';
import { z } from 'zod';

const locationSchema = z.object({ display_name: z.string().optional() });

const findAddress = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Address lookup failed');
  }

  return locationSchema.parse(await response.json()).display_name;
};

export function ClockLocation() {
  const [coordinates, setCoordinates] = React.useState<string>();
  const [locationError, setLocationError] = React.useState(false);
  const {
    data: address,
    error,
    isLoading,
  } = useSWR<string | undefined, Error>(coordinates ?? null, findAddress);
  React.useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
        );
      },
      () => {
        setLocationError(true);
      },
      { enableHighAccuracy: true },
    );
  }, []);
  let location = 'Mencari alamat...';
  if (locationError) {
    location = 'Lokasi tidak tersedia. Periksa izin lokasi Anda.';
  } else if (
    error !== undefined ||
    (!isLoading && coordinates !== undefined && address === undefined)
  ) {
    location = 'Alamat tidak tersedia.';
  } else if (address !== undefined && address !== '') {
    location = address;
  }
  return <p className="mt-3 text-sm text-muted-foreground">{location}</p>;
}
