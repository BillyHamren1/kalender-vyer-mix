import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Truck, Package, Users, Wrench, ClipboardCheck, PackageX, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { updateEstablishmentTask } from "@/services/establishmentTaskService";
import {
  fetchSubtasks,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  type EstablishmentSubtask,
} from "@/services/establishmentSubtaskService";
import { toast } from "sonner";

interface TaskInfo {
  id: string;
  title: string;
  category: string;
  startDate: Date;
  endDate: Date;
  completed: boolean;
}

interface StaffMember {
  id: string;
  name: string;
}

interface BookingInfo {
  booking_id: string;
  display_name: string | null;
  client?: string;
}

interface EstablishmentTaskDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskInfo | null;
  bookingId: string | null;
  largeProjectId?: string | null;
  staffPool?: StaffMember[];
  projectBookings?: BookingInfo[];
}

const CATEGORY_COLORS: Record<string, string> = {
  transport: "bg-blue-500",
  material: "bg-amber-500",
  personal: "bg-green-500",
  installation: "bg-purple-500",
  kontroll: "bg-cyan-500",
  demontering: "bg-rose-500",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  transport: Truck,
  material: Package,
  personal: Users,
  installation: Wrench,
  kontroll: ClipboardCheck,
  demontering: PackageX,
};

