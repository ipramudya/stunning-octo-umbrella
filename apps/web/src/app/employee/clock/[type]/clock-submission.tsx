'use client';

import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';

import { CenteredPage } from '@/components/layout/centered-page';
import { buttonVariants } from '@/components/ui/button';
import { mutateApi, uploadEvidence } from '@/lib/api';
import { attendanceEntrySchema } from '@/lib/contracts';
import { cn } from '@/lib/utils';

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

async function cameraFile(stream: MediaStream) {
  const [track] = stream.getVideoTracks();
  const settings = track?.getSettings();
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  const canvas = new OffscreenCanvas(
    settings?.width ?? video.videoWidth,
    settings?.height ?? video.videoHeight,
  );
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ quality: 0.9, type: 'image/jpeg' });

  return new File([blob], 'attendance.jpg', { type: 'image/jpeg' });
}

export function ClockSubmission({ type }: { type: ClockType }) {
  const router = useRouter();
  const requestKey = crypto.randomUUID();
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [location, setLocation] = React.useState<GeolocationCoordinates | null>(
    null,
  );
  const [submissionError, setSubmissionError] = React.useState<string>();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const action = type === 'clock-in' ? 'Clock in' : 'Clock out';
  const setCameraStream = (value: MediaStream | null) => {
    setStream(value);
  };
  const setCurrentLocation = (value: GeolocationCoordinates | null) => {
    setLocation(value);
  };

  const submit = async () => {
    if (!stream || !location) {
      return;
    }

    setSubmissionError(undefined);
    setIsSubmitting(true);

    try {
      const evidenceUploadId = await uploadEvidence(await cameraFile(stream));
      const month = new Date().toLocaleDateString('en-CA', {
        month: '2-digit',
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
      });

      await mutateApi(
        '/me/attendance/regular',
        attendanceEntrySchema,
        {
          body: JSON.stringify({
            accuracyMeters: location.accuracy,
            clockType: type === 'clock-in' ? 'CLOCK_IN' : 'CLOCK_OUT',
            evidenceUploadId,
            latitude: location.latitude,
            longitude: location.longitude,
          }),
          headers: { 'Idempotency-Key': requestKey },
          method: 'POST',
        },
        [`/me/attendance?month=${month}`],
      );
      router.replace('/employee');
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : 'Absensi gagal dikirim.',
      );
    }

    setIsSubmitting(false);
  };

  return (
    <CenteredPage>
      <div>
        <Link
          className={cn(
            buttonVariants({ variant: 'secondary' }),
            'min-h-10 [&_svg]:size-5',
          )}
          href="/employee"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
          Kembali
        </Link>

        <header className="mt-6">
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {dateFormatter.format(new Date())}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
            {action}
          </h1>
          <ClockLocation onLocation={setCurrentLocation} />
        </header>

        <section aria-labelledby="camera-title" className="mt-6">
          <h2 className="sr-only" id="camera-title">
            Kamera
          </h2>
          <ClockCamera onStream={setCameraStream} />
          <p aria-live="polite" className="mt-3 text-sm text-destructive">
            {submissionError}
          </p>
          <ClockTimeAction
            action={isSubmitting ? 'Mengirim...' : action}
            disabled={!stream || !location || isSubmitting}
            onClick={() => {
              void submit();
            }}
          />
        </section>

        <Link
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-4 w-full')}
          href={`/employee/manual/${type}`}
        >
          Ajukan {action.toLowerCase()} manual
        </Link>
      </div>
    </CenteredPage>
  );
}
