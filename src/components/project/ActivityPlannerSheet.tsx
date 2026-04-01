import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Package, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import CategoryCombobox from "./CategoryCombobox";
import { cn } from "@/lib/utils";
import { createEstablishmentTask } from "@/services/establishmentTaskService";
import type { TaskPriority } from "@/services/establishmentTaskService";
import { fetchEstablishmentBookingData } from "@/services/establishmentPlanningService";
import type { BookingProduct } from "@/services/establishmentPlanningService";
import { toast } from "sonner";
import type { ProjectBookingInfo } from "./AddEstablishmentTaskDialog";

interface ActivityPlannerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string;
  largeProjectId?: string;
  products: BookingProduct[];
  defaultDate: string | null;
  onTaskCreated: () => void;
  projectBookings?: ProjectBookingInfo[];
  staffPool?: Array<{ id: string; name: string }>;
  existingTasks?: Array<{ source_product_id: string | null; source_product_ids: string[] | null; title?: string }>;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'Hög' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Låg' },
];

interface ProductNode {
  product: BookingProduct;
  children: ProductNode[];
}

function buildProductTree(products: BookingProduct[]): ProductNode[] {
  const byId = new Map<string, BookingProduct>();
  products.forEach(p => byId.set(p.id, p));

  const roots: ProductNode[] = [];
  const childrenMap = new Map<string, ProductNode[]>();

  products.forEach(p => {
    const node: ProductNode = { product: p, children: [] };
    const parentId = p.parentProductId;
    if (parentId && byId.has(parentId)) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(node);
    } else if (!p.isPackageComponent) {
      roots.push(node);
    }
  });

  const attachChildren = (nodes: ProductNode[]) => {
    nodes.forEach(n => {
      n.children = childrenMap.get(n.product.id) || [];
      attachChildren(n.children);
    });
  };
  attachChildren(roots);

  products.forEach(p => {
    if (p.isPackageComponent && (!p.parentProductId || !byId.has(p.parentProductId))) {
      const existing = roots.find(r => r.product.id === p.id);
      if (!existing) {
        roots.push({ product: p, children: childrenMap.get(p.id) || [] });
      }
    }
  });

  return roots;
}

/** A queued activity row ready for batch creation */
interface QueuedActivity {
  id: string; // local unique key
  title: string;
  productIds: string[];
  productNames: string[];
  category: string;
  priority: TaskPriority;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  assignedToIds: string[];
  source: 'product' | 'manual';
}

let _queueId = 0;

