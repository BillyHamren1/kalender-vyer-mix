import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CalendarIcon, Plus, Package, Trash2, Copy, SplitSquareHorizontal, Minimize2 } from "lucide-react";
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
  bookingName?: string;
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
      if (!roots.find(r => r.product.id === p.id)) {
        roots.push({ product: p, children: childrenMap.get(p.id) || [] });
      }
    }
  });
  return roots;
}

/** An activity row in the multi-row builder */
interface ActivityRow {
  id: string;
  title: string;
  category: string;
  priority: TaskPriority;
  startDate: Date | undefined;
  endDate: Date | undefined;
  startTime: string;
  endTime: string;
  assignedToIds: string[];
  notes: string;
  productIds: string[];
  /** Maps real product ID → how many units assigned to this row (for split products) */
  productQuantities: Record<string, number>;
  source: 'product' | 'manual';
}

/** Parse a virtual unit ID like "abc__unit_3" → { realId: "abc", unitIndex: 3 } */
function parseVirtualId(id: string): { realId: string; unitIndex: number } | null {
  const match = id.match(/^(.+)__unit_(\d+)$/);
  if (!match) return null;
  return { realId: match[1], unitIndex: parseInt(match[2], 10) };
}

/** Get the real product ID from a possibly virtual ID */
function getRealProductId(id: string): string {
  const parsed = parseVirtualId(id);
  return parsed ? parsed.realId : id;
}

let _rowId = 0;
function makeRowId() { return `row-${++_rowId}`; }

function createEmptyRow(defaults: { startDate?: Date; endDate?: Date }): ActivityRow {
  return {
    id: makeRowId(),
    title: "",
    category: "Montering",
    priority: "medium",
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    startTime: "08:00",
    endTime: "16:00",
    assignedToIds: [],
    notes: "",
    productIds: [],
    productQuantities: {},
    source: 'manual',
  };
}

/** Preset templates for common activity workflows */
const ACTIVITY_TEMPLATES: { label: string; rows: Array<{ title: string; category: string; startTime: string; endTime: string }> }[] = [
  {
    label: 'Komplett rigg-flöde',
    rows: [
      { title: 'Lastning', category: 'transport', startTime: '07:00', endTime: '09:00' },
      { title: 'Transport', category: 'transport', startTime: '09:00', endTime: '11:00' },
      { title: 'Montering', category: 'installation', startTime: '11:00', endTime: '17:00' },
      { title: 'Platsansvar', category: 'kontroll', startTime: '08:00', endTime: '17:00' },
      { title: 'Rivning', category: 'installation', startTime: '08:00', endTime: '14:00' },
    ],
  },
  {
    label: 'Leverans & montering',
    rows: [
      { title: 'Transport', category: 'transport', startTime: '07:00', endTime: '10:00' },
      { title: 'Montering', category: 'installation', startTime: '10:00', endTime: '17:00' },
    ],
  },
  {
    label: 'Montering & rivning',
    rows: [
      { title: 'Montering', category: 'installation', startTime: '08:00', endTime: '16:00' },
      { title: 'Rivning', category: 'installation', startTime: '08:00', endTime: '14:00' },
    ],
  },
];

