'use client';

import { Camera01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import React from 'react';

export const ClockCamera = () => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = React.useState<string>();
  const streamRef = React.useRef<MediaStream | null>(null);
  const [stream, setStream] = React.useState<MediaStream>();

  React.useEffect(() => {
    let disposed = false;

    const requestCamera = async () => {
      try {
        const activeStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user' },
        });

        if (disposed) {
          for (const track of activeStream.getTracks()) {
            track.stop();
          }
          return;
        }

        streamRef.current = activeStream;
        setStream(activeStream);
      } catch {
        if (!disposed) {
          setCameraError('Kamera tidak tersedia. Periksa izin kamera Anda.');
        }
      }
    };

    void requestCamera();

    return () => {
      disposed = true;
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, []);

  React.useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative grid aspect-video overflow-hidden border border-border bg-muted">
      <video
        autoPlay
        className="size-full -scale-x-100 object-cover"
        muted
        playsInline
        ref={videoRef}
      />
      {cameraError && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
          {cameraError}
        </p>
      )}
      {!cameraError && !stream && (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <HugeiconsIcon
            aria-hidden="true"
            className="size-8"
            icon={Camera01Icon}
          />
        </div>
      )}
    </div>
  );
};
