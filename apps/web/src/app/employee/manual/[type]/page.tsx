import { notFound } from 'next/navigation';

import { ManualAttendanceForm } from '../../manual-attendance-form';

export default async function ManualAttendancePage({
  params,
}: PageProps<'/employee/manual/[type]'>) {
  const { type } = await params;

  if (type !== 'clock-in' && type !== 'clock-out') {
    notFound();
  }

  return <ManualAttendanceForm type={type} />;
}