const ActivityPlannerSheet = ({
  open,
  onOpenChange,
  bookingId,
  bookingName,
  largeProjectId,
  products,
  defaultDate,
  onTaskCreated,
  projectBookings = [],
  staffPool = [],
  existingTasks = [],
}: ActivityPlannerSheetProps) => {
  const [selectedBookingId, setSelectedBookingId] = useState<string>("none");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plannedProductIds, setPlannedProductIds] = useState<Set<string>>(new Set());
  const [showTemplates, setShowTemplates] = useState(true);

  // Product-selection state (for attaching products to a specific row)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [attachingToRowId, setAttachingToRowId] = useState<string | null>(null);
  // Track which products are split into individual unit rows
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());

  const defaultDateObj = defaultDate ? new Date(defaultDate) : undefined;

  // Multi-row builder
  const [rows, setRows] = useState<ActivityRow[]>([
    createEmptyRow({ startDate: defaultDateObj, endDate: defaultDateObj }),
  ]);

  const isProjectMode = !!largeProjectId && projectBookings.length > 0;

  const { data: selectedBookingData } = useQuery({
    queryKey: ['establishment-booking-data', selectedBookingId],
    queryFn: () => fetchEstablishmentBookingData(selectedBookingId),
    enabled: isProjectMode && selectedBookingId !== "none",
  });

  const activeProducts = isProjectMode
    ? (selectedBookingData?.products || [])
    : products;

  useEffect(() => {
    const planned = new Set<string>();
    existingTasks.forEach(t => {
      if (t.source_product_ids?.length) t.source_product_ids.forEach(id => planned.add(id));
      else if (t.source_product_id) planned.add(t.source_product_id);
    });
    // Don't include queue rows – allow same product on multiple activities
    setPlannedProductIds(planned);
  }, [existingTasks]);

  useEffect(() => {
    if (!open) {
      _rowId = 0;
      setSelectedBookingId("none");
      setSelectedIds(new Set());
      setAttachingToRowId(null);
      setExpandedProductIds(new Set());
      setShowTemplates(true);
      setRows([createEmptyRow({ startDate: defaultDateObj, endDate: defaultDateObj })]);
    }
  }, [open]);

  const applyTemplate = useCallback((template: typeof ACTIVITY_TEMPLATES[number]) => {
    const newRows = template.rows.map(t => ({
      ...createEmptyRow({ startDate: defaultDateObj, endDate: defaultDateObj }),
      title: t.title,
      category: t.category,
      startTime: t.startTime,
      endTime: t.endTime,
    }));
    setRows(newRows);
    setShowTemplates(false);
  }, [defaultDateObj]);

  const productTree = useMemo(() => buildProductTree(activeProducts), [activeProducts]);

  // --- Row CRUD ---
  const updateRow = useCallback((rowId: string, patch: Partial<ActivityRow>) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...patch } : r));
  }, []);

  const addRow = useCallback(() => {
    // Copy dates from last row as sensible default
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, createEmptyRow({
      startDate: last?.startDate,
      endDate: last?.endDate,
    })]);
  }, [rows]);

  const removeRow = useCallback((rowId: string) => {
    setRows(prev => {
      const next = prev.filter(r => r.id !== rowId);
      return next.length === 0
        ? [createEmptyRow({ startDate: defaultDateObj, endDate: defaultDateObj })]
        : next;
    });
  }, []);

  const duplicateRow = useCallback((rowId: string) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const clone: ActivityRow = { ...prev[idx], id: makeRowId(), productIds: [...prev[idx].productIds], assignedToIds: [...prev[idx].assignedToIds], productQuantities: { ...prev[idx].productQuantities } };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
  }, []);

  // --- Product attachment ---
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

  const attachProductsToRow = useCallback(() => {
    if (!attachingToRowId || selectedIds.size === 0) return;
    const prodIds = Array.from(selectedIds);
    const prodNames = activeProducts
      .filter(p => selectedIds.has(p.id))
      .map(p => `${p.name}${p.quantity > 1 ? ` x${p.quantity}` : ''}`);

    setRows(prev => prev.map(r => {
      if (r.id !== attachingToRowId) return r;
      const merged = [...new Set([...r.productIds, ...prodIds])];
      const autoTitle = r.title || prodNames.join(', ');
      return { ...r, productIds: merged, source: 'product', title: autoTitle };
    }));
    setSelectedIds(new Set());
    setAttachingToRowId(null);
    toast.success(`${prodIds.length} produkt(er) kopplade`);
  }, [attachingToRowId, selectedIds, activeProducts]);

  // --- Save all rows ---
  const validRows = rows.filter(r => r.title.trim() && r.startDate && r.endDate);

  const handleSaveAll = useCallback(async () => {
    if (validRows.length === 0) return;
    setIsSubmitting(true);

    const effectiveBookingId = isProjectMode
      ? (selectedBookingId !== "none" ? selectedBookingId : null)
      : (bookingId || null);

    let ok = 0, fail = 0;
    for (const row of validRows) {
      try {
        await createEstablishmentTask({
          booking_id: effectiveBookingId,
          large_project_id: largeProjectId || null,
          title: row.title.trim(),
          category: row.category,
          start_date: format(row.startDate!, 'yyyy-MM-dd'),
          end_date: format(row.endDate!, 'yyyy-MM-dd'),
          start_time: row.startTime || null,
          end_time: row.endTime || null,
          source: row.source,
          source_product_id: row.productIds[0] || null,
          source_product_ids: row.productIds.length > 0 ? row.productIds : undefined,
          assigned_to: row.assignedToIds[0] || null,
          assigned_to_ids: row.assignedToIds,
          priority: row.priority,
          description: row.notes.trim() || undefined,
        });
        ok++;
      } catch (e) {
        console.error('[ActivityPlanner] Failed:', row.title, e);
        fail++;
      }
    }

    if (fail === 0) toast.success(`${ok} aktivitet(er) skapade`);
    else toast.warning(`${ok} skapade, ${fail} misslyckades`);

    onTaskCreated();
    onOpenChange(false);
    setIsSubmitting(false);
  }, [validRows, isProjectMode, selectedBookingId, bookingId, largeProjectId, onTaskCreated, onOpenChange]);

  // --- Render ---
  const renderProductNode = (node: ProductNode, depth: number = 0) => {
    const isPlanned = plannedProductIds.has(node.product.id);
    const isSelected = selectedIds.has(node.product.id);
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.product.id}>
        <label className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent/50",
          isPlanned && "opacity-50",
          depth > 0 && "ml-6 border-l-2 border-border pl-3"
        )}>
          <Checkbox
            checked={isPlanned || isSelected}
            disabled={isPlanned}
            onCheckedChange={() => {
              if (hasChildren && depth === 0) toggleParentWithChildren(node);
              else toggleProduct(node.product.id);
            }}
          />
          <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className={cn("flex-1 text-sm truncate", isPlanned && "line-through text-muted-foreground")}>
            {depth > 0 && "• "}{node.product.name}
          </span>
          {node.product.quantity > 1 && (
            <span className="text-xs text-muted-foreground flex-shrink-0">x{node.product.quantity}</span>
          )}
          {isPlanned && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Planerad</span>
          )}
        </label>
        {node.children.map(child => renderProductNode(child, depth + 1))}
      </div>
    );
  };

  const renderActivityRow = (row: ActivityRow, idx: number) => {
    const isValid = row.title.trim() && row.startDate && row.endDate;
    const productCount = row.productIds.length;
    return (
      <div
        key={row.id}
        className={cn(
          "rounded-lg border p-3 space-y-3 transition-colors",
          isValid ? "border-border bg-background" : "border-destructive/30 bg-destructive/5"
        )}
      >
        {/* Row header */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => duplicateRow(row.id)} title="Duplicera">
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeRow(row.id)} title="Ta bort">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Title */}
        <Input
          value={row.title}
          onChange={e => updateRow(row.id, { title: e.target.value })}
          placeholder="Aktivitetsnamn (t.ex. Lastning, Transport, Montering)"
          className="h-8 text-sm"
        />

        {/* Category + Priority */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Kategori</Label>
            <CategoryCombobox value={row.category} onValueChange={v => updateRow(row.id, { category: v })} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Prioritet</Label>
            <Select value={row.priority} onValueChange={v => updateRow(row.id, { priority: v as TaskPriority })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Startdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-8 text-xs", !row.startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3 w-3" />
                  {row.startDate ? format(row.startDate, 'yyyy-MM-dd') : 'Välj'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={row.startDate}
                  onSelect={d => {
                    updateRow(row.id, { startDate: d ?? undefined });
                    if (!row.endDate || (d && d > row.endDate)) updateRow(row.id, { startDate: d ?? undefined, endDate: d ?? undefined });
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Slutdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-full justify-start text-left font-normal h-8 text-xs", !row.endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-1.5 h-3 w-3" />
                  {row.endDate ? format(row.endDate, 'yyyy-MM-dd') : 'Välj'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={row.endDate}
                  onSelect={d => updateRow(row.id, { endDate: d ?? undefined })}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Starttid</Label>
            <Input type="time" value={row.startTime} onChange={e => updateRow(row.id, { startTime: e.target.value })} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Sluttid</Label>
            <Input type="time" value={row.endTime} onChange={e => updateRow(row.id, { endTime: e.target.value })} className="h-8 text-xs" />
          </div>
        </div>

        {/* Assignee */}
        {staffPool.length > 0 && (
          <div>
            <Label className="text-[10px] text-muted-foreground">Personal</Label>
            <div className="mt-1 max-h-24 overflow-y-auto rounded-md border border-border p-1 space-y-0.5">
              {staffPool.map(s => (
                <label key={s.id} className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-accent/50 cursor-pointer text-xs">
                  <Checkbox
                    checked={row.assignedToIds.includes(s.id)}
                    onCheckedChange={checked => {
                      const next = checked
                        ? [...row.assignedToIds, s.id]
                        : row.assignedToIds.filter(id => id !== s.id);
                      updateRow(row.id, { assignedToIds: next });
                    }}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <Label className="text-[10px] text-muted-foreground">Anteckningar (valfritt)</Label>
          <Textarea
            value={row.notes}
            onChange={e => updateRow(row.id, { notes: e.target.value })}
            placeholder="Fritext..."
            className="min-h-[48px] text-xs resize-none"
          />
        </div>

        {/* Product link */}
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant={attachingToRowId === row.id ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => {
                if (attachingToRowId === row.id) {
                  setAttachingToRowId(null);
                  setSelectedIds(new Set());
                } else {
                  setAttachingToRowId(row.id);
                  setSelectedIds(new Set());
                }
              }}
            >
              <Package className="h-3 w-3" />
              {attachingToRowId === row.id ? 'Väljer...' : 'Koppla produkter'}
            </Button>
            {productCount > 0 && (
              <span className="text-[10px] text-muted-foreground">{productCount} produkt(er)</span>
            )}
          </div>
          {productCount > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {row.productIds.map(pid => {
                const prod = activeProducts.find(p => p.id === pid);
                if (!prod) return null;
                return (
                  <span
                    key={pid}
                    className="inline-flex items-center gap-1 text-[10px] bg-muted text-muted-foreground rounded-full px-2 py-0.5"
                  >
                    {prod.name}{prod.quantity > 1 ? ` x${prod.quantity}` : ''}
                    <button
                      type="button"
                      className="ml-0.5 hover:text-destructive"
                      onClick={() => updateRow(row.id, { productIds: row.productIds.filter(id => id !== pid) })}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] max-h-[85vh] p-0 flex flex-col [&>button]:hidden inset-x-4 bottom-4 rounded-2xl border border-border"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold">Planera aktiviteter</SheetTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {validRows.length} av {rows.length} redo
              </span>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Stäng</Button>
            </div>
          </div>

          {/* Selected booking context */}
          {(() => {
            const selectedProjectBooking = isProjectMode && selectedBookingId !== "none"
              ? projectBookings.find(b => b.booking_id === selectedBookingId)
              : null;
            const displayName = isProjectMode
              ? (selectedProjectBooking ? (selectedProjectBooking.display_name || selectedProjectBooking.client || selectedProjectBooking.booking_id) : null)
              : bookingName;
            if (displayName) {
              return (
                <p className="text-xs text-muted-foreground mt-1">
                  Vald bokning: <span className="font-medium text-foreground">{displayName}</span>
                </p>
              );
            }
            return null;
          })()}
        </div>

        {/* Booking selector (project mode) */}
        {isProjectMode && (
          <div className="px-6 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3 max-w-md">
              <Label className="text-sm whitespace-nowrap">Välj bokning:</Label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Välj bokning" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen specifik bokning</SelectItem>
                  {projectBookings.map(b => (
                    <SelectItem key={b.booking_id} value={b.booking_id}>
                      {b.display_name || b.client || b.booking_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 overflow-hidden">
          {/* Left: Products (visible when attaching) */}
          <div className={cn(
            "md:col-span-2 border-r border-border flex flex-col overflow-hidden transition-all",
            attachingToRowId ? "block" : "hidden md:flex"
          )}>
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Produkter från bokningen
              </h3>
              {attachingToRowId && (
                <p className="text-xs text-primary mt-0.5">
                  Kopplar till: <strong>#{rows.findIndex(r => r.id === attachingToRowId) + 1} {rows.find(r => r.id === attachingToRowId)?.title || '(namnlös)'}</strong> • {selectedIds.size} valda
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
            {attachingToRowId && (
              <div className="p-3 border-t border-border flex gap-2">
                <Button size="sm" className="flex-1" onClick={attachProductsToRow} disabled={selectedIds.size === 0}>
                  Koppla {selectedIds.size} produkt(er)
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setAttachingToRowId(null); setSelectedIds(new Set()); }}>
                  Avbryt
                </Button>
              </div>
            )}
          </div>

          {/* Right: Activity rows */}
          <div className={cn(
            "flex flex-col overflow-hidden",
            attachingToRowId ? "md:col-span-3" : "md:col-span-3"
          )}>
            <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Aktiviteter för denna bokning ({rows.length})
              </h3>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addRow}>
                <Plus className="h-3 w-3" />
                Lägg till aktivitet
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Template chooser */}
              {showTemplates && rows.length <= 1 && !rows[0]?.title && (
                <div className="rounded-lg border border-dashed border-border p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground">Starta från en mall:</p>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVITY_TEMPLATES.map(t => (
                      <Button
                        key={t.label}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => applyTemplate(t)}
                      >
                        {t.label} ({t.rows.length})
                      </Button>
                    ))}
                  </div>
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                    onClick={() => setShowTemplates(false)}
                  >
                    Börja med tom rad istället
                  </button>
                </div>
              )}

              {rows.map((row, idx) => renderActivityRow(row, idx))}

              <Button variant="outline" size="sm" className="w-full h-9 text-xs border-dashed border-2" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Lägg till aktivitet
              </Button>
            </div>

            {/* Save bar */}
            <div className="p-4 border-t border-border bg-muted/30 flex items-center gap-3">
              <p className="text-[10px] text-muted-foreground flex-1">
                Varje rad skapas som en separat aktivitet i Gantt-vyn.
              </p>
              <Button
                onClick={handleSaveAll}
                disabled={validRows.length === 0 || isSubmitting}
                className="min-w-[160px]"
              >
                {isSubmitting
                  ? "Sparar..."
                  : `Spara ${validRows.length} aktivitet(er)`}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ActivityPlannerSheet;
