import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';

import { Button } from './ui/button';

const formatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
});

export function MonthNavigation({
  eyebrow,
  month,
  onNext,
  onPrevious,
}: {
  eyebrow: string;
  month: Date;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <header className="mt-6 flex items-end justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground">{eyebrow}</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
          {formatter.format(month)}
        </h1>
      </div>
      <div className="flex gap-2">
        <Button
          aria-label="Bulan sebelumnya"
          onClick={onPrevious}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} />
        </Button>
        <Button
          aria-label="Bulan berikutnya"
          onClick={onNext}
          size="icon"
          type="button"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden="true" icon={ArrowRight01Icon} />
        </Button>
      </div>
    </header>
  );
}
