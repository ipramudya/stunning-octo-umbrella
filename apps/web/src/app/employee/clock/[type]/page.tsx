import { notFound } from 'next/navigation';

import { ClockSubmission } from '../../clock-submission';

export default async function ClockSubmissionPage({
  params,
}: PageProps<'/employee/clock/[type]'>) {
  const { type } = await params;

  if (type !== 'clock-in' && type !== 'clock-out') {
    notFound();
  }

  return <ClockSubmission type={type} />;
}
