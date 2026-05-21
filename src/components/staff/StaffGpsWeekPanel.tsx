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
    <aside className="w-full md:w-[320px] shrink-0 border rounded-md bg-card flex flex-col max-h-[calc(100vh-180px)]">
      {/* Person */}
      <div className="p-3 border-b space-y-2">
        <label className="text-xs text-muted-foreground">Person</label>
        <Select value={staffId ?? ''} onValueChange={onStaffChange}>
          <SelectTrigger className="w-full">
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
      <div className="p-3 border-b flex items-center justify-between gap-2">
        <Button
          variant="ghost" size="sm"
          onClick={() => onDateChange(addWeeks(weekStart, -1))}
          aria-label="Föregående vecka"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <div className="text-sm font-medium">Vecka {isoWeek}</div>
          <div className="text-xs text-muted-foreground">
            {format(weekStart, 'd MMM', { locale: sv })} – {format(addDays(weekStart, 6), 'd MMM yyyy', { locale: sv })}
          </div>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => onDateChange(addWeeks(weekStart, 1))}
          aria-label="Nästa vecka"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="px-3 pt-2">
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={() => onDateChange(new Date())}>
          Idag
        </Button>
      </div>

      {/* Dagar */}
      <div className="flex-1 overflow-auto py-2">
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

      <div className="px-3 py-2 border-t text-[10px] text-muted-foreground">
        Start = första GPS utanför Boende, Slut = sista. Boende räknas inte som arbetstid.
      </div>
    </aside>
  );
}
