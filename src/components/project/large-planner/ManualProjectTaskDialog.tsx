/**
 * ManualProjectTaskDialog
 * --------------------------------------------------------------------------
 * Dialog för att skapa en MANUELL task i ett stort projekts interna
 * bokningsplanering.
 *
 * HÅRDA REGLER:
 *  - Skriver ENBART till `large_project_booking_plan_items` (via
 *    useLargeProjectPlannerItems → largeProjectPlannerService).
 *  - Skapar ALDRIG calendar_events / staff_assignments /
 *    booking_staff_assignments / large_project_team_assignments.
 *  - Den manuella tasken är intern projektplanering — den syns INTE i
 *    personalkalendern och INTE automatiskt i Time-appen. Operationalisering
 *    sker först i ett senare, explicit publiceringssteg.
 */
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
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
  CreatePlannerItemInput,
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerItemStatus,
  LargeProjectPlannerStaffMember,
} from './largeProjectPlannerTypes';

const UNASSIGNED = '__unassigned__';
const NO_BOOKING = '__none__';

const STATUS_OPTIONS: { value: LargeProjectPlannerItemStatus; label: string }[] = [
  { value: 'planned', label: 'Planerad' },
  { value: 'unplanned', label: 'Ej planerad' },
  { value: 'in_progress', label: 'Pågående' },
  { value: 'done', label: 'Klar' },
  { value: 'blocked', label: 'Blockerad' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  largeProjectId: string;
  bookings: LargeProjectPlannerBooking[];
  staff: LargeProjectPlannerStaffMember[];
  /** Allowed staff per datum (från useLargeProjectPlannerItems). */
  getAllowedStaffForDate?: (date: string | null | undefined) => LargeProjectPlannerStaffMember[];
  isStaffAllowedForDate?: (staffId: string | null | undefined, date: string | null | undefined) => boolean;
  /** Förifylld dag (yyyy-MM-dd). Faller tillbaka till idag. */
  defaultDate?: string | null;
  /** Förifylld personal. */
  defaultStaffId?: string | null;
  /** Förifylld bokning. */
  defaultBookingId?: string | null;
  /** Skapa-funktion från useLargeProjectPlannerItems. */
  createItem: (input: CreatePlannerItemInput) => Promise<LargeProjectBookingPlanItem>;
  isMutating?: boolean;
}

const ManualProjectTaskDialog = ({
  open,
  onOpenChange,
  largeProjectId,
  bookings,
  staff,
  getAllowedStaffForDate,
  isStaffAllowedForDate,
  defaultDate,
  defaultStaffId,
  defaultBookingId,
  createItem,
  isMutating,
}: Props) => {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [planDate, setPlanDate] = useState<string>(defaultDate ?? today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [assignedStaffId, setAssignedStaffId] = useState<string>(
    defaultStaffId ?? UNASSIGNED,
  );
  const [assignedTeamId, setAssignedTeamId] = useState<string>('');
  const [bookingId, setBookingId] = useState<string>(defaultBookingId ?? NO_BOOKING);
  const [status, setStatus] = useState<LargeProjectPlannerItemStatus>('planned');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset vid open
  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setPlanDate(defaultDate ?? today);
      setStartTime('');
      setEndTime('');
      setAssignedStaffId(defaultStaffId ?? UNASSIGNED);
      setAssignedTeamId('');
      setBookingId(defaultBookingId ?? NO_BOOKING);
      setStatus('planned');
      setNotes('');
    }
  }, [open, defaultDate, defaultStaffId, defaultBookingId, today]);

  // Visa bara personal som är bemannad på valt datum.
  const allowedForDate = useMemo(() => {
    if (getAllowedStaffForDate) return getAllowedStaffForDate(planDate);
    return staff;
  }, [getAllowedStaffForDate, planDate, staff]);

  // Om planDate ändras och vald personal inte längre är bemannad → rensa.
  useEffect(() => {
    if (assignedStaffId === UNASSIGNED) return;
    if (isStaffAllowedForDate && !isStaffAllowedForDate(assignedStaffId, planDate)) {
      setAssignedStaffId(UNASSIGNED);
    }
  }, [planDate, assignedStaffId, isStaffAllowedForDate]);


  const canSubmit = title.trim().length > 0 && !!planDate && !submitting && !isMutating;

  const toTime = (v: string): string | null => {
    if (!v) return null;
    return v.length === 5 ? `${v}:00` : v;
  };

  const handleSave = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createItem({
        large_project_id: largeProjectId,
        title: title.trim(),
        description: description.trim() || null,
        plan_date: planDate,
        item_type: 'manual',
        source: 'manual',
        status,
        start_time: toTime(startTime),
        end_time: toTime(endTime),
        assigned_staff_id: assignedStaffId === UNASSIGNED ? null : assignedStaffId,
        assigned_team_id: assignedTeamId.trim() || null,
        booking_id: bookingId === NO_BOOKING ? null : bookingId,
        notes: notes.trim() || null,
      });
      toast.success('Manuell task skapad.');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || 'Kunde inte skapa task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Manuell task
          </DialogTitle>
          <DialogDescription>
            Intern projektplanering. Syns inte i personalkalendern eller Time-appen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="manual-title">Titel *</Label>
            <Input
              id="manual-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="T.ex. Genomgång rigg eller Kund-walkthrough"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="manual-desc">Beskrivning</Label>
            <Textarea
              id="manual-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Valfri beskrivning"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="manual-date">Datum *</Label>
              <Input
                id="manual-date"
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-start">Starttid</Label>
              <Input
                id="manual-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-end">Sluttid</Label>
              <Input
                id="manual-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Personal</Label>
              <Select value={assignedStaffId} onValueChange={setAssignedStaffId}>
                <SelectTrigger>
                  <SelectValue placeholder="Ej tilldelat" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Ej tilldelat</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-team">Team-ID (valfritt)</Label>
              <Input
                id="manual-team"
                value={assignedTeamId}
                onChange={(e) => setAssignedTeamId(e.target.value)}
                placeholder="UUID eller tomt"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Bokning (valfritt)</Label>
              <Select value={bookingId} onValueChange={setBookingId}>
                <SelectTrigger>
                  <SelectValue placeholder="Ingen bokning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BOOKING}>Ingen bokning</SelectItem>
                  {bookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.booking_number ? `#${b.booking_number} — ` : ''}
                      {b.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as LargeProjectPlannerItemStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="manual-notes">Anteckningar</Label>
            <Textarea
              id="manual-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Interna noter"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            Skapa task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManualProjectTaskDialog;
