'use client';

import { Calendar01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { format } from 'date-fns';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DatePickerProps {
  id: string;
  name: string;
  required?: boolean;
}

export const DatePicker = ({ id, name, required }: DatePickerProps) => {
  const [date, setDate] = React.useState<Date>();

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            className="w-full justify-start font-normal data-[empty=true]:text-muted-foreground"
            data-empty={!date}
            variant="outline"
          />
        }
      >
        <HugeiconsIcon aria-hidden="true" icon={Calendar01Icon} />
        {date ? format(date, 'd MMMM yyyy') : <span>Pilih tanggal</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar mode="single" onSelect={setDate} selected={date} />
      </PopoverContent>
      <input
        id={id}
        name={name}
        required={required}
        type="hidden"
        value={date ? format(date, 'yyyy-MM-dd') : ''}
      />
    </Popover>
  );
};