const EstablishmentTaskDetailSheet = ({
  open,
  onOpenChange,
  task,
  bookingId,
  largeProjectId,
  staffPool,
  projectBookings = [],
}: EstablishmentTaskDetailSheetProps) => {
  const queryClient = useQueryClient();
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<string | null>(null);

  // Fetch staff members - use staffPool if provided and non-empty, otherwise fetch all
  const hasStaffPool = staffPool && staffPool.length > 0;
  const { data: allStaffMembers = [] } = useQuery({
    queryKey: ["staff-members"],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !hasStaffPool,
  });

  const effectiveStaff: StaffMember[] = hasStaffPool ? staffPool : allStaffMembers;

  // Fetch the task's current assigned_to and booking_id from DB
  const { data: taskDbData } = useQuery({
    queryKey: ["establishment-task-detail", task?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("establishment_tasks")
        .select("assigned_to, notes, booking_id")
        .eq("id", task!.id)
        .single();
      return data;
    },
    enabled: !!task?.id && open,
  });

  useEffect(() => {
    if (taskDbData) {
      setTaskAssignedTo(taskDbData.assigned_to);
      setTaskNotes(taskDbData.notes || "");
    }
  }, [taskDbData]);

  // Fetch subtasks for this task
  const { data: subtasks = [], isLoading } = useQuery({
    queryKey: ["establishment-subtasks", bookingId || largeProjectId, task?.id],
    queryFn: () => fetchSubtasks(bookingId!, task!.id),
    enabled: !!bookingId && !!task?.id && open,
  });

  useEffect(() => {
    if (!open) {
      setTaskNotes("");
      setNewSubtaskTitle("");
      setTaskAssignedTo(null);
    }
  }, [open, task?.id]);

  const taskQueryKey = largeProjectId
    ? ['establishment-tasks', 'project', largeProjectId]
    : ['establishment-tasks', bookingId];

  const handleTaskAssignmentChange = async (val: string) => {
    const assignedTo = val === "none" ? null : val;
    setTaskAssignedTo(assignedTo);
    if (task) {
      try {
        await updateEstablishmentTask(task.id, { assigned_to: assignedTo });
        queryClient.invalidateQueries({ queryKey: taskQueryKey });
        toast.success("Tilldelning uppdaterad");
      } catch {
        toast.error("Kunde inte uppdatera tilldelning");
      }
    }
  };

  const handleNotesBlur = async () => {
    if (task && taskDbData && taskNotes !== (taskDbData.notes || "")) {
      try {
        await updateEstablishmentTask(task.id, { notes: taskNotes || null });
        queryClient.invalidateQueries({ queryKey: ["establishment-task-detail", task.id] });
      } catch {
        toast.error("Kunde inte spara anteckningar");
      }
    }
  };

  const addMutation = useMutation({
    mutationFn: (title: string) =>
      createSubtask({
        booking_id: bookingId!,
        parent_task_id: task!.id,
        title,
        sort_order: subtasks.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", bookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", bookingId] });
      setNewSubtaskTitle("");
      toast.success("Delsteg tillagt");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateSubtask>[1] }) =>
      updateSubtask(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", bookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", bookingId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubtask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", bookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", bookingId] });
      toast.success("Delsteg borttaget");
    },
  });

  if (!task) return null;

  const IconComponent = CATEGORY_ICONS[task.category] || Wrench;
  const colorClass = CATEGORY_COLORS[task.category] || "bg-muted";
  const completedCount = subtasks.filter((s) => s.completed).length;

  const handleAddSubtask = () => {
    const title = newSubtaskTitle.trim();
    if (!title || !bookingId) return;
    addMutation.mutate(title);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] sm:max-w-[440px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-md text-white", colorClass)}>
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle className="text-left">{task.title}</SheetTitle>
              <Badge variant="outline" className="mt-1 text-xs capitalize">
                {task.category}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {/* Linked booking info - only in project mode */}
        {largeProjectId && taskDbData?.booking_id && (() => {
          const linked = projectBookings.find(b => b.booking_id === taskDbData.booking_id);
          return linked ? (
            <>
              <div className="py-3">
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Kopplad bokning</h4>
                <Badge variant="secondary" className="text-xs">
                  {linked.display_name || linked.client || linked.booking_id}
                </Badge>
              </div>
              <Separator />
            </>
          ) : null;
        })()}

        {/* Task-level assignment */}
        <div className="py-4 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Tilldelad personal</h4>
          <Select
            value={taskAssignedTo || "none"}
            onValueChange={handleTaskAssignmentChange}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Välj personal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ingen tilldelad</SelectItem>
              {effectiveStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Time section */}
        <div className="py-4 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Tidsperiod</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Start</label>
              <Input
                type="date"
                defaultValue={task.startDate.toISOString().split("T")[0]}
                className="h-9 text-sm"
                readOnly
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Slut</label>
              <Input
                type="date"
                defaultValue={task.endDate.toISOString().split("T")[0]}
                className="h-9 text-sm"
                readOnly
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Subtasks section */}
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-muted-foreground">
              Delsteg {subtasks.length > 0 && `(${completedCount}/${subtasks.length})`}
            </h4>
          </div>

          {/* Progress bar */}
          {subtasks.length > 0 && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all rounded-full"
                style={{ width: `${(completedCount / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          {/* Subtask list */}
          <div className="space-y-1">
            {subtasks.map((subtask) => (
              <div
                key={subtask.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={(checked) =>
                    updateMutation.mutate({
                      id: subtask.id,
                      updates: { completed: !!checked },
                    })
                  }
                />
                <span
                  className={cn(
                    "text-sm flex-1 min-w-0 truncate",
                    subtask.completed && "line-through text-muted-foreground"
                  )}
                >
                  {subtask.title}
                </span>

                {/* Staff assignment */}
                <Select
                  value={subtask.assigned_to || "none"}
                  onValueChange={(val) =>
                    updateMutation.mutate({
                      id: subtask.id,
                      updates: { assigned_to: val === "none" ? null : val },
                    })
                  }
                >
                  <SelectTrigger className="h-7 w-24 text-xs flex-shrink-0">
                    <SelectValue placeholder="Tilldela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {effectiveStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 flex-shrink-0"
                  onClick={() => deleteMutation.mutate(subtask.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Add subtask */}
          {bookingId && (
            <div className="flex gap-2">
              <Input
                placeholder="Nytt delsteg..."
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                className="h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1 flex-shrink-0"
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim() || addMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5" />
                Lägg till
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Notes */}
        <div className="py-4 space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Anteckningar</h4>
          <Textarea
            placeholder="Instruktioner, noteringar..."
            value={taskNotes}
            onChange={(e) => setTaskNotes(e.target.value)}
            onBlur={handleNotesBlur}
            className="min-h-[80px] text-sm resize-none"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EstablishmentTaskDetailSheet;
