import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExternalSuppliers, formatSupplierAddress, type ExternalSupplier } from "@/hooks/useExternalSuppliers";

interface Props {
  value: string | null; // external_supplier_id (uuid)
  onChange: (id: string | null, supplier: ExternalSupplier | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function ExternalSupplierPicker({
  value,
  onChange,
  placeholder = "Välj leverantör…",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { suppliers, isLoading } = useExternalSuppliers({ search });

  const selected = suppliers.find((s) => s.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Truck className="h-4 w-4 text-muted-foreground" />
            {selected ? selected.name : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Sök på namn, ort eller org.nr…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading && <div className="p-3 text-xs text-muted-foreground">Laddar…</div>}
            {!isLoading && suppliers.length === 0 && (
              <CommandEmpty>Inga leverantörer hittades.</CommandEmpty>
            )}
            <CommandGroup>
              {suppliers.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.id}
                  onSelect={() => {
                    onChange(s.id, s);
                    setOpen(false);
                  }}
                  className="flex items-start gap-2"
                >
                  <Check className={cn("h-4 w-4 mt-0.5", value === s.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    {formatSupplierAddress(s) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {formatSupplierAddress(s)}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
