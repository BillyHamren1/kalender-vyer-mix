import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus, Check, User, Clock } from "lucide-react";
import { PackingListItem } from "@/types/packing";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PackingListItemRowProps {
  item: PackingListItem;
  onUpdate: (id: string, updates: Partial<PackingListItem>) => void;
  isAccessory?: boolean;
  isOrphaned?: boolean;
  isNewlyAdded?: boolean;
}

const PackingListItemRow = ({ 
  item, 
  onUpdate, 
  isAccessory = false,
  isOrphaned = false,
  isNewlyAdded = false 
}: PackingListItemRowProps) => {
  const [packerName, setPackerName] = useState("");
  const [showNameInput, setShowNameInput] = useState(false);

  const isFullyPacked = item.quantity_packed >= item.quantity_to_pack;
  const isPartiallyPacked = item.quantity_packed > 0 && item.quantity_packed < item.quantity_to_pack;

  const handleTogglePacked = () => {
    if (isFullyPacked) {
      // Reset to unpacked
      onUpdate(item.id, {
        quantity_packed: 0,
        packed_by: null,
        packed_at: null
      });
    } else {
      // Show name input for packing
      setShowNameInput(true);
    }
  };

  const handleConfirmPacked = () => {
    onUpdate(item.id, {
      quantity_packed: item.quantity_to_pack,
      packed_by: packerName || "Okänd",
      packed_at: new Date().toISOString()
    });
    setShowNameInput(false);
    setPackerName("");
  };

  const handleIncrement = () => {
    if (item.quantity_packed < item.quantity_to_pack) {
      onUpdate(item.id, {
        quantity_packed: item.quantity_packed + 1,
        packed_by: item.packed_by || "Okänd",
        packed_at: new Date().toISOString()
      });
    }
  };

  const handleDecrement = () => {
    if (item.quantity_packed > 0) {
      const newQty = item.quantity_packed - 1;
      onUpdate(item.id, {
        quantity_packed: newQty,
        packed_by: newQty === 0 ? null : item.packed_by,
        packed_at: newQty === 0 ? null : item.packed_at
      });
    }
  };

  // Orphaned items: struck through, at bottom, non-interactive
  if (isOrphaned) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md text-xs opacity-60",
          isAccessory && "ml-5 border-l-2 border-muted",
          "bg-destructive/10 border border-dashed border-destructive/30"
        )}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-xs line-through text-muted-foreground">
            {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
            {(item.product?.name || "Borttagen produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
          </p>
          <p className="text-[10px] text-destructive">Borttagen från bokningen</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {item.quantity_packed}/{item.quantity_to_pack}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors text-xs",
        isAccessory && "ml-5 border-l-2 border-muted",
        isFullyPacked && "bg-green-50 dark:bg-green-950/20",
        isPartiallyPacked && "bg-yellow-50 dark:bg-yellow-950/20",
        isNewlyAdded && !isFullyPacked && "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
      )}
    >
      {/* Checkbox */}
      <Popover open={showNameInput} onOpenChange={setShowNameInput}>
        <PopoverTrigger asChild>
          <div>
            <Checkbox
              checked={isFullyPacked}
              onCheckedChange={handleTogglePacked}
              className={cn(
                "h-4 w-4",
                isPartiallyPacked && "data-[state=unchecked]:bg-yellow-200"
              )}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="space-y-2">
            <p className="text-xs font-medium">Vem packar?</p>
            <Input
              placeholder="Ditt namn"
              value={packerName}
              onChange={(e) => setPackerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmPacked()}
              autoFocus
              className="h-7 text-xs"
            />
            <Button size="sm" onClick={handleConfirmPacked} className="w-full h-7 text-xs">
              <Check className="h-3 w-3 mr-1" />
              Bekräfta
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Product name */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate text-xs",
          isFullyPacked && "line-through text-muted-foreground"
        )}>
          {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
          {isNewlyAdded && !isFullyPacked && <span className="text-primary font-bold mr-1">NY</span>}
          {(item.product?.name || "Okänd produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
          {item.product?.sku && (
            <span className="text-[10px] text-muted-foreground ml-1.5">
              [{item.product.sku.substring(0, 8)}]
            </span>
          )}
        </p>
        {item.packed_by && item.packed_at && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <User className="h-2.5 w-2.5" />
            {item.packed_by}
            <Clock className="h-2.5 w-2.5 ml-0.5" />
            {format(new Date(item.packed_at), "d MMM HH:mm", { locale: sv })}
          </p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-5 w-5"
          onClick={handleDecrement}
          disabled={item.quantity_packed === 0}
        >
          <Minus className="h-2.5 w-2.5" />
        </Button>
        <span className={cn(
          "text-xs font-medium min-w-[3rem] text-center",
          isFullyPacked && "text-green-600",
          isPartiallyPacked && "text-yellow-600"
        )}>
          {item.quantity_packed}/{item.quantity_to_pack}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-5 w-5"
          onClick={handleIncrement}
          disabled={item.quantity_packed >= item.quantity_to_pack}
        >
          <Plus className="h-2.5 w-2.5" />
        </Button>
      </div>
    </div>
  );
};

export default PackingListItemRow;
