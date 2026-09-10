'use client';

import {
  Add01Icon,
  Cancel01Icon,
  File01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  accept?: string;
  className?: string;
  onChange?: (file: File | null) => void;
}

export function FileUpload({
  accept = 'image/jpeg,image/png',
  className,
  onChange,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const selectFile = (nextFile: File | null) => {
    setFile(nextFile);
    onChange?.(nextFile);
  };
  return (
    <div
      className={cn(
        'flex items-center gap-3 border border-dashed border-muted-foreground/25 p-3',
        className,
      )}
    >
      <input
        accept={accept}
        aria-label="Unggah foto"
        className="sr-only"
        onChange={(event) => {
          selectFile(event.target.files?.[0] ?? null);
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        onClick={() => {
          inputRef.current?.click();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon aria-hidden="true" icon={Add01Icon} />
        Pilih foto
      </Button>
      {file ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <HugeiconsIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
            icon={File01Icon}
          />
          <span className="truncate">{file.name}</span>
          <Button
            aria-label="Hapus foto"
            className="ms-auto"
            onClick={() => {
              selectFile(null);
              if (inputRef.current) {
                inputRef.current.value = '';
              }
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          JPEG atau PNG, maksimal 5 MB.
        </p>
      )}
    </div>
  );
}
