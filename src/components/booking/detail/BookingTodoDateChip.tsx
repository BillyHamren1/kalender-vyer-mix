/**
 * BookingTodoDateChip
 * --------------------------------------------------------------------------
 * Inline datum-chip för en to-do-rad. Popover med shadcn Calendar +
 * snabbval för bokningens rigg/event/nedrivnings-dagar.
 */
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface DateQuickPick {
  label: string;
  date: string; // yyyy-MM-dd
}

interface Props {
  value: string | null;
  quickPicks?: DateQuickPick[];
  disabled?: boolean;
  onChange: (date: string) => void;
}

const BookingTodoDateChip = ({ value, quickPicks = [], disabled, onChange }: Props) => {
  const [open, setOpen] = useState(false);

  const selected = value ? parseISO(value) : undefined;
  const label = value ? format(parseISO(value), 'd MMM', { locale: sv }) : 'Sätt datum';

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            'h-7 gap-1 px-2 text-[11px]',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {quickPicks.length > 0 && (
          <div className="flex flex-col gap-1 border-b border-border/40 p-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Snabbval
            </span>
            <div className="flex flex-wrap gap-1">
              {quickPicks.map((q) => (
                <Button
                  key={`${q.label}-${q.date}`}
                  variant={value === q.date ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => pick(q.date)}
                >
                  {q.label} · {format(parseISO(q.date), 'd MMM', { locale: sv })}
                </Button>
              ))}
            </div>
          </div>
        )}
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => d && pick(format(d, 'yyyy-MM-dd'))}
          initialFocus
          locale={sv}
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
};

export default BookingTodoDateChip;
