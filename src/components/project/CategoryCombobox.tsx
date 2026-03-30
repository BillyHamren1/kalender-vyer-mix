import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_CATEGORIES = ["Montering", "Demontering", "Transport"];

async function fetchDistinctCategories(): Promise<string[]> {
  const { data } = await supabase
    .from("establishment_tasks")
    .select("category")
    .not("category", "is", null);

  if (!data) return [];
  const unique = new Set(data.map((r) => r.category));
  return Array.from(unique);
}

interface CategoryComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

const CategoryCombobox = ({ value, onValueChange, className }: CategoryComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["distinct-establishment-categories"],
    queryFn: fetchDistinctCategories,
    staleTime: 60_000,
  });

  const allSuggestions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...dbCategories].map((c) => c.trim()).filter(Boolean))
  );

  const filtered = allSuggestions.filter((c) =>
    c.toLowerCase().includes(inputValue.toLowerCase())
  );

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleSelect = (cat: string) => {
    setInputValue(cat);
    onValueChange(cat);
    setOpen(false);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (inputValue.trim()) {
        onValueChange(inputValue.trim());
      }
      setOpen(false);
    }, 150);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          placeholder="Skriv eller välj kategori"
          className={cn("h-8 text-sm", className)}
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground p-2">
            Tryck Enter för att använda "{inputValue}"
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto">
            {filtered.map((cat) => (
              <button
                key={cat}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(cat);
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors",
                  cat.toLowerCase() === value.toLowerCase() && "bg-accent font-medium"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
