/**
 * StaleDayCorrectionDialog
 * ────────────────────────
 * Shown the morning after the nightly cron auto-closes a workday because
 * the staff member forgot to stop their timer. Lets them confirm or
 * correct the actual end-of-day time using GPS-derived suggestions.
 *
 * The flag's `context.suggested_end_times` is built server-side from the
 * staff member's location history (last workplace exit, longer en-route
 * stops, arrival at inferred home). We never auto-apply — the user picks.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Loader2, Clock, MapPin, Home } from 'lucide-react';

export type StaleDaySuggestion = {
  kind: 'left_workplace' | 'stopped_en_route' | 'arrived_home';
  label: string;
  time_iso: string;
};

interface Props {
  open: boolean;
  flagId: string;
  flagDate: string;
  provisionalEndIso: string;
  suggestions: StaleDaySuggestion[];
  submitting: boolean;
  onConfirm: (chosenEndIso: string) => void;
  onDismiss: () => void;
}

const ICONS: Record<StaleDaySuggestion['kind'], typeof Clock> = {
  left_workplace: MapPin,
  stopped_en_route: Clock,
  arrived_home: Home,
};

export default function StaleDayCorrectionDialog({
  open,
  flagDate,
  provisionalEndIso,
  suggestions,
  submitting,
  onConfirm,
  onDismiss,
}: Props) {
  const [selected, setSelected] = useState<string>(
    suggestions[0]?.time_iso || 'custom',
  );
  // Default custom time = provisional end (visible HH:mm)
  const defaultCustomTime = format(parseISO(provisionalEndIso), 'HH:mm');
  const [customTime, setCustomTime] = useState<string>(defaultCustomTime);

  const handleConfirm = () => {
    let chosenIso = selected;
    if (selected === 'custom') {
      // Combine flagDate + customTime in local time
      const [hh, mm] = customTime.split(':').map(Number);
      const d = parseISO(`${flagDate}T00:00:00`);
      d.setHours(hh, mm, 0, 0);
      chosenIso = d.toISOString();
    }
    onConfirm(chosenIso);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Din arbetsdag stängdes automatiskt</DialogTitle>
          <DialogDescription>
            Du glömde stoppa timern{' '}
            {format(parseISO(flagDate), 'd MMM', { locale: sv })}. När slutade
            du egentligen?
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={selected} onValueChange={setSelected} className="gap-3 py-2">
          {suggestions.map((s) => {
            const Icon = ICONS[s.kind];
            const time = format(parseISO(s.time_iso), 'HH:mm');
            return (
              <Label
                key={s.time_iso}
                htmlFor={s.time_iso}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent"
              >
                <RadioGroupItem value={s.time_iso} id={s.time_iso} className="mt-1" />
                <Icon className="h-4 w-4 mt-1 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{time}</div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                </div>
              </Label>
            );
          })}

          <Label
            htmlFor="custom"
            className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent"
          >
            <RadioGroupItem value="custom" id="custom" />
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Annan tid</div>
              <Input
                type="time"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                onClick={() => setSelected('custom')}
                className="mt-2"
              />
            </div>
          </Label>
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onDismiss} disabled={submitting}>
            Avbryt
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Bekräfta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
