'use client';

import React from 'react';

const locationName = (value: unknown) => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const displayName = Reflect.get(value, 'display_name');
  return typeof displayName === 'string' ? displayName : undefined;
};

export const ClockLocation = () => {
  const [location, setLocation] = React.useState('Mencari alamat...');

  React.useEffect(() => {
    let disposed = false;

    const findAddress = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
        );
        const address = locationName(await response.json());

        if (!disposed) {
          setLocation(address ?? 'Alamat tidak tersedia.');
        }
      } catch {
        if (!disposed) {
          setLocation('Alamat tidak tersedia.');
        }
      }
    };

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void findAddress(coords.latitude, coords.longitude);
      },
      () => {
        if (!disposed) {
          setLocation('Lokasi tidak tersedia. Periksa izin lokasi Anda.');
        }
      },
      { enableHighAccuracy: true },
    );

    return () => {
      disposed = true;
    };
  }, []);

  return <p className="mt-3 text-sm text-muted-foreground">{location}</p>;
};
