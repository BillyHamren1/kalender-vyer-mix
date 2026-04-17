import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("none");
  const [category, setCategory] = useState<string>("none");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

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
      setTitle("");
      setDescription("");
      setAssignedTo("none");
      setCategory("none");
      setStartDate("");
      setEndDate("");
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async () =>
      createInternalWarehouseTask({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo !== "none" ? assignedTo : null,
        category: category !== "none" ? category : null,
        start_date: startDate || null,
        end_date: endDate || startDate || null,
      }),
    onSuccess: () => {
      toast.success("Lageruppgift skapad på projektet Lager");
      qc.invalidateQueries({ queryKey: ["project-tasks"] });
      qc.invalidateQueries({ queryKey: ["warehouse-internal-tasks"] });
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
    if (startDate && endDate && endDate < startDate) {
      toast.error("Slutdatum kan inte vara före startdatum");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Skapa lageruppgift</DialogTitle>
          <DialogDescription>
            Internt arbete som loggas på projektet <strong>Lager</strong> – t.ex.
            städa, tvätta, inköp eller planering. Datum är valfria.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titel</Label>
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
              rows={3}
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
              <Label htmlFor="startDate">Startdatum (valfritt)</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Slutdatum (valfritt)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
