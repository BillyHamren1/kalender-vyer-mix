import { useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Package, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createEstablishmentTask } from "@/services/establishmentTaskService";
import { toast } from "sonner";
import type { BookingProduct } from "@/services/establishmentPlanningService";

interface AddEstablishmentTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId?: string;
  largeProjectId?: string;
  products: BookingProduct[];
  defaultDate: string | null;
  onTaskCreated: () => void;
}

const CATEGORIES = [
  { value: 'transport', label: 'Transport' },
  { value: 'material', label: 'Material' },
  { value: 'personal', label: 'Personal' },
  { value: 'installation', label: 'Installation' },
  { value: 'kontroll', label: 'Kontroll' },
];

const AddEstablishmentTaskDialog = ({
  open,
  onOpenChange,
  bookingId,
  largeProjectId,
  products,
  defaultDate,
  onTaskCreated,
}: AddEstablishmentTaskDialogProps) => {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("installation");
  const [startDate, setStartDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [endDate, setEndDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate) : undefined
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mainProducts = products.filter(p => !p.isPackageComponent);

  const handleQuickAdd = async (product: BookingProduct) => {
    setIsSubmitting(true);
    try {
      const date = defaultDate || format(new Date(), 'yyyy-MM-dd');
      await createEstablishmentTask({
        booking_id: bookingId || null,
        large_project_id: largeProjectId || null,
        title: `${product.name}${product.quantity > 1 ? ` x${product.quantity}` : ''}`,
        category: 'installation',
        start_date: date,
        end_date: date,
        source: 'product',
        source_product_id: product.id,
      });
      toast.success(`Aktivitet skapad: ${product.name}`);
      onTaskCreated();
    } catch (e) {
      toast.error("Kunde inte skapa aktivitet");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!title.trim() || !startDate || !endDate) return;
    setIsSubmitting(true);
    try {
      await createEstablishmentTask({
        booking_id: bookingId || null,
        large_project_id: largeProjectId || null,
        title: title.trim(),
        category,
        start_date: format(startDate, 'yyyy-MM-dd'),
        end_date: format(endDate, 'yyyy-MM-dd'),
        source: 'manual',
      });
      toast.success("Aktivitet skapad");
      setTitle("");
      onTaskCreated();
    } catch (e) {
      toast.error("Kunde inte skapa aktivitet");
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

        {/* Quick add from products - only in booking mode */}
        {mainProducts.length > 0 && (
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Snabbval från bokning</Label>
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

          <div>
            <Label>Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
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
