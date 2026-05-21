import { useMemo } from 'react';
import { format, startOfWeek, addDays, addWeeks, getISOWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StaffMember } from '@/services/staffService';
import { useStaffGpsWeekSummary } from '@/hooks/staff/useStaffGpsWeekSummary';
import { useWeekDays } from '@/hooks/useWeekDays';
import { StaffGpsDayRow } from './StaffGpsDayRow';

interface Props {
  staff: StaffMember[];
  staffId: string | null;
  onStaffChange: (id: string) => void;
  assignedSet: Set<string>;
  pingedSet: Set<string>;
  date: Date;
  onDateChange: (d: Date) => void;
}

export function StaffGpsWeekPanel({
  staff, staffId, onStaffChange, assignedSet, pingedSet, date, onDateChange,
}: Props) {
  const weekStart = useMemo(() => startOfWeek(date, { weekStartsOn: 1 }), [date]);
  const weekDays = useWeekDays(weekStart);
  const summaries = useStaffGpsWeekSummary(staffId, weekDays);
  const selectedStr = format(date, 'yyyy-MM-dd');
  const isoWeek = getISOWeek(weekStart);

  return (
    <aside className="w-full md:w-[320px] shrink-0 rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm flex flex-col overflow-hidden">
      {/* Person */}
      <div className="p-3 border-b border-border/60 space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80 font-medium">
          Person
        </label>
        <Select value={staffId ?? ''} onValueChange={onStaffChange}>
          <SelectTrigger className="w-full h-9 text-sm border-border/60 bg-background/60">
            <SelectValue placeholder="Välj person" />
          </SelectTrigger>
          <SelectContent>
            {staff.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">Ingen matchar filtret.</div>
            )}
            {staff.map((s) => {
              const a = assignedSet.has(s.id);
              const p = pingedSet.has(s.id);
              return (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span>{s.name}</span>
                    {a && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Ass</Badge>}
                    {p && <Badge variant="outline" className="h-4 px-1 text-[10px]">GPS</Badge>}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Vecka */}
      <div className="px-2 py-2 border-b border-border/60 flex items-center gap-1">
        <Button
          variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-muted"
          onClick={() => onDateChange(addWeeks(weekStart, -1))}
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">Vecka {isoWeek}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {format(weekStart, 'd MMM', { locale: sv })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}
          </div>
        </div>
        <Button
          variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-muted"
          onClick={() => onDateChange(addWeeks(weekStart, 1))}
          aria-label="Nästa vecka"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-8 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => onDateChange(new Date())}
        >
          Idag
        </Button>
      </div>

      {/* Dagar — alla 7 synliga */}
      <div className="divide-y divide-border/40">
        {weekDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <StaffGpsDayRow
              key={dateStr}
              day={day}
              dateStr={dateStr}
              selected={dateStr === selectedStr}
              summary={summaries[i]}
              onClick={() => onDateChange(day)}
            />
          );
        })}
      </div>

      <div className="px-3 py-2 border-t border-border/60 bg-muted/20 text-[10px] text-muted-foreground/80 tracking-tight">
        Tid per projekt = tid inom geofence. Boende räknas inte.
      </div>
    </aside>
  );
}
