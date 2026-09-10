'use client';

import { Camera01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import React from 'react';

import { api } from '@/lib/api';
import { evidenceAccessSchema } from '@/lib/contracts';

import { Button } from './ui/button';

export function EvidenceViewer({
  accessPath,
  evidenceId,
}: {
  accessPath: string;
  evidenceId: string | null;
}) {
  const [url, setUrl] = React.useState<string>();
  const [viewerError, setViewerError] = React.useState<string>();
  const show = async () => {
    try {
      const access = await api(accessPath, evidenceAccessSchema, {
        method: 'POST',
      });
      setUrl(access.url);
    } catch (error) {
      setViewerError(
        error instanceof Error ? error.message : 'Bukti tidak dapat dibuka.',
      );
    }
  };

  return (
    <section aria-labelledby="evidence-title" className="mt-8">
      <h2 className="text-sm font-semibold" id="evidence-title">
        Bukti foto
      </h2>
      {url === undefined ? (
        <Button
          className="mt-3 aspect-video h-auto w-full flex-col"
          disabled={evidenceId === null}
          onClick={() => {
            void show();
          }}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden="true" icon={Camera01Icon} />
          {evidenceId === null
            ? 'Tidak ada bukti foto'
            : 'Tampilkan bukti foto'}
        </Button>
      ) : (
        <Image
          alt="Bukti attendance"
          className="mt-3 aspect-video w-full border border-border object-contain"
          height={720}
          src={url}
          unoptimized
          width={1280}
        />
      )}
      <p aria-live="polite" className="mt-2 text-sm text-destructive">
        {viewerError}
      </p>
    </section>
  );
}
