/**
 * BookingTodoTimeChip
 * --------------------------------------------------------------------------
 * Inline tid-chip för en to-do-rad. Popover med start- och slut-tid +
 * "Rensa"-knapp.
 */
import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const toHM = (v: string | null) => (v ? v.slice(0, 5) : '');

interface Props {
  start: string | null;
  end: string | null;
  disabled?: boolean;
  onChange: (start: string | null, end: string | null) => void;
}

const BookingTodoTimeChip = ({ start, end, disabled, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(toHM(start));
  const [e, setE] = useState(toHM(end));

  useEffect(() => {
    setS(toHM(start));
    setE(toHM(end));
  }, [start, end]);

  const label =
    start && end
      ? `${toHM(start)}–${toHM(end)}`
      : start
      ? toHM(start)
      : 'Hela dagen';

  const save = () => {
    onChange(s ? `${s}:00` : null, e ? `${e}:00` : null);
    setOpen(false);
  };

  const clear = () => {
    setS('');
    setE('');
    onChange(null, null);
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
            !start && !end && 'text-muted-foreground',
          )}
        >
          <Clock className="h-3 w-3" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2 p-2" align="start">
        <div className="flex items-center gap-2">
          <Input
            type="time"
            value={s}
            onChange={(ev) => setS(ev.target.value)}
            className="h-8 text-xs"
            aria-label="Starttid"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="time"
            value={e}
            onChange={(ev) => setE(ev.target.value)}
            className="h-8 text-xs"
            aria-label="Sluttid"
          />
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clear}>
            Rensa
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={save}>
            Spara
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default BookingTodoTimeChip;
