import { notFound } from 'next/navigation';

import { ManualMapPicker } from './manual-map-picker';

export default async function ManualMapPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;

  if (type !== 'clock-in' && type !== 'clock-out') {
    notFound();
  }

  return <ManualMapPicker type={type} />;
}
