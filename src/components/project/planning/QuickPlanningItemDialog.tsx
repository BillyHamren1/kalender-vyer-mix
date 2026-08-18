import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Clock3, HardHat } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BSAValidationError, createEstablishmentTask } from "@/services/establishmentTaskService";
import { syncActivityToCalendar } from "@/services/activityCalendarSyncService";

export type QuickPlanningMode = "moment" | "calendar";

interface QuickPlanningItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: QuickPlanningMode;
  bookingId: string | null;
  defaultDate?: string | null;
  staffPool?: Array<{ id: string; name: string }>;
  onCreated: () => void;
}

const today = () => format(new Date(), "yyyy-MM-dd");

const QuickPlanningItemDialog = ({
  open,
  onOpenChange,
  mode,
  bookingId,
  defaultDate,
  staffPool = [],
  onCreated,
}: QuickPlanningItemDialogProps) => {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate || today());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [assignedTo, setAssignedTo] = useState("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const copy = useMemo(() => mode === "calendar" ? {
    title: "Ny kalenderhändelse",
    placeholder: "T.ex. Kundgenomgång, leverans, besiktning…",
    icon: CalendarDays,
    submit: "Skapa kalenderhändelse",
  } : {
    title: "Nytt moment",
    placeholder: "T.ex. Bygg Multiflex 10×20, lägg golv…",
    icon: HardHat,
    submit: "Skapa moment",
  }, [mode]);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(defaultDate || today());
    setStartTime("08:00");
    setEndTime("16:00");
    setAssignedTo("none");
    setNotes("");
  }, [open, defaultDate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !bookingId) return;
    if (endTime <= startTime) {
      toast.error("Sluttiden måste vara efter starttiden");
      return;
    }

    setSaving(true);
    try {
      const task = await createEstablishmentTask({
        booking_id: bookingId,
        title: title.trim(),
        category: mode === "calendar" ? "Kalender" : "Montering",
        start_date: date,
        end_date: date,
        start_time: startTime,
        end_time: endTime,
        source: mode === "calendar" ? "calendar_manual" : "manual",
        assigned_to: assignedTo === "none" ? null : assignedTo,
        assigned_to_ids: assignedTo === "none" ? [] : [assignedTo],
        description: notes.trim() || null,
        task_type: mode === "calendar" ? "pm" : "crew",
        readiness: "ready",
        status: "todo",
      });

      // A standalone calendar item is intentionally published immediately.
      if (mode === "calendar") await syncActivityToCalendar(task.id);

      toast.success(mode === "calendar" ? "Kalenderhändelsen är skapad" : "Momentet är skapat");
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof BSAValidationError
        ? "Personen måste först vara bemannad på projektet"
        : "Kunde inte skapa planeringen");
    } finally {
      setSaving(false);
    }
  };

  const Icon = copy.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            {copy.title}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="planning-title">Vad ska hända?</Label>
            <Input
              id="planning-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={copy.placeholder}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_112px_112px]">
            <div className="space-y-2">
              <Label htmlFor="planning-date">Datum</Label>
              <Input id="planning-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planning-start">Start</Label>
              <Input id="planning-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planning-end">Slut</Label>
              <Input id="planning-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {mode === "moment" && (
            <div className="space-y-2">
              <Label>Ansvarig <span className="font-normal text-muted-foreground">(valfritt)</span></Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen ännu</SelectItem>
                  {staffPool.map((person) => (
                    <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="planning-notes">Anteckning <span className="font-normal text-muted-foreground">(valfritt)</span></Label>
            <Textarea
              id="planning-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Det som är viktigt för genomförandet…"
            />
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground flex gap-2">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {mode === "calendar"
              ? "Händelsen visas direkt i projektets kalender."
              : "Momentet visas direkt i tidslinjen och kan öppnas för fler detaljer senare."}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
            <Button type="submit" disabled={!title.trim() || !date || saving}>{saving ? "Sparar…" : copy.submit}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickPlanningItemDialog;
