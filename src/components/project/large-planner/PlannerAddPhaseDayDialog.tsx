/**
 * PlannerAddPhaseDayDialog
 * --------------------------------------------------------------------------
 * Speglar AddRiggDayDialog visuellt men sparvägen är ISOLERAD:
 *   - Skriver ENDAST till `large_project_booking_plan_items`
 *     (via useLargeProjectPlannerItems.createItem).
 *   - Rör ALDRIG bookings / calendar_events / staff_assignments.
 *
 * Används av PlannerEventActionPopover i projektkalendern för att lägga till
 * fler rigg- / event- / nedriggdagar för en bokning utan att personalkalendern
 * påverkas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useLargeProjectPlannerItems } from './useLargeProjectPlannerItems';

const generateTimeOptions = (): string[] => {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
};
const TIME_OPTIONS = generateTimeOptions();

export type PlannerPhase = 'rig' | 'event' | 'rigDown';

const PHASE_LABEL: Record<PlannerPhase, string> = {
  rig: 'Riggdag',
  event: 'Eventdag',
  rigDown: 'Rivdag',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  largeProjectId: string;
  bookingId: string | null;
  /** Förvald fas — typiskt klickade eventets fas. */
  defaultPhase: PlannerPhase;
  /** Förvald starttid HH:mm. */
  defaultStartTime: string;
  /** Förvald sluttid HH:mm. */
  defaultEndTime: string;
  /** Förvalt team — ärvs från klickade eventet. */
  defaultTeamId: string | null;
  /** Defaultmånad (klickade eventets datum). */
  defaultMonth: Date;
  /** Title-fallback för nya items. */
  titleFallback: string;
}

const PlannerAddPhaseDayDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  largeProjectId,
  bookingId,
  defaultPhase,
  defaultStartTime,
  defaultEndTime,
  defaultTeamId,
  defaultMonth,
  titleFallback,
}) => {
  const ctx = useLargeProjectPlannerItems(largeProjectId);
  const [phase, setPhase] = useState<PlannerPhase>(defaultPhase);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [month, setMonth] = useState<Date>(defaultMonth);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPhase(defaultPhase);
      setSelectedDates([]);
      setStartTime(defaultStartTime);
      setEndTime(defaultEndTime);
      setMonth(defaultMonth);
    }
  }, [open, defaultPhase, defaultStartTime, defaultEndTime, defaultMonth]);

  // Befintliga planner-dagar för samma bokning, grupperat per fas — för
  // visuell highlight i kalendern (som AddRiggDayDialog).
  const existingByPhase = useMemo(() => {
    const rig: Date[] = [];
    const evd: Date[] = [];
    const rd: Date[] = [];
    for (const it of ctx.items) {
      if (it.booking_id !== bookingId) continue;
      const ph = (it.source_booking_phase ?? '').toString();
      const d = parseISO(it.plan_date);
      if (ph === 'rig') rig.push(d);
      else if (ph === 'event') evd.push(d);
      else if (ph === 'rigDown') rd.push(d);
    }
    return { rig, event: evd, rigDown: rd };
  }, [ctx.items, bookingId]);

  const handleSave = async () => {
    if (selectedDates.length === 0) {
      toast.error('Välj minst ett datum');
      return;
    }
    setSaving(true);
    const failures: string[] = [];
    let ok = 0;
    try {
      const sorted = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
      for (const d of sorted) {
        const dateStr = format(d, 'yyyy-MM-dd');
        try {
          await ctx.createItem({
            large_project_id: largeProjectId,
            title: titleFallback,
            plan_date: dateStr,
            item_type: 'booking',
            source: 'booking',
            status: 'planned',
            booking_id: bookingId,
            source_booking_phase: phase,
            assigned_team_id: defaultTeamId,
            start_time: `${startTime}:00`,
            end_time: `${endTime}:00`,
          });
          ok += 1;
        } catch (e: any) {
          failures.push(`${dateStr}: ${e?.message ?? String(e)}`);
        }
      }
      if (ok > 0 && failures.length === 0) {
        toast.success(
          ok === 1
            ? `${PHASE_LABEL[phase]} tillagd`
            : `${ok} ${PHASE_LABEL[phase].toLowerCase()}ar tillagda`,
        );
      } else if (ok > 0) {
        toast.warning(`${ok} av ${sorted.length} dagar tillagda`, {
          description: failures.join('\n'),
          duration: 8000,
        });
      } else {
        throw new Error(failures.join('\n') || 'Inga dagar kunde läggas till');
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Kunde inte lägga till dagen/dagarna', {
        description: e?.message ?? undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Lägg till projektdag</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Bokning</Label>
            <div className="text-sm text-muted-foreground">{titleFallback}</div>
          </div>

          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={phase} onValueChange={(v: PlannerPhase) => setPhase(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rig">Riggdag</SelectItem>
                <SelectItem value="event">Eventdag</SelectItem>
                <SelectItem value="rigDown">Rivdag</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Datum (en eller flera)</Label>
              {selectedDates.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedDates.length} dag{selectedDates.length === 1 ? '' : 'ar'} valda
                </span>
              )}
            </div>
            <Calendar
              mode="multiple"
              selected={selectedDates}
              onSelect={(dates) => setSelectedDates(dates ?? [])}
              month={month}
              onMonthChange={setMonth}
              className={cn('rounded-md border pointer-events-auto')}
              modifiers={{
                rigDay: existingByPhase.rig,
                eventDay: existingByPhase.event,
                rigDownDay: existingByPhase.rigDown,
              }}
              modifiersStyles={{
                rigDay: { backgroundColor: '#F2FCE2', fontWeight: 'bold', border: '2px solid #86C232' },
                eventDay: { backgroundColor: '#FEF7CD', fontWeight: 'bold', border: '2px solid #F4C430' },
                rigDownDay: { backgroundColor: '#FEE2E2', fontWeight: 'bold', border: '2px solid #F87171' },
              }}
            />
            <p className="text-xs text-muted-foreground">
              Alla valda dagar får samma tid och team. Skrivs endast till projektplanen — personalkalendern påverkas inte.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Tid</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="planner-start" className="text-xs text-muted-foreground">Start</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger id="planner-start"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={`s-${t}`} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="planner-end" className="text-xs text-muted-foreground">Slut</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger id="planner-end"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={`e-${t}`} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={handleSave} disabled={saving || selectedDates.length === 0}>
            {saving
              ? 'Lägger till…'
              : selectedDates.length > 1
                ? `Lägg till ${selectedDates.length} dagar`
                : 'Lägg till'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlannerAddPhaseDayDialog;
