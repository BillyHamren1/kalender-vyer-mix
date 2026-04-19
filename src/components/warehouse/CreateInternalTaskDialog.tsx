import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, ChevronDown, X } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createInternalWarehouseTask } from "@/services/warehouseProjectService";
import {
  WAREHOUSE_TASK_CATEGORY_LABELS,
  WarehouseTaskCategory,
} from "@/types/warehouseProject";
import { cn } from "@/lib/utils";

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
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string>("none");
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [startTime, setStartTime] = useState<string>("08:00");
  const [endTime, setEndTime] = useState<string>("11:00");
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);

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
      setAssignedIds([]);
      setCategory("none");
      setStartDate(t);
      setEndDate(t);
      setStartTime("08:00");
      setEndTime("11:00");
    }
  }, [open]);

  const toggleAssignee = (id: string) => {
    setAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const removeAssignee = (id: string) => {
    setAssignedIds((prev) => prev.filter((x) => x !== id));
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createInternalWarehouseTask({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to_ids: assignedIds.length > 0 ? assignedIds : null,
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

  const selectedStaff = staff.filter((s) => assignedIds.includes(s.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Skapa lageruppgift</DialogTitle>
          <DialogDescription>
            Skapas på projektet <strong>Lager</strong> och placeras direkt i
            lagerkalendern. Tilldela en eller flera personer — varje person
            hamnar i sitt redan planerade lagerteam (eller nästa lediga).
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

          <div className="space-y-2">
            <Label>Tilldela personal</Label>
            <Popover open={staffPickerOpen} onOpenChange={setStaffPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal focus-visible:ring-warehouse focus-visible:ring-offset-0"
                >
                  <span className="text-muted-foreground">
                    {assignedIds.length === 0
                      ? "Välj en eller flera..."
                      : `${assignedIds.length} ${assignedIds.length === 1 ? "person vald" : "personer valda"}`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <ScrollArea className="max-h-64">
                  <div className="p-1">
                    {staff.length === 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        Ingen aktiv personal
                      </div>
                    )}
                    {staff.map((s) => {
                      const checked = assignedIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleAssignee(s.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                            "hover:bg-accent hover:text-accent-foreground",
                            checked && "bg-accent/40"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded-sm border",
                              checked
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-input"
                            )}
                          >
                            {checked && <Check className="h-3 w-3" />}
                          </div>
                          <span className="flex-1 text-left">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {selectedStaff.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedStaff.map((s) => (
                  <Badge
                    key={s.id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {s.name}
                    <button
                      type="button"
                      onClick={() => removeAssignee(s.id)}
                      className="ml-0.5 rounded-sm hover:bg-background/50 p-0.5"
                      aria-label={`Ta bort ${s.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

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
