import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { Search } from "lucide-react";

interface FilterBarProps {
  children?: ReactNode;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  searchValue?: string;
  className?: string;
}

const FilterBar = ({
  children,
  searchPlaceholder = "Sök...",
  onSearchChange,
  searchValue = "",
  className,
}: FilterBarProps) => {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-lg border border-border bg-card p-3",
        className
      )}
    >
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0">
          {children}
        </div>
      )}
    </div>
  );
};

export default FilterBar;
