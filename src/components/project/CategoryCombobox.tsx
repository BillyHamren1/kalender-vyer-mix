import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Check } from "lucide-react";

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
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["distinct-establishment-categories"],
    queryFn: fetchDistinctCategories,
    staleTime: 60_000,
  });

  const allSuggestions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...dbCategories].map((c) => c.trim()).filter(Boolean))
  );

  useEffect(() => {
    if (adding && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [adding]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewCategory("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (cat: string) => {
    onValueChange(cat);
    setOpen(false);
    setAdding(false);
  };

  const handleAddNew = () => {
    if (newCategory.trim()) {
      onValueChange(newCategory.trim());
      setNewCategory("");
      setAdding(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setAdding(false); }}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          !value && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{value || "Välj kategori"}</span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md p-1">
          <div className="max-h-48 overflow-y-auto">
            {allSuggestions.map((cat) => (
              <button
                key={cat}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(cat); }}
                className={cn(
                  "w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors",
                  cat === value && "bg-accent font-medium"
                )}
              >
                {cat === value && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                <span className={cat !== value ? "pl-[22px]" : ""}>{cat}</span>
              </button>
            ))}
          </div>

          <div className="border-t border-border mt-1 pt-1">
            {!adding ? (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAdding(true); }}
                className="w-full flex items-center gap-2 text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors text-muted-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Lägg till kategori
              </button>
            ) : (
              <div className="flex gap-1 p-1">
                <Input
                  ref={newInputRef}
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleAddNew(); }
                    if (e.key === "Escape") { setAdding(false); setNewCategory(""); }
                  }}
                  placeholder="Ny kategori..."
                  className="h-7 text-sm"
                />
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleAddNew(); }}
                  disabled={!newCategory.trim()}
                  className="px-2 h-7 rounded-sm bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryCombobox;