const ActivityPlannerSheet = ({
  open,
  onOpenChange,
  bookingId,
  largeProjectId,
  products,
  defaultDate,
  onTaskCreated,
  projectBookings = [],
  staffPool = [],
  existingTasks = [],
}: ActivityPlannerSheetProps) => {
  // --- Booking selector ---
  const [selectedBookingId, setSelectedBookingId] = useState<string>("none");

  // --- Current draft state (for the activity being configured) ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("Montering");
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [startDate, setStartDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [customTitle, setCustomTitle] = useState("");
  const [manualTitle, setManualTitle] = useState("");

  // --- Queue ---
  const [queue, setQueue] = useState<QueuedActivity[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plannedProductIds, setPlannedProductIds] = useState<Set<string>>(new Set());
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  const isProjectMode = !!largeProjectId && projectBookings.length > 0;

  const { data: selectedBookingData } = useQuery({
    queryKey: ['establishment-booking-data', selectedBookingId],
    queryFn: () => fetchEstablishmentBookingData(selectedBookingId),
    enabled: isProjectMode && selectedBookingId !== "none",
  });

  const activeProducts = isProjectMode
    ? (selectedBookingData?.products || [])
    : products;

  // Build planned set from existing tasks + queued activities
  useEffect(() => {
    const planned = new Set<string>();
    existingTasks.forEach(t => {
      if (t.source_product_ids && t.source_product_ids.length > 0) {
        t.source_product_ids.forEach(id => planned.add(id));
      } else if (t.source_product_id) {
        planned.add(t.source_product_id);
      }
    });
    // Also mark products already in the queue as planned
    queue.forEach(q => q.productIds.forEach(id => planned.add(id)));
    setPlannedProductIds(planned);
  }, [existingTasks, queue]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSelectedBookingId("none");
      setPriority("medium");
      setManualTitle("");
      setCustomTitle("");
      setAssignedToIds([]);
      setQueue([]);
      setQueueCollapsed(false);
    }
  }, [open]);

  const productTree = useMemo(() => buildProductTree(activeProducts), [activeProducts]);

  const toggleProduct = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleParentWithChildren = (node: ProductNode) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allIds = [node.product.id, ...node.children.map(c => c.product.id)];
      const allSelected = allIds.every(id => next.has(id) || plannedProductIds.has(id));
      allIds.forEach(id => {
        if (!plannedProductIds.has(id)) {
          if (allSelected) next.delete(id); else next.add(id);
        }
      });
      return next;
    });
  };

  const resetDraft = useCallback(() => {
    setSelectedIds(new Set());
    setCustomTitle("");
    setManualTitle("");
    setAssignedToIds([]);
    setCategory("Montering");
    setPriority("medium");
  }, []);

  /** Add the current product-based draft to the queue */
  const handleAddToQueue = useCallback(() => {
    if (selectedIds.size === 0 || !startDate || !endDate) return;

    const selectedProducts = activeProducts.filter(p => selectedIds.has(p.id));
    const title = customTitle.trim() || selectedProducts
      .map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`)
      .join(', ');

    const entry: QueuedActivity = {
      id: `q-${++_queueId}`,
      title,
      productIds: selectedProducts.map(p => p.id),
      productNames: selectedProducts.map(p => p.name),
      category,
      priority,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      startTime,
      endTime,
      assignedToIds: [...assignedToIds],
      source: 'product',
    };

    setQueue(prev => [...prev, entry]);
    resetDraft();
    toast.success("Aktivitet tillagd i kö");
  }, [selectedIds, startDate, endDate, customTitle, activeProducts, category, priority, startTime, endTime, assignedToIds, resetDraft]);

  /** Add a manual activity to the queue */
  const handleAddManualToQueue = useCallback(() => {
    if (!manualTitle.trim() || !startDate || !endDate) return;

    const entry: QueuedActivity = {
      id: `q-${++_queueId}`,
      title: manualTitle.trim(),
      productIds: [],
      productNames: [],
      category,
      priority,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      startTime,
      endTime,
      assignedToIds: [...assignedToIds],
      source: 'manual',
    };

    setQueue(prev => [...prev, entry]);
    setManualTitle("");
    toast.success("Manuell aktivitet tillagd i kö");
  }, [manualTitle, startDate, endDate, category, priority, startTime, endTime, assignedToIds]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  /** Save all queued activities at once */
  const handleSaveAll = useCallback(async () => {
    if (queue.length === 0) return;
    setIsSubmitting(true);

    const effectiveBookingId = isProjectMode
      ? (selectedBookingId !== "none" ? selectedBookingId : null)
      : (bookingId || null);

    let successCount = 0;
    let errorCount = 0;

    for (const item of queue) {
      try {
        await createEstablishmentTask({
          booking_id: effectiveBookingId,
          large_project_id: largeProjectId || null,
          title: item.title,
          category: item.category,
          start_date: item.startDate,
          end_date: item.endDate,
          start_time: item.startTime || null,
          end_time: item.endTime || null,
          source: item.source,
          source_product_id: item.productIds[0] || null,
          source_product_ids: item.productIds.length > 0 ? item.productIds : undefined,
          assigned_to: item.assignedToIds[0] || null,
          assigned_to_ids: item.assignedToIds,
          priority: item.priority,
        });
        successCount++;
      } catch (e) {
        console.error('[ActivityPlanner] Failed to create task:', item.title, e);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      toast.success(`${successCount} aktivitet(er) skapade`);
    } else {
      toast.warning(`${successCount} skapade, ${errorCount} misslyckades`);
    }

    setQueue([]);
    onTaskCreated();
    setIsSubmitting(false);
  }, [queue, isProjectMode, selectedBookingId, bookingId, largeProjectId, onTaskCreated]);

  /** Direct create (single activity, no queue) – for quick one-off use */
  const handleDirectCreate = useCallback(async () => {
    if (selectedIds.size === 0 || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      const effectiveBookingId = isProjectMode
        ? (selectedBookingId !== "none" ? selectedBookingId : null)
        : (bookingId || null);

      const selectedProducts = activeProducts.filter(p => selectedIds.has(p.id));
      const combinedTitle = customTitle.trim() || selectedProducts
        .map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`)
        .join(', ');

      await createEstablishmentTask({
        booking_id: effectiveBookingId,
        large_project_id: largeProjectId || null,
        title: combinedTitle,
        category,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        start_time: startTime || null,
        end_time: endTime || null,
        source: 'product',
        source_product_id: selectedProducts[0]?.id || null,
        source_product_ids: selectedProducts.map(p => p.id),
        assigned_to: assignedToIds[0] || null,
        assigned_to_ids: assignedToIds,
        priority,
      });

      toast.success("Aktivitet skapad");
      setPlannedProductIds(prev => {
        const next = new Set(prev);
        selectedProducts.forEach(p => next.add(p.id));
        return next;
      });
      resetDraft();
      onTaskCreated();
    } catch (e) {
      toast.error("Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIds, startDate, endDate, customTitle, activeProducts, isProjectMode, selectedBookingId, bookingId, largeProjectId, category, startTime, endTime, assignedToIds, priority, resetDraft, onTaskCreated]);

  const handleDirectManualCreate = useCallback(async () => {
    if (!manualTitle.trim() || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      const effectiveBookingId = isProjectMode
        ? (selectedBookingId !== "none" ? selectedBookingId : null)
        : (bookingId || null);

      await createEstablishmentTask({
        booking_id: effectiveBookingId,
        large_project_id: largeProjectId || null,
        title: manualTitle.trim(),
        category,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        start_time: startTime || null,
        end_time: endTime || null,
        source: 'manual',
        assigned_to: assignedToIds[0] || null,
        assigned_to_ids: assignedToIds,
        priority,
      });
      toast.success("Aktivitet skapad");
      setManualTitle("");
      onTaskCreated();
    } catch (e) {
      toast.error("Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  }, [manualTitle, startDate, endDate, isProjectMode, selectedBookingId, bookingId, largeProjectId, category, startTime, endTime, assignedToIds, priority, onTaskCreated]);

  const renderProductNode = (node: ProductNode, depth: number = 0) => {
    const isPlanned = plannedProductIds.has(node.product.id);
    const isSelected = selectedIds.has(node.product.id);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.product.id}>
        <label
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent/50",
            isPlanned && "opacity-50",
            depth > 0 && "ml-6 border-l-2 border-border pl-3"
          )}
        >
          <Checkbox
            checked={isPlanned || isSelected}
            disabled={isPlanned}
            onCheckedChange={() => {
              if (hasChildren && depth === 0) {
                toggleParentWithChildren(node);
              } else {
                toggleProduct(node.product.id);
              }
            }}
          />
          <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className={cn(
            "flex-1 text-sm truncate",
            isPlanned && "line-through text-muted-foreground"
          )}>
            {depth > 0 && "• "}{node.product.name}
          </span>
          {node.product.quantity > 1 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              x{node.product.quantity}
            </span>
          )}
          {isPlanned && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Planerad
            </span>
          )}
        </label>
        {node.children.map(child => renderProductNode(child, depth + 1))}
      </div>
    );
  };

  const selectableCount = selectedIds.size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] max-h-[85vh] p-0 flex flex-col [&>button]:hidden inset-x-4 bottom-4 rounded-2xl border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <SheetTitle className="text-lg font-semibold">Planera aktiviteter</SheetTitle>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full font-medium">
                {queue.length} i kö
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Stäng
            </Button>
          </div>
        </div>

        {/* Booking selector for project mode */}
        {isProjectMode && (
          <div className="px-6 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3 max-w-md">
              <Label className="text-sm whitespace-nowrap">Bokning:</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Välj bokning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen specifik bokning</SelectItem>
                  {projectBookings.map((b) => (
                    <SelectItem key={b.booking_id} value={b.booking_id}>
                      {b.display_name || b.client || b.booking_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 overflow-hidden">
          {/* Left: Product list */}
          <div className="md:col-span-3 border-r border-border flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Produkter från bokningen
              </h3>
              {selectableCount > 0 && (
                <p className="text-xs text-primary mt-0.5">
                  {selectableCount} produkt(er) valda
                </p>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {productTree.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  {isProjectMode && selectedBookingId === "none"
                    ? "Välj en bokning för att se produkter"
                    : "Inga produkter hittades"}
                </p>
              ) : (
                productTree.map(node => renderProductNode(node))
              )}
            </div>
          </div>

          {/* Right: Settings + Queue */}
          <div className="md:col-span-2 flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Inställningar
              </h3>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Startdatum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {startDate ? format(startDate, 'yyyy-MM-dd') : 'Välj'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(d) => { setStartDate(d); if (!endDate || (d && d > endDate)) setEndDate(d); }}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Slutdatum</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {endDate ? format(endDate, 'yyyy-MM-dd') : 'Välj'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Starttid</Label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Sluttid</Label>
                  <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Kategori</Label>
                <CategoryCombobox value={category} onValueChange={setCategory} />
              </div>

              <div>
                <Label className="text-xs">Prioritet</Label>
                <Select value={priority} onValueChange={v => setPriority(v as TaskPriority)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Tilldela personal</Label>
                <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border p-1.5 space-y-0.5">
                  {staffPool.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-2 py-1">Ingen personal tillgänglig</p>
                  ) : (
                    staffPool.map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={assignedToIds.includes(s.id)}
                          onCheckedChange={(checked) => {
                            setAssignedToIds(prev =>
                              checked ? [...prev, s.id] : prev.filter(id => id !== s.id)
                            );
                          }}
                        />
                        <span className="truncate">{s.name}</span>
                      </label>
                    ))
                  )}
                </div>
                {assignedToIds.length > 0 && (
                  <p className="text-[10px] text-primary mt-1">{assignedToIds.length} person(er) valda</p>
                )}
              </div>

              <div>
                <Label className="text-xs">Aktivitetsnamn (valfritt)</Label>
                <Input
                  value={customTitle}
                  onChange={e => setCustomTitle(e.target.value)}
                  placeholder="Lämna tomt för automatiskt namn"
                  className="h-8 text-sm"
                />
              </div>

              <p className="text-[10px] text-muted-foreground">
                Nya aktiviteter skapas som "Ej startad" med beredskap "Saknar information"
              </p>

              {/* Action buttons: Add to queue OR create directly */}
              <div className="flex gap-2">
                <Button
                  onClick={handleAddToQueue}
                  disabled={selectableCount === 0 || !startDate || !endDate || isSubmitting}
                  variant="outline"
                  className="flex-1"
                  size="sm"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Lägg i kö
                </Button>
                <Button
                  onClick={handleDirectCreate}
                  disabled={selectableCount === 0 || !startDate || !endDate || isSubmitting}
                  className="flex-1"
                  size="sm"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Skapa direkt
                </Button>
              </div>
            </div>

            {/* Manual section */}
            <div className="border-t border-border p-4 space-y-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Manuell aktivitet
              </h4>
              <Input
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                placeholder="Ex: Montering tält"
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleAddManualToQueue}
                  disabled={!manualTitle.trim() || !startDate || !endDate || isSubmitting}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Lägg i kö
                </Button>
                <Button
                  onClick={handleDirectManualCreate}
                  disabled={!manualTitle.trim() || !startDate || !endDate || isSubmitting}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Skapa direkt
                </Button>
              </div>
            </div>

            {/* Queue section */}
            {queue.length > 0 && (
              <div className="border-t-2 border-primary/30 bg-primary/5">
                <button
                  onClick={() => setQueueCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/10 transition-colors"
                >
                  <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
                    Aktivitetskö
                    <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full">
                      {queue.length}
                    </span>
                  </h4>
                  {queueCollapsed ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronUp className="h-4 w-4 text-primary" />}
                </button>

                {!queueCollapsed && (
                  <div className="px-4 pb-3 space-y-2">
                    {queue.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 bg-background rounded-md border border-border p-2"
                      >
                        <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {item.category} • {item.startDate} → {item.endDate}
                            {item.assignedToIds.length > 0 && ` • ${item.assignedToIds.length} person(er)`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeFromQueue(item.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      onClick={handleSaveAll}
                      disabled={isSubmitting}
                      className="w-full mt-2"
                    >
                      {isSubmitting
                        ? "Skapar..."
                        : `Skapa alla ${queue.length} aktivitet(er)`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityPlannerSheet;
