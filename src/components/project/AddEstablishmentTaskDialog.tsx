import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Package, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import CategoryCombobox from "./CategoryCombobox";
import { createEstablishmentTask, BSAValidationError } from "@/services/establishmentTaskService";
import type { TaskStatus, TaskReadiness, TaskPriority, TaskType, LinkedEntityType } from "@/services/establishmentTaskService";
import { fetchEstablishmentBookingData } from "@/services/establishmentPlanningService";
import { toast } from "sonner";
import type { BookingProduct } from "@/services/establishmentPlanningService";

export interface ProjectBookingInfo {
  booking_id: string;
  display_name: string | null;
  client?: string;
}

interface AddEstablishmentTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string;
  largeProjectId?: string;
  products: BookingProduct[];
  defaultDate: string | null;
  onTaskCreated: () => void;
  projectBookings?: ProjectBookingInfo[];
  staffPool?: Array<{ id: string; name: string }>;
}

// Categories are now handled by CategoryCombobox

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'high', label: 'Hög' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Låg' },
];

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'crew', label: 'Fältarbete' },
  { value: 'pm', label: 'Projektledning' },
  { value: 'logistics', label: 'Logistik' },
  { value: 'admin', label: 'Admin' },
];

const AddEstablishmentTaskDialog = ({
  open,
  onOpenChange,
  bookingId,
  largeProjectId,
  products,
  defaultDate,
  onTaskCreated,
  projectBookings = [],
  staffPool = [],
}: AddEstablishmentTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Montering");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [taskType, setTaskType] = useState<TaskType>("crew");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string>("none");

  const isProjectMode = !!largeProjectId && projectBookings.length > 0;

  const { data: selectedBookingData } = useQuery({
    queryKey: ['establishment-booking-data', selectedBookingId],
    queryFn: () => fetchEstablishmentBookingData(selectedBookingId),
    enabled: isProjectMode && selectedBookingId !== "none",
  });

  const activeProducts = isProjectMode
    ? (selectedBookingData?.products || [])
    : products;

  const mainProducts = activeProducts.filter(p => !p.isPackageComponent);

  useEffect(() => {
    if (!open) {
      setSelectedBookingId("none");
      setPriority("medium");
      setTaskType("crew");
      setDueDate(undefined);
    }
  }, [open]);

  const handleQuickAdd = async (product: BookingProduct) => {
    setIsSubmitting(true);
    try {
      const date = defaultDate || format(new Date(), 'yyyy-MM-dd');
      const effectiveBookingId = isProjectMode
        ? (selectedBookingId !== "none" ? selectedBookingId : null)
        : (bookingId || null);

      await createEstablishmentTask({
        booking_id: effectiveBookingId,
        large_project_id: largeProjectId || null,
        title: `${product.name}${product.quantity > 1 ? ` x${product.quantity}` : ''}`,
        category: 'installation',
        start_date: date,
        end_date: date,
        source: 'product',
        source_product_id: product.id,
        assigned_to: assignedTo,
        priority,
        task_type: taskType,
        due_date: dueDate ? dueDate.toISOString() : null,
      });
      toast.success(`Aktivitet skapad: ${product.name}`);
      onTaskCreated();
    } catch (e) {
      toast.error(e instanceof BSAValidationError ? "Personen måste först bemannas via kalendern innan den kan tilldelas aktiviteten" : "Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!title.trim() || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      const effectiveBookingId = isProjectMode
        ? (selectedBookingId !== "none" ? selectedBookingId : null)
        : (bookingId || null);

      await createEstablishmentTask({
        booking_id: effectiveBookingId,
        large_project_id: largeProjectId || null,
        title: title.trim(),
        category,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        source: 'manual',
        assigned_to: assignedTo,
        priority,
        task_type: taskType,
        due_date: dueDate ? dueDate.toISOString() : null,
      });
      toast.success("Aktivitet skapad");
      setTitle("");
      onTaskCreated();
    } catch (e) {
      toast.error(e instanceof BSAValidationError ? "Personen måste först bemannas via kalendern innan den kan tilldelas aktiviteten" : "Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lägg till aktivitet</DialogTitle>
        </DialogHeader>

        {/* Booking selector - only in large project mode */}
        {isProjectMode && (
          <div className="space-y-2">
            <Label>Koppla till bokning</Label>
            <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj bokning (valfritt)" />
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
        )}

        {/* Quick add from products */}
        {mainProducts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">
              {isProjectMode ? `Produkter från bokning` : 'Snabbval från bokning'}
            </Label>
            <div className="grid gap-1.5 max-h-40 overflow-y-auto">
              {mainProducts.map((product) => (
                <button
                  key={product.id}
                  disabled={isSubmitting}
                  onClick={() => handleQuickAdd(product)}
                  className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-accent text-left transition-colors text-sm"
                >
                  <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{product.name}</span>
                  {product.quantity > 1 && (
                    <span className="text-muted-foreground ml-auto flex-shrink-0">x{product.quantity}</span>
                  )}
                  <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {mainProducts.length > 0 && (
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">eller skapa manuellt</span>
            <div className="flex-1 h-px bg-border" />
          </div>
        )}

        {/* Manual form */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="task-title">Titel</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Montering tält"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Typ</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kategori</Label>
              <CategoryCombobox value={category} onValueChange={setCategory} className="h-10 text-base md:text-sm" />
            </div>
            <div>
              <Label>Prioritet</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Tilldela från projektteam</Label>
            <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Ingen tilldelad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen tilldelad</SelectItem>
                {staffPool.length > 0 ? staffPool.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                )) : (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Bemanna via kalendern först</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Startdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'yyyy-MM-dd') : 'Välj datum'}
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
              <Label>Slutdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'yyyy-MM-dd') : 'Välj datum'}
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

          <p className="text-[11px] text-muted-foreground">
            Nya aktiviteter skapas som "Ej startad" med beredskap "Saknar information"
          </p>

          <Button
            onClick={handleManualSubmit}
            disabled={!title.trim() || !startDate || !endDate || isSubmitting}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Skapa aktivitet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddEstablishmentTaskDialog;
