/**
 * SplitBookingIntoTasksDialog
 * --------------------------------------------------------------------------
 * Dela upp en bokning i flera delmoment inuti stora projektets INTERNA
 * bokningsplanering. Skriver ENBART till `large_project_booking_plan_items`
 * via splitBooking() i useLargeProjectPlannerItems → largeProjectPlannerService
 * → splitBookingIntoPlannerTasks (skapar parent + child-rows).
 *
 * HÅRDA REGLER:
 *  - Skapar ALDRIG calendar_events.
 *  - Skapar ALDRIG staff_assignments / booking_staff_assignments.
 *  - Påverkar INTE personalkalendern.
 *  - source='split', parent item_type='split', children item_type='task'.
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type {
  LargeProjectPlannerBooking,
  LargeProjectPlannerStaffMember,
  SplitBookingInput,
} from './largeProjectPlannerTypes';

interface TemplatePart {
  label: string;
  phase?: 'rig' | 'event' | 'rigDown' | null;
}

const TEMPLATES: TemplatePart[] = [
  { label: 'Rigg', phase: 'rig' },
  { label: 'Golv', phase: 'rig' },
  { label: 'Stomme', phase: 'rig' },
  { label: 'Duk/väggar', phase: 'rig' },
  { label: 'Inredning', phase: 'event' },
  { label: 'Kontroll', phase: 'event' },
  { label: 'Riv', phase: 'rigDown' },
  { label: 'Transport', phase: null },
  { label: 'Egen rad', phase: null },
];

interface DraftRow {
  uid: string;
  title: string;
  plan_date: string;
  start_time: string;
  end_time: string;
  assigned_staff_id: string;
  assigned_team_id: string;
  notes: string;
  phase: '' | 'rig' | 'event' | 'rigDown';
}

const NONE = '__none__';

const newRowId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const blankRow = (defaultDate: string): DraftRow => ({
  uid: newRowId(),
  title: '',
  plan_date: defaultDate,
  start_time: '',
  end_time: '',
  assigned_staff_id: '',
  assigned_team_id: '',
  notes: '',
  phase: '',
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  largeProjectId: string;
  booking: LargeProjectPlannerBooking | null;
  staff: LargeProjectPlannerStaffMember[];
  getAllowedStaffForDate?: (date: string | null | undefined) => LargeProjectPlannerStaffMember[];
  isStaffAllowedForDate?: (staffId: string | null | undefined, date: string | null | undefined) => boolean;
  onSplit: (input: SplitBookingInput) => Promise<unknown>;
  isMutating?: boolean;
}

const SplitBookingIntoTasksDialog = ({
  open,
  onOpenChange,
  largeProjectId,
  booking,
  staff,
  getAllowedStaffForDate,
  isStaffAllowedForDate,
  onSplit,
  isMutating,
}: Props) => {
  const defaultDate = useMemo(
    () =>
      booking?.rigdaydate ??
      booking?.eventdate ??
      booking?.rigdowndate ??
      new Date().toISOString().slice(0, 10),
    [booking],
  );

  const [rows, setRows] = useState<DraftRow[]>(() => [blankRow(defaultDate)]);

  useEffect(() => {
    if (open) {
      setRows([blankRow(defaultDate)]);
    }
  }, [open, defaultDate]);

  const dateOptions = useMemo(() => {
    if (!booking) return [defaultDate];
    return Array.from(
      new Set(
        [booking.rigdaydate, booking.eventdate, booking.rigdowndate].filter(
          (d): d is string => !!d,
        ),
      ),
    );
  }, [booking, defaultDate]);

  const addTemplate = (tpl: TemplatePart) => {
    const phase = (tpl.phase ?? '') as DraftRow['phase'];
    const baseDate =
      phase === 'rig'
        ? booking?.rigdaydate ?? defaultDate
        : phase === 'event'
          ? booking?.eventdate ?? defaultDate
          : phase === 'rigDown'
            ? booking?.rigdowndate ?? defaultDate
            : defaultDate;
    const start =
      phase === 'rig'
        ? booking?.rig_start_time ?? ''
        : phase === 'event'
          ? booking?.event_start_time ?? ''
          : phase === 'rigDown'
            ? booking?.rigdown_start_time ?? ''
            : '';
    const end =
      phase === 'rig'
        ? booking?.rig_end_time ?? ''
        : phase === 'event'
          ? booking?.event_end_time ?? ''
          : phase === 'rigDown'
            ? booking?.rigdown_end_time ?? ''
            : '';
    setRows((prev) => [
      ...prev,
      {
        ...blankRow(baseDate),
        title: tpl.label === 'Egen rad' ? '' : tpl.label,
        phase,
        start_time: start ? start.slice(0, 5) : '',
        end_time: end ? end.slice(0, 5) : '',
      },
    ]);
  };

  const addEmpty = () => setRows((prev) => [...prev, blankRow(defaultDate)]);

  const updateRow = (uid: string, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));

  const removeRow = (uid: string) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)));

  const handleSave = async () => {
    if (!booking) return;
    const cleaned = rows
      .map((r) => ({ ...r, title: r.title.trim() }))
      .filter((r) => r.title.length > 0 && r.plan_date);
    if (cleaned.length === 0) {
      toast.error('Lägg till minst en rad med titel och datum.');
      return;
    }
    const toHms = (t: string) => (t ? `${t}:00` : null);
    const input: SplitBookingInput = {
      large_project_id: largeProjectId,
      booking_id: booking.id,
      parts: cleaned.map((r) => ({
        title: r.title,
        plan_date: r.plan_date,
        phase: r.phase || null,
        start_time: toHms(r.start_time),
        end_time: toHms(r.end_time),
        assigned_staff_id: r.assigned_staff_id || null,
        assigned_team_id: r.assigned_team_id || null,
        notes: r.notes.trim() || null,
      })),
    };
    try {
      await onSplit(input);
      toast.success(`Delade upp bokningen i ${cleaned.length} delmoment.`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte dela upp bokningen.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Dela upp bokning i delmoment
          </DialogTitle>
          <DialogDescription>
            Endast intern projektplanering. Påverkar inte personalkalendern eller
            bokningstider.
          </DialogDescription>
        </DialogHeader>

        {booking ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-primary/5 p-2 text-xs">
              <div className="font-semibold text-foreground">{booking.display_name}</div>
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                {booking.booking_number && <span>Bokning #{booking.booking_number}</span>}
                {booking.client && <span>Kund: {booking.client}</span>}
              </div>
            </div>

            <div>
              <Label className="text-[11px] uppercase text-muted-foreground">
                Snabbmallar
              </Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {TEMPLATES.map((tpl) => (
                  <Button
                    key={tpl.label}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => addTemplate(tpl)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {tpl.label}
                    {tpl.phase && (
                      <Badge
                        variant="secondary"
                        className="ml-1 px-1 py-0 text-[9px] font-normal"
                      >
                        {tpl.phase === 'rig'
                          ? 'Rigg'
                          : tpl.phase === 'event'
                            ? 'Event'
                            : 'Riv'}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="max-h-[420px] pr-2">
              <div className="space-y-2">
                {rows.map((row, idx) => (
                  <div
                    key={row.uid}
                    className="rounded-md border border-border/60 bg-card p-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-muted-foreground">
                        Delmoment {idx + 1}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => removeRow(row.uid)}
                        disabled={rows.length === 1}
                        title="Ta bort rad"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    <div className="mt-1 grid grid-cols-12 gap-2">
                      <div className="col-span-12 md:col-span-6">
                        <Label className="text-[10px] text-muted-foreground">Titel</Label>
                        <Input
                          value={row.title}
                          onChange={(e) => updateRow(row.uid, { title: e.target.value })}
                          placeholder="t.ex. Rigg golv"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Datum</Label>
                        <Select
                          value={row.plan_date}
                          onValueChange={(v) => updateRow(row.uid, { plan_date: v })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {dateOptions.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                            {!dateOptions.includes(row.plan_date) && (
                              <SelectItem value={row.plan_date}>{row.plan_date}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-3 md:col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Start</Label>
                        <Input
                          type="time"
                          value={row.start_time}
                          onChange={(e) =>
                            updateRow(row.uid, { start_time: e.target.value })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-3 md:col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Slut</Label>
                        <Input
                          type="time"
                          value={row.end_time}
                          onChange={(e) =>
                            updateRow(row.uid, { end_time: e.target.value })
                          }
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="col-span-12 md:col-span-6">
                        <Label className="text-[10px] text-muted-foreground">
                          Tilldelad personal
                        </Label>
                        <Select
                          value={row.assigned_staff_id || NONE}
                          onValueChange={(v) =>
                            updateRow(row.uid, {
                              assigned_staff_id: v === NONE ? '' : v,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Välj…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ej tilldelat</SelectItem>
                            {staff.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <Label className="text-[10px] text-muted-foreground">Team-id</Label>
                        <Input
                          value={row.assigned_team_id}
                          onChange={(e) =>
                            updateRow(row.uid, { assigned_team_id: e.target.value })
                          }
                          placeholder="(valfritt)"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <Label className="text-[10px] text-muted-foreground">Fas</Label>
                        <Select
                          value={row.phase || NONE}
                          onValueChange={(v) =>
                            updateRow(row.uid, {
                              phase: v === NONE ? '' : (v as DraftRow['phase']),
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Ingen</SelectItem>
                            <SelectItem value="rig">Rigg</SelectItem>
                            <SelectItem value="event">Event</SelectItem>
                            <SelectItem value="rigDown">Riv</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-12">
                        <Label className="text-[10px] text-muted-foreground">
                          Anteckningar
                        </Label>
                        <Textarea
                          value={row.notes}
                          onChange={(e) => updateRow(row.uid, { notes: e.target.value })}
                          rows={2}
                          className="min-h-[40px] text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addEmpty}
              className="w-full"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Lägg till tom rad
            </Button>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Välj en bokning först.
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={!booking || isMutating}>
            Spara delmoment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SplitBookingIntoTasksDialog;
