import { useState, useEffect, useMemo } from "react";
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
import { updateEstablishmentTask, deleteEstablishmentTask, BSAValidationError } from "@/services/establishmentTaskService";
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
  const [taskAssignedToIds, setTaskAssignedToIds] = useState<string[]>([]);
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
  const [startTimeDraft, setStartTimeDraft] = useState("");
  const [endTimeDraft, setEndTimeDraft] = useState("");

  const effectiveStaff: StaffMember[] = staffPool || [];

  const { data: taskDbData } = useQuery({
    queryKey: ["establishment-task-detail", task?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("establishment_tasks")
        .select("assigned_to, assigned_to_ids, notes, booking_id, source_product_ids, status, readiness, priority, description, blockers, blocker_responsible, decision_needed, title, start_date, end_date, start_time, end_time, updated_at")
        .eq("id", task!.id)
        .single();
      return data;
    },
    enabled: !!task?.id && open,
  });

  // Fetch linked booking products when source_product_ids exist
  const sourceProductIds = taskDbData?.source_product_ids as string[] | null;
  const effectiveBookingId = taskDbData?.booking_id || bookingId;

  const { data: linkedProducts = [] } = useQuery({
    queryKey: ["linked-booking-products", task?.id, sourceProductIds],
    queryFn: async () => {
      if (!sourceProductIds || sourceProductIds.length === 0) return [];
      // Query 1: Fetch explicitly selected products
      const { data: selected } = await supabase
        .from("booking_products")
        .select("id, name, quantity, sku, parent_product_id, is_package_component")
        .in("id", sourceProductIds);
      const selectedProducts = selected || [];
      
      // Query 2: Fetch all children whose parent_product_id points to any selected product
      const parentIds = selectedProducts
        .filter(p => !p.parent_product_id)
        .map(p => p.id);
      
      let childProducts: typeof selectedProducts = [];
      if (parentIds.length > 0) {
        const { data: children } = await supabase
          .from("booking_products")
          .select("id, name, quantity, sku, parent_product_id, is_package_component")
          .in("parent_product_id", parentIds);
        childProducts = children || [];
      }
      
      // Merge and deduplicate
      const allMap = new Map(selectedProducts.map(p => [p.id, p]));
      childProducts.forEach(p => { if (!allMap.has(p.id)) allMap.set(p.id, p); });
      return [...allMap.values()];
    },
    enabled: !!sourceProductIds && sourceProductIds.length > 0 && open,
  });

  // Clean product name: strip hierarchy prefix characters
  const cleanName = (name: string): string => {
    return name
      .replace(/^[└↳⦿]\s*,?\s*/, '')
      .replace(/^L,\s*/, '')
      .replace(/^--\s*[A-Za-z],?\s*/, '')
      .replace(/^[-–—]\s*/, '')
      .replace(/^\s+/, '')
      .trim();
  };

  // Build hierarchical product structure: parents with their accessories
  const productHierarchy = useMemo(() => {
    if (linkedProducts.length === 0) return [];
    
    const productIds = new Set(linkedProducts.map(p => p.id));
    
    // Filter out internal package components (is_package_component: true)
    const visible = linkedProducts.filter(p => !p.is_package_component);
    
    // Parents: no parent_product_id, or parent not in our set
    const parents = visible.filter(p => !p.parent_product_id || !productIds.has(p.parent_product_id));
    // Children/accessories: have parent_product_id pointing to a product in our set
    const children = visible.filter(p => p.parent_product_id && productIds.has(p.parent_product_id));
    
    return parents.map(parent => ({
      ...parent,
      accessories: children.filter(c => c.parent_product_id === parent.id),
    }));
  }, [linkedProducts]);

  // Track checked product IDs locally, persisted via subtasks
  const [checkedProducts, setCheckedProducts] = useState<Set<string>>(new Set());

  // Auto-create subtasks from products if task has source_product_ids but no subtasks yet
  const { data: subtasks = [], isLoading } = useQuery({
    queryKey: ["establishment-subtasks", effectiveBookingId || largeProjectId, task?.id],
    queryFn: () => fetchSubtasks(effectiveBookingId!, task!.id),
    enabled: !!effectiveBookingId && !!task?.id && open,
  });

  // Sync checked state from subtask titles matching product IDs
  useEffect(() => {
    if (subtasks.length > 0 && linkedProducts.length > 0) {
      const checked = new Set<string>();
      subtasks.forEach(st => {
        if (st.completed && st.title) {
          const matchingProduct = linkedProducts.find(p => {
            const raw = p.name;
            const cleaned = cleanName(raw);
            const labelRaw = p.quantity > 1 ? `${raw} x${p.quantity}` : raw;
            const labelClean = p.quantity > 1 ? `${cleaned} x${p.quantity}` : cleaned;
            return st.title === labelRaw || st.title === labelClean || st.title === raw || st.title === cleaned || st.title.startsWith(cleaned);
          });
          if (matchingProduct) checked.add(matchingProduct.id);
        }
      });
      setCheckedProducts(checked);
    } else if (subtasks.length === 0 && checkedProducts.size > 0) {
      setCheckedProducts(new Set());
    }
  }, [subtasks, linkedProducts]);

  useEffect(() => {
    if (taskDbData) {
      const ids = (taskDbData as any).assigned_to_ids as string[] | null;
      setTaskAssignedToIds(ids && ids.length > 0 ? ids : (taskDbData.assigned_to ? [taskDbData.assigned_to] : []));
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
      setStartTimeDraft((taskDbData as any).start_time || "");
      setEndTimeDraft((taskDbData as any).end_time || "");
    }
  }, [taskDbData]);


  useEffect(() => {
    if (!open) {
      setTaskNotes("");
      setNewSubtaskTitle("");
      setTaskAssignedToIds([]);
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
    } catch (err) {
      console.error("handleFieldUpdate failed:", err, "updates:", updates, "taskId:", task.id);
      toast.error("Kunde inte uppdatera");
    }
  };

  const handleToggleStaffAssignment = async (staffId: string) => {
    const newIds = taskAssignedToIds.includes(staffId)
      ? taskAssignedToIds.filter(id => id !== staffId)
      : [...taskAssignedToIds, staffId];
    setTaskAssignedToIds(newIds);
    const primaryAssignee = newIds.length > 0 ? newIds[0] : null;
    await handleFieldUpdate({ assigned_to: primaryAssignee, assigned_to_ids: newIds } as any);
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

  const handleTitleSave = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || !task) return;
    if (trimmed !== (taskDbData?.title || task.title)) {
      await handleFieldUpdate({ title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleStartDateChange = async (val: string) => {
    setStartDateDraft(val);
    if (val) await handleFieldUpdate({ start_date: val });
  };

  const handleEndDateChange = async (val: string) => {
    setEndDateDraft(val);
    if (val) await handleFieldUpdate({ end_date: val });
  };

  const handleStartTimeChange = async (val: string) => {
    setStartTimeDraft(val);
    await handleFieldUpdate({ start_time: val || null } as any);
  };

  const handleEndTimeChange = async (val: string) => {
    setEndTimeDraft(val);
    await handleFieldUpdate({ end_time: val || null } as any);
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
        booking_id: (effectiveBookingId || bookingId)!,
        parent_task_id: task!.id,
        title,
        sort_order: subtasks.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", effectiveBookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", effectiveBookingId] });
      setNewSubtaskTitle("");
      toast.success("Delsteg tillagt");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateSubtask>[1] }) =>
      updateSubtask(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", effectiveBookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", effectiveBookingId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSubtask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", effectiveBookingId || largeProjectId, task?.id] });
      queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", effectiveBookingId] });
      toast.success("Delsteg borttaget");
    },
  });

  if (!task) return null;

  const IconComponent = CATEGORY_ICONS[task.category] || Wrench;
  const colorClass = CATEGORY_COLORS[task.category] || "bg-muted";
  const completedCount = subtasks.filter((s) => s.completed).length;

  const handleAddSubtask = () => {
    const title = newSubtaskTitle.trim();
    if (!title || !effectiveBookingId) return;
    addMutation.mutate(title);
  };

  // Handle checking/unchecking a product in the checklist
  const handleProductCheck = async (productId: string, productName: string, quantity: number, checked: boolean) => {
    if (!effectiveBookingId || !task) return;
    
    const cleaned = cleanName(productName);
    const label = quantity > 1 ? `${cleaned} x${quantity}` : cleaned;
    
    // Find existing subtask for this product
    const existingSubtask = subtasks.find(st => st.title === label || st.title === productName);
    
    if (existingSubtask) {
      // Update existing subtask
      updateMutation.mutate({ id: existingSubtask.id, updates: { completed: checked } });
    } else {
      // Create a new subtask and mark it
      try {
        const created = await createSubtask({
          booking_id: effectiveBookingId,
          parent_task_id: task.id,
          title: label,
          sort_order: subtasks.length,
        });
        if (checked) {
          await updateSubtask(created.id, { completed: true });
        }
        queryClient.invalidateQueries({ queryKey: ["establishment-subtasks", effectiveBookingId || largeProjectId, task.id] });
        queryClient.invalidateQueries({ queryKey: ["establishment-all-subtasks", effectiveBookingId] });
      } catch {
        toast.error("Kunde inte uppdatera checklista");
      }
    }
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
              {editingTitle ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                    className="h-8 text-base font-semibold"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleTitleSave}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <SheetTitle className="text-left cursor-pointer group flex items-center gap-1.5" onClick={() => { setTitleDraft(taskDbData?.title || task.title); setEditingTitle(true); }}>
                  {taskDbData?.title || task.title}
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </SheetTitle>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-xs capitalize">
                  {task.category}
                </Badge>
                {taskDbData?.updated_at && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {format(new Date(taskDbData.updated_at), "d MMM HH:mm", { locale: sv })}
                  </span>
                )}
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

        {/* Product checklist from source_product_ids */}
        {productHierarchy.length > 0 && (
          <>
            <div className="py-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">
                  Produkter ({productHierarchy.reduce((sum, p) => sum + (checkedProducts.has(p.id) ? 1 : 0) + p.accessories.filter(a => checkedProducts.has(a.id)).length, 0)}/{productHierarchy.reduce((sum, p) => sum + 1 + p.accessories.length, 0)})
                </Label>
              </div>

              {(() => {
                const visibleTotal = productHierarchy.reduce((sum, p) => sum + 1 + p.accessories.length, 0);
                const visibleChecked = productHierarchy.reduce((sum, p) => sum + (checkedProducts.has(p.id) ? 1 : 0) + p.accessories.filter(a => checkedProducts.has(a.id)).length, 0);
                return visibleTotal > 0 ? (
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all rounded-full"
                      style={{ width: `${(visibleChecked / visibleTotal) * 100}%` }}
                    />
                  </div>
                ) : null;
              })()}

              <div className="space-y-0.5">
                {productHierarchy.map((parent) => (
                  <div key={parent.id}>
                    {/* Parent product */}
                    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group">
                      <Checkbox
                        checked={checkedProducts.has(parent.id)}
                        onCheckedChange={(checked) => {
                          setCheckedProducts(prev => {
                            const next = new Set(prev);
                            if (checked) next.add(parent.id);
                            else next.delete(parent.id);
                            return next;
                          });
                          // Persist via subtask
                          handleProductCheck(parent.id, parent.name, parent.quantity, !!checked);
                        }}
                      />
                      <span className={cn(
                        "text-sm flex-1 min-w-0",
                        checkedProducts.has(parent.id) && "line-through text-muted-foreground"
                      )}>
                        {cleanName(parent.name)}
                      </span>
                      {parent.quantity > 1 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 flex-shrink-0">
                          x{parent.quantity}
                        </Badge>
                      )}
                      {parent.sku && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">{parent.sku}</span>
                      )}
                    </div>

                    {/* Accessories (children) */}
                    {parent.accessories.length > 0 && (
                      <div className="ml-6 border-l border-border/40 pl-2 space-y-0.5">
                        {parent.accessories.map((acc) => (
                          <div key={acc.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 group">
                            <Checkbox
                              checked={checkedProducts.has(acc.id)}
                              onCheckedChange={(checked) => {
                                setCheckedProducts(prev => {
                                  const next = new Set(prev);
                                  if (checked) next.add(acc.id);
                                  else next.delete(acc.id);
                                  return next;
                                });
                                handleProductCheck(acc.id, acc.name, acc.quantity, !!checked);
                              }}
                            />
                            <span className={cn(
                              "text-xs flex-1 min-w-0 text-muted-foreground",
                              checkedProducts.has(acc.id) && "line-through"
                            )}>
                              • {cleanName(acc.name)}
                            </span>
                            {acc.quantity > 1 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 flex-shrink-0">
                                x{acc.quantity}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <Separator />
          </>
        )}

        <div className="py-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Projektteam ({taskAssignedToIds.length} tilldelade)</Label>
          {effectiveStaff.length > 0 && (
            <p className="text-[10px] text-muted-foreground -mt-1">Bemannade via kalender/planering</p>
          )}
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {effectiveStaff.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted transition-colors text-sm",
                  taskAssignedToIds.includes(s.id) && "bg-primary/10"
                )}
              >
                <Checkbox
                  checked={taskAssignedToIds.includes(s.id)}
                  onCheckedChange={() => handleToggleStaffAssignment(s.id)}
                />
                <span>{s.name}</span>
              </label>
            ))}
            {effectiveStaff.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-1">Ingen personal bemannad på detta projekt. Bemanna via kalendern först.</p>
            )}
          </div>
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
                value={startDateDraft}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Slut</label>
              <Input
                type="date"
                value={endDateDraft}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Starttid
              </label>
              <Input
                type="time"
                step={600}
                value={startTimeDraft}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Sluttid
              </label>
              <Input
                type="time"
                step={600}
                value={endTimeDraft}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className="h-9 text-sm"
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

          {(effectiveBookingId || bookingId) && (
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

        <Separator />

        {/* Delete */}
        <div className="pt-2 pb-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={async () => {
              if (!task) return;
              const confirmed = window.confirm("Vill du radera denna aktivitet? Det går inte att ångra.");
              if (!confirmed) return;
              try {
                await deleteEstablishmentTask(task.id);
                invalidateAll();
                toast.success("Aktivitet raderad");
                onOpenChange(false);
              } catch {
                toast.error("Kunde inte radera aktivitet");
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Radera aktivitet
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EstablishmentTaskDetailSheet;
