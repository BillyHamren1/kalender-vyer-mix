import { useMemo, useState } from 'react';
import { startOfWeek, addWeeks, addDays, format, getISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWeekDays } from '@/hooks/useWeekDays';
import type { StaffMember } from '@/services/staffService';
import { StaffGpsWeekListRow } from './StaffGpsWeekListRow';

interface Props {
  staff: StaffMember[];
  assignedSet: Set<string>;
  pingedSet: Set<string>;
  date: Date;
  onDateChange: (d: Date) => void;
  onSelect: (staffId: string, date: Date) => void;
}

export function StaffGpsWeekList({
  staff, assignedSet, pingedSet, date, onDateChange, onSelect,
}: Props) {
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const weekDays = useWeekDays(weekStart);
  const isoWeek = getISOWeek(weekStart);
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = staff.filter((s) => assignedSet.has(s.id) || pingedSet.has(s.id));
    if (!q) return base;
    return base.filter((s) => s.name.toLowerCase().includes(q));
  }, [staff, assignedSet, pingedSet, filter]);

  return (
    <div className="flex flex-col gap-3">
      {/* Veckonavigation */}
      <div className="planning-card flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0 md:flex-1">
          <label className="planning-section-title shrink-0">Sök person</label>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrera lista…"
            className="planning-input h-9 text-sm w-full md:max-w-[320px] px-3 rounded-md border border-[hsl(270_20%_88%)]"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-[hsl(270_35%_95%)]"
            onClick={() => onDateChange(addWeeks(weekStart, -1))}
            aria-label="Föregående vecka"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center leading-tight px-1 min-w-[160px]">
            <div className="text-[13px] font-semibold tracking-tight text-[hsl(280_45%_28%)]">Vecka {isoWeek}</div>
            <div className="text-[10.5px] text-muted-foreground tabular-nums">
              {format(weekStart, 'd MMM', { locale: sv })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}
            </div>
          </div>
          <Button
            variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-[hsl(270_35%_95%)]"
            onClick={() => onDateChange(addWeeks(weekStart, 1))}
            aria-label="Nästa vecka"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-8 px-2.5 text-[11px] font-semibold text-[hsl(280_45%_38%)] hover:bg-[hsl(270_45%_94%)] rounded-md"
            onClick={() => onDateChange(new Date())}
          >
            Idag
          </Button>
        </div>
      </div>

      {/* Lista personer */}
      {visible.length === 0 ? (
        <div className="planning-card px-4 py-6 text-sm text-muted-foreground">
          Ingen personal med aktivitet eller bemanning för vald vecka.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((s) => (
            <StaffGpsWeekListRow
              key={s.id}
              staff={s}
              weekDays={weekDays}
              isAssigned={assignedSet.has(s.id)}
              isPinged={pingedSet.has(s.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      <div className="text-[10.5px] text-muted-foreground tracking-tight px-1">
        Tid per dag = summan av geofence-besöken (boende exkluderat). Klicka på en person eller dag för att öppna kartan.
      </div>
    </div>
  );
}
