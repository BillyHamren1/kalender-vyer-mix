import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createInternalWarehouseTask } from "@/services/warehouseProjectService";
import {
  WAREHOUSE_TASK_CATEGORY_LABELS,
  WarehouseTaskCategory,
} from "@/types/warehouseProject";

interface CreateInternalTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface StaffOption {
  id: string;
  name: string;
}

const CATEGORIES: WarehouseTaskCategory[] = [
  "cleaning",
  "maintenance",
  "purchase",
  "planning",
  "other",
];

export default function CreateInternalTaskDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateInternalTaskDialogProps) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("none");
  const [category, setCategory] = useState<string>("none");
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("11:00");

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-members-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return (data || []) as StaffOption[];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      const t = format(new Date(), "yyyy-MM-dd");
      setTitle("");
      setDescription("");
      setAssignedTo("none");
      setCategory("none");
      setStartDate(t);
      setEndDate(t);
      setStartTime("08:00");
      setEndTime("11:00");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () =>
      createInternalWarehouseTask({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo !== "none" ? assignedTo : null,
        category: category !== "none" ? category : null,
        start_date: `${startDate}T${startTime}:00`,
        end_date: `${endDate || startDate}T${endTime}:00`,
      }),
    onSuccess: () => {
      toast.success("Lageruppgift skapad och placerad i lagerkalendern");
      qc.invalidateQueries({ queryKey: ["project-tasks"] });
      qc.invalidateQueries({ queryKey: ["warehouse-internal-tasks"] });
      qc.invalidateQueries({ queryKey: ["warehouse-calendar-events"] });
      qc.invalidateQueries({ queryKey: ["warehouse-events"] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (err: any) => {
      console.error("Failed to create internal task", err);
      toast.error(err?.message || "Kunde inte skapa uppgift");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Ange en titel");
      return;
    }
    if (!startDate) {
      toast.error("Ange startdatum");
      return;
    }
    if (endDate && endDate < startDate) {
      toast.error("Slutdatum kan inte vara före startdatum");
      return;
    }
    if (startDate === (endDate || startDate) && endTime <= startTime) {
      toast.error("Sluttid måste vara efter starttid");
      return;
    }
    createMutation.mutate();
  };

  const assignedStaffName =
    assignedTo !== "none"
      ? staff.find((s) => s.id === assignedTo)?.name
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa lageruppgift</DialogTitle>
          <DialogDescription>
            Skapas på projektet <strong>Lager</strong> och placeras direkt i
            lagerkalendern. Om du väljer ansvarig läggs uppgiften i samma
            lagerteam som personen är planerad i — annars i nästa lediga
            lagerteam.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titel *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="T.ex. Städa lagret"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beskrivning (valfri)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detaljer om uppgiften..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kategori</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj kategori..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen kategori</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {WAREHOUSE_TASK_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Ansvarig</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj ansvarig..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen vald</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Startdatum *</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!endDate || endDate < e.target.value) {
                    setEndDate(e.target.value);
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Slutdatum</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Starttid</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Sluttid</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          {assignedStaffName && (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{assignedStaffName}</strong>{" "}
              läggs i sitt redan planerade lagerteam för {startDate}. Om hen
              inte är planerad placeras uppgiften i nästa lediga Lager-team.
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Skapar..." : "Skapa uppgift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
