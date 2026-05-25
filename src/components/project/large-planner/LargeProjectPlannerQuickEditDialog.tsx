/**
 * LargeProjectPlannerQuickEditDialog
 * --------------------------------------------------------------------------
 * Snabbredigering av ett item i large_project_booking_plan_items.
 * Skriver ENBART till den tabellen via updateItem från useLargeProjectPlannerItems.
 * Rör ALDRIG calendar_events/staff_assignments/BSA/LPTA.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Split, Trash2 } from 'lucide-react';
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
import type {
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerItemStatus,
  LargeProjectPlannerStaffMember,
  UpdatePlannerItemInput,
} from './largeProjectPlannerTypes';

const UNASSIGNED = '__unassigned__';

const STATUS_OPTIONS: { value: LargeProjectPlannerItemStatus; label: string }[] = [
  { value: 'unplanned', label: 'Ej planerad' },
  { value: 'planned', label: 'Planerad' },
  { value: 'in_progress', label: 'Pågår' },
  { value: 'done', label: 'Klar' },
  { value: 'blocked', label: 'Blockerad' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: LargeProjectBookingPlanItem | null;
  staff: LargeProjectPlannerStaffMember[];
  getAllowedStaffForDate?: (date: string | null | undefined) => LargeProjectPlannerStaffMember[];
  isStaffAllowedForDate?: (staffId: string | null | undefined, date: string | null | undefined) => boolean;
  booking?: LargeProjectPlannerBooking | null;
  updateItem: (id: string, updates: UpdatePlannerItemInput) => Promise<unknown>;
  deleteItem?: (id: string) => Promise<unknown>;
  onSplit?: (item: LargeProjectBookingPlanItem) => void;
  isMutating?: boolean;
}

const toTimeInput = (t: string | null) => (t ? t.slice(0, 5) : '');
const fromTimeInput = (t: string): string | null => {
  if (!t) return null;
  return t.length === 5 ? `${t}:00` : t;
};

const LargeProjectPlannerQuickEditDialog = ({
  open,
  onOpenChange,
  item,
  staff,
  getAllowedStaffForDate,
  isStaffAllowedForDate,
  booking,
  updateItem,
  deleteItem,
  onSplit,
  isMutating,
}: Props) => {
  const [title, setTitle] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState(UNASSIGNED);
  const [status, setStatus] = useState<LargeProjectPlannerItemStatus>('planned');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && item) {
      setTitle(item.title);
      setPlanDate(item.plan_date);
      setStartTime(toTimeInput(item.start_time));
      setEndTime(toTimeInput(item.end_time));
      setAssignedStaffId(item.assigned_staff_id ?? UNASSIGNED);
      setStatus(item.status);
      setNotes(item.notes ?? '');
    }
  }, [open, item]);

  // Allowed personal för aktuellt planDate.
  const allowedForDate = (() => {
    if (getAllowedStaffForDate) return getAllowedStaffForDate(planDate);
    return staff;
  })();

  // Om planDate ändras och vald personal inte längre är bemannad → rensa.
  useEffect(() => {
    if (!open) return;
    if (assignedStaffId === UNASSIGNED) return;
    if (isStaffAllowedForDate && planDate && !isStaffAllowedForDate(assignedStaffId, planDate)) {
      setAssignedStaffId(UNASSIGNED);
    }
  }, [open, planDate, assignedStaffId, isStaffAllowedForDate]);

  if (!item) return null;

  const handleSave = async () => {
    if (
      assignedStaffId !== UNASSIGNED &&
      isStaffAllowedForDate &&
      !isStaffAllowedForDate(assignedStaffId, planDate)
    ) {
      toast.error('Personen är inte bemannad på stora projektet detta datum.');
      return;
    }
    setSubmitting(true);
    try {
      await updateItem(item.id, {
        title: title.trim() || item.title,
        plan_date: planDate || item.plan_date,
        start_time: fromTimeInput(startTime),
        end_time: fromTimeInput(endTime),
        assigned_staff_id: assignedStaffId === UNASSIGNED ? null : assignedStaffId,
        status,
        notes: notes.trim() || null,
      });
      toast.success('Sparat.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte spara.');
    } finally {
      setSubmitting(false);
    }
  };


  const handleDelete = async () => {
    if (!deleteItem) return;
    if (!window.confirm(`Ta bort "${item.title}"?`)) return;
    setSubmitting(true);
    try {
      await deleteItem(item.id);
      toast.success('Borttagen.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte ta bort.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickStatus = async (newStatus: LargeProjectPlannerItemStatus) => {
    setStatus(newStatus);
    try {
      await updateItem(item.id, { status: newStatus });
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte uppdatera status.');
    }
  };

  const canSplit = !!onSplit && !!item.booking_id && item.item_type !== 'split';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Redigera task</DialogTitle>
          <DialogDescription>
            Intern projektplanering. Endast denna task uppdateras — inget i personalkalendern.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-1">
              {STATUS_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  size="sm"
                  variant={status === o.value ? 'default' : 'outline'}
                  className="h-7 text-[11px]"
                  onClick={() => handleQuickStatus(o.value)}
                  disabled={submitting}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Start</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Slut</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Personal</Label>
            <Select value={assignedStaffId} onValueChange={setAssignedStaffId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Ej tilldelat</SelectItem>
                {allowedForDate.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
                {allowedForDate.length === 0 && (
                  <div className="px-2 py-1 text-[11px] italic text-muted-foreground">
                    Ingen bemannad personal detta datum
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {booking && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
              Hör till bokning:{' '}
              <span className="font-medium text-foreground">
                {booking.booking_number ? `#${booking.booking_number} — ` : ''}
                {booking.display_name}
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label>Anteckningar</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {deleteItem && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={submitting || isMutating}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Ta bort
            </Button>
          )}
          {canSplit && (
            <Button
              variant="outline"
              onClick={() => {
                onSplit?.(item);
                onOpenChange(false);
              }}
              disabled={submitting || isMutating}
            >
              <Split className="mr-1 h-3.5 w-3.5" />
              Dela upp
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Stäng
          </Button>
          <Button onClick={handleSave} disabled={submitting || isMutating}>
            {submitting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LargeProjectPlannerQuickEditDialog;
