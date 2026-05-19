import React, { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar as CalIcon, X, Lock } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DayKind,
  PlanningDay,
  DEFAULTS,
  isPhaseLocked,
  insertDaySorted,
  phaseLabel,
} from './bookingPlacementSeed';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any;
  days: PlanningDay[];
  onChange: (next: PlanningDay[]) => void;
  inheritedTeamId: string;
}

const PHASES: DayKind[] = ['rig', 'event', 'rigDown'];

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 4; h <= 23; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

const fmtIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseIsoLocal = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const PhaseDatesEditor: React.FC<Props> = ({
  booking,
  days,
  onChange,
  inheritedTeamId,
}) => {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Datum &amp; tider
      </div>
      {PHASES.map((phase) => (
        <PhaseBlock
          key={phase}
          phase={phase}
          booking={booking}
          days={days}
          onChange={onChange}
          inheritedTeamId={inheritedTeamId}
        />
      ))}
    </div>
  );
};

const PhaseBlock: React.FC<{
  phase: DayKind;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any;
  days: PlanningDay[];
  onChange: (next: PlanningDay[]) => void;
  inheritedTeamId: string;
}> = ({ phase, booking, days, onChange, inheritedTeamId }) => {
  const [open, setOpen] = useState(false);
  const locked = isPhaseLocked(booking, phase);

  const phaseDays = useMemo(
    () => days.filter((d) => d.kind === phase).sort((a, z) => a.date.localeCompare(z.date)),
    [days, phase],
  );

  const selectedDates = useMemo(() => phaseDays.map((d) => parseIsoLocal(d.date)), [phaseDays]);

  // Tiderna är gemensamma per fas: visa första dagens tid och uppdatera alla
  const start = phaseDays[0]?.startTime ?? DEFAULTS[phase].start;
  const end = phaseDays[0]?.endTime ?? DEFAULTS[phase].end;

  const setDates = (next: Date[] | undefined) => {
    const nextIso = new Set((next ?? []).map(fmtIso));
    const existingIso = new Set(phaseDays.map((d) => d.date));

    // Behåll dem som fortsatt är valda; lägg till nya
    let nextDays = days.filter((d) => d.kind !== phase || nextIso.has(d.date));
    for (const iso of nextIso) {
      if (!existingIso.has(iso)) {
        nextDays = insertDaySorted(nextDays, {
          date: iso,
          kind: phase,
          startTime: start,
          endTime: end,
          teamId: phaseDays[0]?.teamId ?? inheritedTeamId,
        });
      }
    }
    onChange(nextDays);
  };

  const removeDate = (iso: string) => {
    onChange(days.filter((d) => !(d.kind === phase && d.date === iso)));
  };

  const setStart = (v: string) => {
    onChange(days.map((d) => (d.kind === phase ? { ...d, startTime: v } : d)));
  };
  const setEnd = (v: string) => {
    onChange(days.map((d) => (d.kind === phase ? { ...d, endTime: v } : d)));
  };

  return (
    <div className="rounded border border-border/40 bg-muted/10 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium flex items-center gap-1">
          {phaseLabel(phase)}
          {locked && (
            <Badge
              variant="outline"
              className="ml-1 h-4 px-1 text-[9px] border-red-400 text-red-700 bg-red-50"
            >
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              Fast tid
            </Badge>
          )}
        </div>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]">
              <Plus className="h-3 w-3 mr-1" /> Datum
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={setDates}
              weekStartsOn={1}
              locale={sv}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {phaseDays.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic px-1">Inga datum valda</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {phaseDays.map((d) => (
            <Badge
              key={d.date}
              variant="secondary"
              className="h-6 pl-2 pr-1 text-[11px] gap-1 font-normal"
            >
              <CalIcon className="h-3 w-3" />
              {(() => {
                try {
                  return format(parseISO(d.date), 'EEE d MMM', { locale: sv });
                } catch {
                  return d.date;
                }
              })()}
              <button
                type="button"
                onClick={() => removeDate(d.date)}
                className="ml-0.5 rounded hover:bg-destructive/20 p-0.5"
                aria-label="Ta bort datum"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Start</Label>
          <Select value={start} onValueChange={setStart} disabled={locked}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Slut</Label>
          <Select value={end} onValueChange={setEnd} disabled={locked}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {TIME_OPTIONS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
