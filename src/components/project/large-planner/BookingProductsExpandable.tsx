/**
 * BookingProductsExpandable
 * --------------------------------------------------------------------------
 * Expanderbar lista över bokningens orderrader, med en "+ To-do"-knapp
 * per rad. Klick → kallar onCreateTodoForProduct med rad-info.
 * Read-only mot booking_products.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, ListPlus, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookingProductsForPlanner, type BookingProductForPlanner } from '@/hooks/useBookingProductsForPlanner';

interface Props {
  bookingId: string;
  onCreateTodoForProduct: (product: BookingProductForPlanner) => void;
}

const BookingProductsExpandable = ({ bookingId, onCreateTodoForProduct }: Props) => {
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useBookingProductsForPlanner(open ? bookingId : null);

  return (
    <div className="mt-2 rounded border border-border/40 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/60"
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Package className="h-3 w-3" />
          Orderrader
        </span>
        {data && <span>{data.length} st</span>}
      </button>

      {open && (
        <div className="border-t border-border/40 p-1">
          {isLoading && (
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Laddar orderrader…
            </div>
          )}
          {error && (
            <div className="px-2 py-1 text-[10px] text-destructive">
              {(error as Error).message || 'Kunde inte ladda orderrader.'}
            </div>
          )}
          {data && data.length === 0 && (
            <div className="px-2 py-1 text-[10px] italic text-muted-foreground">
              Inga orderrader.
            </div>
          )}
          {data && data.length > 0 && (
            <ul className="space-y-0.5">
              {data.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-1 rounded px-1.5 py-1 hover:bg-background"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-foreground">
                      {p.name || 'Namnlös rad'}
                    </div>
                    <div className="flex flex-wrap gap-x-1.5 text-[9px] text-muted-foreground">
                      {p.quantity != null && <span>{p.quantity} st</span>}
                      {p.sku && <span>SKU: {p.sku}</span>}
                      {p.is_package_component && <span>(paketdel)</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 shrink-0 px-1 text-[9px]"
                    onClick={() => onCreateTodoForProduct(p)}
                    title="Skapa to-do för denna orderrad"
                  >
                    <ListPlus className="mr-0.5 h-2.5 w-2.5" />
                    To-do
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingProductsExpandable;
