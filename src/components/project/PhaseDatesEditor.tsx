import React, { useMemo } from 'react';
import { sv } from 'date-fns/locale';
import { Lock } from 'lucide-react';

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

interface TeamOption {
  id: string;
  title: string;
}

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any;
  days: PlanningDay[];
  onChange: (next: PlanningDay[]) => void;
  inheritedTeamId: string;
  teamOptions: TeamOption[];
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
  teamOptions,
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
          teamOptions={teamOptions}
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
  teamOptions: TeamOption[];
}> = ({ phase, booking, days, onChange, inheritedTeamId, teamOptions }) => {
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



  const setStart = (v: string) => {
    onChange(days.map((d) => (d.kind === phase ? { ...d, startTime: v } : d)));
  };
  const setEnd = (v: string) => {
    onChange(days.map((d) => (d.kind === phase ? { ...d, endTime: v } : d)));
  };
  const setTeam = (v: string) => {
    onChange(days.map((d) => (d.kind === phase ? { ...d, teamId: v } : d)));
  };

  const teamId = phaseDays[0]?.teamId ?? inheritedTeamId;

  // Default-månad: första valda dagen, annars bokningens fas-starttid, annars idag
  const bookingPhaseDate = useMemo(() => {
    const field =
      phase === 'rig'
        ? 'rig_start_time'
        : phase === 'event'
          ? 'event_start_time'
          : 'rigdown_start_time';
    const raw = booking?.[field];
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }, [booking, phase]);

  const defaultMonth = selectedDates[0] ?? bookingPhaseDate ?? new Date();
  const monthKey = `${defaultMonth.getFullYear()}-${defaultMonth.getMonth()}`;

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
        <span className="text-[10px] text-muted-foreground">
          Klicka på datum för att lägga till/ta bort
        </span>
      </div>

      <div className="rounded border border-border/40 bg-card overflow-hidden">
        <Calendar
          key={monthKey}
          mode="multiple"
          selected={selectedDates}
          onSelect={(next) => !locked && setDates(next as Date[] | undefined)}
          defaultMonth={defaultMonth}
          weekStartsOn={1}
          locale={sv}
          disabled={locked}
          className="p-2 [&_table]:w-full [&_button]:h-7 [&_button]:w-7 [&_button]:text-[11px]"
        />
      </div>





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

      <div>
        <Label className="text-[10px] text-muted-foreground">Team</Label>
        <Select value={teamId} onValueChange={setTeam} disabled={locked}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.id} className="text-xs">
                {t.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
