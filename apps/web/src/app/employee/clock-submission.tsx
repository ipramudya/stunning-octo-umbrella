'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';

import { CenteredPage } from '@/components/layout/centered-page';
import { Button } from '@/components/ui/button';

import { ClockCamera } from './clock-camera';
import { ClockLocation } from './clock-location';
import { ClockTimeAction } from './clock-time-action';

type ClockType = 'clock-in' | 'clock-out';

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  year: 'numeric',
});

export const ClockSubmission = ({ type }: { type: ClockType }) => {
  const action = type === 'clock-in' ? 'Clock in' : 'Clock out';

  return (
    <CenteredPage>
      <div>
        <Link
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          href="/employee"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>

        <header className="mt-6">
          <p className="text-sm text-muted-foreground">
            {dateFormatter.format(new Date())}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {action}
          </h1>
          <ClockLocation />
        </header>

        <section aria-labelledby="camera-title" className="mt-6">
          <h2 className="sr-only" id="camera-title">
            Kamera
          </h2>
          <ClockCamera />
          <ClockTimeAction action={action} />
        </section>

        <Button className="mt-4 w-full" type="button" variant="outline">
          Ajukan {action.toLowerCase()} manual
        </Button>
      </div>
    </CenteredPage>
  );
};
