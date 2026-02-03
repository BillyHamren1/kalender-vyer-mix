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
}

const PackingListItemRow = ({ item, onUpdate, isAccessory = false }: PackingListItemRowProps) => {
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

  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2 px-3 rounded-lg transition-colors",
        isAccessory && "ml-6 border-l-2 border-muted",
        isFullyPacked && "bg-green-50 dark:bg-green-950/20",
        isPartiallyPacked && "bg-yellow-50 dark:bg-yellow-950/20"
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
                "h-5 w-5",
                isPartiallyPacked && "data-[state=unchecked]:bg-yellow-200"
              )}
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-2">
            <p className="text-sm font-medium">Vem packar?</p>
            <Input
              placeholder="Ditt namn"
              value={packerName}
              onChange={(e) => setPackerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmPacked()}
              autoFocus
            />
            <Button size="sm" onClick={handleConfirmPacked} className="w-full">
              <Check className="h-4 w-4 mr-2" />
              Bekräfta
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Product name */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium truncate",
          isFullyPacked && "line-through text-muted-foreground"
        )}>
          {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
          {(item.product?.name || "Okänd produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
          {item.product?.sku && (
            <span className="text-xs text-muted-foreground ml-2">
              [{item.product.sku.substring(0, 8)}]
            </span>
          )}
        </p>
        {item.packed_by && item.packed_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <User className="h-3 w-3" />
            {item.packed_by}
            <Clock className="h-3 w-3 ml-1" />
            {format(new Date(item.packed_at), "d MMM HH:mm", { locale: sv })}
          </p>
        )}
      </div>

      {/* Quantity controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleDecrement}
          disabled={item.quantity_packed === 0}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className={cn(
          "text-sm font-medium min-w-[4rem] text-center",
          isFullyPacked && "text-green-600",
          isPartiallyPacked && "text-yellow-600"
        )}>
          {item.quantity_packed}/{item.quantity_to_pack}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={handleIncrement}
          disabled={item.quantity_packed >= item.quantity_to_pack}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default PackingListItemRow;
