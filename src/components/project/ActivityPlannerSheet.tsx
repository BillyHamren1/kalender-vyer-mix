import { useState, useEffect, useMemo } from "react";
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
import { CalendarIcon, Plus, Package, ChevronRight } from "lucide-react";
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

// Categories are now handled by CategoryCombobox

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

  // Attach children
  const attachChildren = (nodes: ProductNode[]) => {
    nodes.forEach(n => {
      n.children = childrenMap.get(n.product.id) || [];
      attachChildren(n.children);
    });
  };
  attachChildren(roots);

  // Also add orphan package components as roots
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("Montering");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [startDate, setStartDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("none");
  const [plannedProductIds, setPlannedProductIds] = useState<Set<string>>(new Set());

  // Manual task
  const [manualTitle, setManualTitle] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const isProjectMode = !!largeProjectId && projectBookings.length > 0;

  const { data: selectedBookingData } = useQuery({
    queryKey: ['establishment-booking-data', selectedBookingId],
    queryFn: () => fetchEstablishmentBookingData(selectedBookingId),
    enabled: isProjectMode && selectedBookingId !== "none",
  });

  const activeProducts = isProjectMode
    ? (selectedBookingData?.products || [])
    : products;

  // Build planned set from existing tasks — match by source_product_ids, source_product_id, and title fallback
  useEffect(() => {
    const planned = new Set<string>();
    existingTasks.forEach(t => {
      // Primary: use the array of all product IDs
      if (t.source_product_ids && t.source_product_ids.length > 0) {
        t.source_product_ids.forEach(id => planned.add(id));
      }
      // Fallback: legacy single product ID
      else if (t.source_product_id) {
        planned.add(t.source_product_id);
      }
    });
    setPlannedProductIds(planned);
  }, [existingTasks]);

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set());
      setSelectedBookingId("none");
      setPriority("medium");
      setManualTitle("");
      setCustomTitle("");
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

  const handleBatchCreate = async () => {
    if (selectedIds.size === 0 || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      const effectiveBookingId = isProjectMode
        ? (selectedBookingId !== "none" ? selectedBookingId : null)
        : (bookingId || null);

      const selectedProducts = activeProducts.filter(p => selectedIds.has(p.id));

      // Use custom title if provided, otherwise build from product names
      const combinedTitle = customTitle.trim() || selectedProducts
        .map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`)
        .join(', ');

      const allProductIds = selectedProducts.map(p => p.id);

      // Create ONE task with the combined title, storing ALL product IDs
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
        source_product_id: allProductIds[0] || null,
        source_product_ids: allProductIds,
        assigned_to: assignedTo,
        priority,
      });

      toast.success("Aktivitet skapad");
      setPlannedProductIds(prev => {
        const next = new Set(prev);
        selectedProducts.forEach(p => next.add(p.id));
        return next;
      });
      setSelectedIds(new Set());
      onTaskCreated();
    } catch (e) {
      toast.error("Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
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
        source: 'manual',
        assigned_to: assignedTo,
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
  };

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
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
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

        {/* Main content: two panels */}
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

          {/* Right: Settings */}
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
                <Select value={assignedTo || "none"} onValueChange={v => setAssignedTo(v === "none" ? null : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Ingen tilldelad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen tilldelad</SelectItem>
                    {staffPool.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

              <Button
                onClick={handleBatchCreate}
                disabled={selectableCount === 0 || !startDate || !endDate || isSubmitting}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Skapa aktivitet{selectableCount > 0 ? ` (${selectableCount} produkter)` : ''}
              </Button>
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
              <Button
                onClick={handleManualSubmit}
                disabled={!manualTitle.trim() || !startDate || !endDate || isSubmitting}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Skapa manuell aktivitet
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityPlannerSheet;
