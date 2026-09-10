'use client';

import React from 'react';

import { Button } from '@/components/ui/button';

const timeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Asia/Jakarta',
});

export function ClockTimeAction({ action }: { action: string }) {
  const [time, setTime] = React.useState(() =>
    timeFormatter.format(new Date()),
  );
  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setTime(timeFormatter.format(new Date()));
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);
  return (
    <Button className="mt-4 h-14 w-full flex-col gap-0.5" type="button">
      <span className="text-xs font-normal">{action}</span>
      <time className="font-heading text-base font-semibold tabular-nums">
        {time}
      </time>
    </Button>
  );
}
