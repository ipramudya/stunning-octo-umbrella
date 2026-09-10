'use client';

import React from 'react';
import useSWR from 'swr';

const locationName = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const displayName = Reflect.get(value, 'display_name');
  return typeof displayName === 'string' ? displayName : undefined;
};

const findAddress = async (url: string) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Address lookup failed');
  }

  return locationName(await response.json());
};

export const ClockLocation = () => {
  const [coordinates, setCoordinates] = React.useState<string>();
  const [locationError, setLocationError] = React.useState(false);
  const { data: address, error } = useSWR(coordinates, findAddress);

  React.useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`,
        );
      },
      () => setLocationError(true),
      { enableHighAccuracy: true },
    );
  }, []);

  let location = 'Mencari alamat...';
  if (locationError) {
    location = 'Lokasi tidak tersedia. Periksa izin lokasi Anda.';
  } else if (error || address === null) {
    location = 'Alamat tidak tersedia.';
  } else if (address) {
    location = address;
  }

  return <p className="mt-3 text-sm text-muted-foreground">{location}</p>;
};
