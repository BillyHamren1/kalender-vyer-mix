import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Truck, Package, Users, Wrench, ClipboardCheck, PackageX, GripVertical, AlertTriangle, Pencil, Check, Clock } from "lucide-react";
import TaskCommentThread from "./planning/TaskCommentThread";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { updateEstablishmentTask } from "@/services/establishmentTaskService";
import type { TaskStatus, TaskReadiness, TaskPriority } from "@/services/establishmentTaskService";
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

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "Ej startad" },
  { value: "in_progress", label: "Pågår" },
  { value: "blocked", label: "Blockerad" },
  { value: "done", label: "Klar" },
  { value: "cancelled", label: "Avbruten" },
];

const READINESS_OPTIONS: { value: TaskReadiness; label: string }[] = [
  { value: "ready", label: "Redo" },
  { value: "missing_information", label: "Saknar information" },
  { value: "waiting_for_decision", label: "Väntar på beslut" },
  { value: "waiting_for_external", label: "Väntar på extern" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "Hög" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Låg" },
];

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
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("not_started");
  const [taskReadiness, setTaskReadiness] = useState<TaskReadiness>("missing_information");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskBlockers, setTaskBlockers] = useState("");
  const [taskBlockerResponsible, setTaskBlockerResponsible] = useState<string | null>(null);
  const [taskDecisionNeeded, setTaskDecisionNeeded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [startDateDraft, setStartDateDraft] = useState("");
  const [endDateDraft, setEndDateDraft] = useState("");

  const effectiveStaff: StaffMember[] = staffPool || [];

  const { data: taskDbData } = useQuery({
    queryKey: ["establishment-task-detail", task?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("establishment_tasks")
        .select("assigned_to, notes, booking_id, status, readiness, priority, description, blockers, blocker_responsible, decision_needed, title, start_date, end_date, updated_at")
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
      setTaskStatus((taskDbData.status as TaskStatus) || "not_started");
      setTaskReadiness((taskDbData.readiness as TaskReadiness) || "missing_information");
      setTaskPriority((taskDbData.priority as TaskPriority) || "medium");
      setTaskDescription(taskDbData.description || "");
      setTaskBlockers(taskDbData.blockers || "");
      setTaskBlockerResponsible(taskDbData.blocker_responsible || null);
      setTaskDecisionNeeded(taskDbData.decision_needed || false);
      setTitleDraft(taskDbData.title || task?.title || "");
      setStartDateDraft(taskDbData.start_date || "");
      setEndDateDraft(taskDbData.end_date || "");
    }
  }, [taskDbData]);

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
      setTaskDescription("");
      setTaskBlockers("");
      setTaskBlockerResponsible(null);
      setTaskDecisionNeeded(false);
      setEditingTitle(false);
    }
  }, [open, task?.id]);

  const taskQueryKey = largeProjectId
    ? ['establishment-tasks', 'project', largeProjectId]
    : ['establishment-tasks', bookingId];

  const analyticsQueryKey = ["establishment-tasks-analytics", largeProjectId];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: taskQueryKey });
    queryClient.invalidateQueries({ queryKey: analyticsQueryKey });
    queryClient.invalidateQueries({ queryKey: ["establishment-task-detail", task?.id] });
  };

  const handleFieldUpdate = async (updates: Parameters<typeof updateEstablishmentTask>[1]) => {
    if (!task) return;
    try {
      await updateEstablishmentTask(task.id, updates);
      invalidateAll();
    } catch {
      toast.error("Kunde inte uppdatera");
    }
  };

  const handleTaskAssignmentChange = async (val: string) => {
    const assignedTo = val === "none" ? null : val;
    setTaskAssignedTo(assignedTo);
    await handleFieldUpdate({ assigned_to: assignedTo });
  };

  const handleStatusChange = async (val: string) => {
    const status = val as TaskStatus;
    setTaskStatus(status);
    await handleFieldUpdate({ status });
  };

  const handleReadinessChange = async (val: string) => {
    const readiness = val as TaskReadiness;
    setTaskReadiness(readiness);
    await handleFieldUpdate({ readiness });
  };

  const handlePriorityChange = async (val: string) => {
    const priority = val as TaskPriority;
    setTaskPriority(priority);
    await handleFieldUpdate({ priority });
  };

  const handleDecisionNeededChange = async (checked: boolean) => {
    setTaskDecisionNeeded(checked);
    await handleFieldUpdate({ decision_needed: checked });
  };

  const handleNotesBlur = async () => {
    if (task && taskDbData && taskNotes !== (taskDbData.notes || "")) {
      await handleFieldUpdate({ notes: taskNotes || null });
    }
  };

  const handleDescriptionBlur = async () => {
    if (task && taskDbData && taskDescription !== (taskDbData.description || "")) {
      await handleFieldUpdate({ description: taskDescription || null });
    }
  };

  const handleBlockersBlur = async () => {
    if (task && taskDbData && taskBlockers !== (taskDbData.blockers || "")) {
      await handleFieldUpdate({ blockers: taskBlockers || null });
    }
  };

  const handleBlockerResponsibleChange = async (val: string) => {
    const responsible = val === "none" ? null : val;
    setTaskBlockerResponsible(responsible);
    await handleFieldUpdate({ blocker_responsible: responsible });
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
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-md text-white", colorClass)}>
              <IconComponent className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left">{task.title}</SheetTitle>
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {task.category}
                </Badge>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Separator />

        {/* Status, Readiness, Priority — always visible */}
        <div className="py-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={taskStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Beredskap</Label>
              <Select value={taskReadiness} onValueChange={handleReadinessChange}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {READINESS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Prioritet</Label>
              <Select value={taskPriority} onValueChange={handlePriorityChange}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Beslut krävs</Label>
            <Switch checked={taskDecisionNeeded} onCheckedChange={handleDecisionNeededChange} />
          </div>
        </div>

        <Separator />

        {/* Linked booking info */}
        {largeProjectId && taskDbData?.booking_id && (() => {
          const linked = projectBookings.find(b => b.booking_id === taskDbData.booking_id);
          return linked ? (
            <>
              <div className="py-3">
                <Label className="text-xs text-muted-foreground">Kopplad bokning</Label>
                <Badge variant="secondary" className="text-xs mt-1 block w-fit">
                  {linked.display_name || linked.client || linked.booking_id}
                </Badge>
              </div>
              <Separator />
            </>
          ) : null;
        })()}

        {/* Assignment */}
        <div className="py-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Tilldelad personal</Label>
          <Select value={taskAssignedTo || "none"} onValueChange={handleTaskAssignmentChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Välj personal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ingen tilldelad</SelectItem>
              {effectiveStaff.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Time section */}
        <div className="py-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Tidsperiod</Label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Start</label>
              <Input
                type="date"
                defaultValue={task.startDate.toISOString().split("T")[0]}
                className="h-9 text-sm"
                readOnly
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Slut</label>
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

        {/* Description */}
        <div className="py-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Beskrivning</Label>
          <Textarea
            placeholder="Beskriv aktiviteten..."
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            className="min-h-[60px] text-sm resize-none"
          />
        </div>

        <Separator />

        {/* Blockers */}
        <div className="py-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <Label className="text-xs text-muted-foreground">Blockeringar</Label>
          </div>
          <Textarea
            placeholder="Beskriv vad som blockerar..."
            value={taskBlockers}
            onChange={(e) => setTaskBlockers(e.target.value)}
            onBlur={handleBlockersBlur}
            className="min-h-[50px] text-sm resize-none"
          />
          <div>
            <label className="text-[11px] text-muted-foreground">Ansvarig för blockering</label>
            <Select value={taskBlockerResponsible || "none"} onValueChange={handleBlockerResponsibleChange}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder="Välj ansvarig" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen vald</SelectItem>
                {effectiveStaff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Subtasks section */}
        <div className="py-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Delsteg {subtasks.length > 0 && `(${completedCount}/${subtasks.length})`}
            </Label>
          </div>

          {subtasks.length > 0 && (
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all rounded-full"
                style={{ width: `${(completedCount / subtasks.length) * 100}%` }}
              />
            </div>
          )}

          <div className="space-y-1">
            {subtasks.map((subtask) => (
              <div key={subtask.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={(checked) =>
                    updateMutation.mutate({ id: subtask.id, updates: { completed: !!checked } })
                  }
                />
                <span className={cn("text-sm flex-1 min-w-0 truncate", subtask.completed && "line-through text-muted-foreground")}>
                  {subtask.title}
                </span>
                <Select
                  value={subtask.assigned_to || "none"}
                  onValueChange={(val) =>
                    updateMutation.mutate({ id: subtask.id, updates: { assigned_to: val === "none" ? null : val } })
                  }
                >
                  <SelectTrigger className="h-7 w-24 text-xs flex-shrink-0">
                    <SelectValue placeholder="Tilldela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    {effectiveStaff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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

        {/* Comments thread */}
        <div className="py-3">
          <TaskCommentThread taskId={task.id} staffPool={effectiveStaff} />
        </div>

        <Separator />

        {/* Notes */}
        <div className="py-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Anteckningar</Label>
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
