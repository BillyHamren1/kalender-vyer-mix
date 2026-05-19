import React, { useEffect, useMemo, useState } from 'react';
import { sv } from 'date-fns/locale';
import { format, parseISO } from 'date-fns';
import { Lock, Check, ChevronLeft, ChevronRight } from 'lucide-react';

import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
  focusedDate: string | null;
  onFocusedDateChange: (iso: string | null) => void;
}

// Event-steget planeras inte i widgeten — endast rig + rigDown.
const PHASES: DayKind[] = ['rig', 'rigDown'];

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let h = 4; h <= 23; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
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
  focusedDate,
  onFocusedDateChange,
}) => {
  const [step, setStep] = useState<DayKind>('rig');
  const stepIndex = PHASES.indexOf(step);

  const isPhaseDone = (phase: DayKind): boolean => {
    if (isPhaseLocked(booking, phase)) return true;
    return days.some((d) => d.kind === phase);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Datum &amp; tider
        </div>
        <div className="text-[10px] text-muted-foreground">
          Steg {stepIndex + 1} av {PHASES.length}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1">
        {PHASES.map((phase, idx) => {
          const active = phase === step;
          const done = isPhaseDone(phase);
          return (
            <React.Fragment key={phase}>
              <button
                type="button"
                onClick={() => setStep(phase)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-primary/10 text-primary hover:bg-primary/20'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                }`}
              >
                <span
                  className={`flex items-center justify-center h-4 w-4 rounded-full text-[9px] ${
                    active
                      ? 'bg-primary-foreground text-primary'
                      : done
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground border border-border'
                  }`}
                >
                  {done && !active ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                </span>
                {phaseLabel(phase)}
              </button>
              {idx < PHASES.length - 1 && (
                <div className="flex-1 h-px bg-border" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <PhaseBlock
        phase={step}
        booking={booking}
        days={days}
        onChange={onChange}
        inheritedTeamId={inheritedTeamId}
        teamOptions={teamOptions}
        focusedDate={focusedDate}
        onFocusedDateChange={onFocusedDateChange}
      />

      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={stepIndex === 0}
          onClick={() => setStep(PHASES[stepIndex - 1])}
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          Tillbaka
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-7 text-xs"
          disabled={stepIndex === PHASES.length - 1}
          onClick={() => setStep(PHASES[stepIndex + 1])}
        >
          Nästa
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
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
  focusedDate: string | null;
  onFocusedDateChange: (iso: string | null) => void;
}> = ({ phase, booking, days, onChange, inheritedTeamId, teamOptions, focusedDate, onFocusedDateChange }) => {
  const locked = isPhaseLocked(booking, phase);

  const phaseDays = useMemo(
    () => days.filter((d) => d.kind === phase).sort((a, z) => a.date.localeCompare(z.date)),
    [days, phase],
  );

  const selectedDates = useMemo(() => phaseDays.map((d) => parseIsoLocal(d.date)), [phaseDays]);

  // Auto-fokusera första dagen i fasen om inget eller annan fas valt
  useEffect(() => {
    if (phaseDays.length === 0) {
      if (focusedDate !== null) onFocusedDateChange(null);
      return;
    }
    const focusInPhase = phaseDays.some((d) => d.date === focusedDate);
    if (!focusInPhase) onFocusedDateChange(phaseDays[0].date);
  }, [phase, phaseDays, focusedDate, onFocusedDateChange]);

  const focusedIdx = Math.max(
    0,
    phaseDays.findIndex((d) => d.date === focusedDate),
  );
  const focusedDay = phaseDays[focusedIdx];

  // Tider/team för den FOKUSERADE dagen (eller defaults om ingen vald än)
  const start = focusedDay?.startTime ?? DEFAULTS[phase].start;
  const end = focusedDay?.endTime ?? DEFAULTS[phase].end;
  const teamId = focusedDay?.teamId ?? inheritedTeamId;

  // Rig-fasens första dag används som mall när rigDown läggs till utan egna värden.
  const rigSeed = useMemo(
    () => days.find((d) => d.kind === 'rig'),
    [days],
  );

  const setDates = (next: Date[] | undefined) => {
    const nextIso = new Set((next ?? []).map(fmtIso));
    const existingIso = new Set(phaseDays.map((d) => d.date));

    // Behåll dem som fortsatt är valda; lägg till nya
    let nextDays = days.filter((d) => d.kind !== phase || nextIso.has(d.date));
    let lastAdded: string | null = null;
    for (const iso of nextIso) {
      if (!existingIso.has(iso)) {
        // Ärver tid/team från första befintliga dagen i fasen; för rigDown
        // ärvs annars från rig (samma team + tider som default).
        const fallbackStart =
          phase === 'rigDown' ? (rigSeed?.startTime ?? DEFAULTS[phase].start) : DEFAULTS[phase].start;
        const fallbackEnd =
          phase === 'rigDown' ? (rigSeed?.endTime ?? DEFAULTS[phase].end) : DEFAULTS[phase].end;
        const fallbackTeam =
          phase === 'rigDown' ? (rigSeed?.teamId ?? inheritedTeamId) : inheritedTeamId;
        nextDays = insertDaySorted(nextDays, {
          date: iso,
          kind: phase,
          startTime: phaseDays[0]?.startTime ?? fallbackStart,
          endTime: phaseDays[0]?.endTime ?? fallbackEnd,
          teamId: phaseDays[0]?.teamId ?? fallbackTeam,
        });
        lastAdded = iso;
      }
    }
    onChange(nextDays);

    // Fokusera den nyligen tillagda dagen (hjälper användaren planera dag för dag)
    if (lastAdded) onFocusedDateChange(lastAdded);
    else if (focusedDate && !nextIso.has(focusedDate)) {
      // Den fokuserade dagen togs bort — välj första kvarvarande
      const remaining = phaseDays.filter((d) => nextIso.has(d.date));
      onFocusedDateChange(remaining[0]?.date ?? null);
    }
  };

  // Tider/team patchar ENDAST den fokuserade dagen
  const setStart = (v: string) => {
    if (!focusedDay) return;
    onChange(days.map((d) => (d.date === focusedDay.date && d.kind === phase ? { ...d, startTime: v } : d)));
  };
  const setEnd = (v: string) => {
    if (!focusedDay) return;
    onChange(days.map((d) => (d.date === focusedDay.date && d.kind === phase ? { ...d, endTime: v } : d)));
  };
  const setTeam = (v: string) => {
    if (!focusedDay) return;
    onChange(days.map((d) => (d.date === focusedDay.date && d.kind === phase ? { ...d, teamId: v } : d)));
  };

  const applyToAllInPhase = () => {
    if (!focusedDay) return;
    onChange(
      days.map((d) =>
        d.kind === phase
          ? { ...d, startTime: focusedDay.startTime, endTime: focusedDay.endTime, teamId: focusedDay.teamId }
          : d,
      ),
    );
  };

  const gotoPrev = () => {
    if (phaseDays.length === 0) return;
    const idx = (focusedIdx - 1 + phaseDays.length) % phaseDays.length;
    onFocusedDateChange(phaseDays[idx].date);
  };
  const gotoNext = () => {
    if (phaseDays.length === 0) return;
    const idx = (focusedIdx + 1) % phaseDays.length;
    onFocusedDateChange(phaseDays[idx].date);
  };

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

      {/* Dag-navigator: planera EN dag i taget */}
      {phaseDays.length > 0 && (
        <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={gotoPrev}
              disabled={phaseDays.length < 2}
              aria-label="Föregående dag"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Dag {focusedIdx + 1} av {phaseDays.length}
              </div>
              <div className="text-xs font-semibold">
                {focusedDay ? format(parseISO(focusedDay.date), 'EEE d MMM yyyy', { locale: sv }) : '—'}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={gotoNext}
              disabled={phaseDays.length < 2}
              aria-label="Nästa dag"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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

          {phaseDays.length > 1 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 w-full text-[10px]"
              onClick={applyToAllInPhase}
              disabled={locked}
            >
              Använd samma tid/team för alla {phaseDays.length} dagarna
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
