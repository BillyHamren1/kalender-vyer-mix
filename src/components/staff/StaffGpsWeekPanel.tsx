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
import { StaffGpsDayCell } from './StaffGpsDayCell';
import { GeofenceVisitRows } from './GeofenceVisitRows';

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

  const selectedIdx = weekDays.findIndex((d) => format(d, 'yyyy-MM-dd') === selectedStr);
  const selectedSummary = selectedIdx >= 0 ? summaries[selectedIdx] : undefined;
  const hasVisits = (selectedSummary?.visits?.length ?? 0) > 0;

  return (
    <aside className="planning-card w-full flex flex-col overflow-hidden p-0">
      {/* Topbar: Person + Veckonavigation */}
      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-3 py-2.5 border-b border-[hsl(270_20%_90%)] bg-[hsl(270_35%_98%)]">
        <div className="flex items-center gap-2 min-w-0 md:flex-1">
          <label className="planning-section-title shrink-0">Person</label>
          <Select value={staffId ?? ''} onValueChange={onStaffChange}>
            <SelectTrigger className="h-9 text-sm planning-input md:max-w-[320px]">
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

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full hover:bg-[hsl(270_35%_95%)]"
            onClick={() => onDateChange(addWeeks(weekStart, -1))}
            aria-label="Föregående vecka"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center leading-tight px-1 min-w-[150px]">
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
            className="h-8 px-2.5 text-[11px] font-semibold text-[hsl(280_45%_38%)] hover:bg-[hsl(270_45%_94%)] hover:text-[hsl(280_55%_28%)] rounded-md"
            onClick={() => onDateChange(new Date())}
          >
            Idag
          </Button>
        </div>
      </div>

      {/* Veckokalender: 7 dagar horisontellt */}
      <div className="grid grid-cols-7 divide-x divide-[hsl(270_18%_94%)]">
        {weekDays.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <StaffGpsDayCell
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

      {/* Vald dags geofence-besök */}
      {selectedSummary && hasVisits && (
        <div className="border-t border-[hsl(270_20%_90%)] bg-white">
          <div className="px-3 py-2 text-[11px] font-semibold tracking-tight text-[hsl(280_45%_28%)] capitalize">
            {format(date, 'EEEE d MMM', { locale: sv })} — geofence-besök
          </div>
          <GeofenceVisitRows visits={selectedSummary.visits} compact />
        </div>
      )}
      {selectedSummary && !hasVisits && !selectedSummary.isLoading && (
        <div className="border-t border-[hsl(270_20%_90%)] px-3 py-2 text-[11px] text-muted-foreground/70">
          Inga geofence-besök för vald dag.
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-[hsl(270_20%_90%)] bg-[hsl(270_35%_97%)] text-[10.5px] text-muted-foreground tracking-tight">
        Tid per dag = summan av geofence-besöken (boende exkluderat).
      </div>
    </aside>
  );
}
