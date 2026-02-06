import { 
  Calendar, 
  CalendarDays, 
  CalendarRange, 
  Users, 
  Package, 
  Truck, 
  LayoutGrid 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";

interface DashboardFiltersProps {
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  activeCategories: EventCategory[];
  onCategoriesChange: (categories: EventCategory[]) => void;
}

const viewModes: { value: DashboardViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'day', label: 'Dag', icon: Calendar },
  { value: 'week', label: 'Vecka', icon: CalendarRange },
  { value: 'month', label: 'Månad', icon: CalendarDays },
];

const categories: { value: EventCategory; label: string; icon: React.ComponentType<{ className?: string }>; colorClass: string }[] = [
  { value: 'planning', label: 'Personal', icon: Users, colorClass: 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground' },
  { value: 'warehouse', label: 'Lager', icon: Package, colorClass: 'data-[state=on]:bg-warehouse data-[state=on]:text-warehouse-foreground' },
  { value: 'logistics', label: 'Logistik', icon: Truck, colorClass: 'data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground' },
];

const DashboardFilters = ({ 
  viewMode, 
  onViewModeChange, 
  activeCategories, 
  onCategoriesChange 
}: DashboardFiltersProps) => {
  const allActive = activeCategories.length === 3;

  const toggleAll = () => {
    if (allActive) {
      onCategoriesChange(['planning']); // At least one must be active
    } else {
      onCategoriesChange(['planning', 'warehouse', 'logistics']);
    }
  };

  const handleCategoryToggle = (values: string[]) => {
    if (values.length === 0) return; // Prevent empty selection
    onCategoriesChange(values as EventCategory[]);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border/50 shadow-sm">
      {/* View Mode Tabs */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">Vy</span>
        <div className="flex rounded-lg bg-muted p-0.5">
          {viewModes.map(mode => (
            <button
              key={mode.value}
              onClick={() => onViewModeChange(mode.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
                viewMode === mode.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <mode.icon className="w-3.5 h-3.5" />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide mr-1">Visa</span>
        <button
          onClick={toggleAll}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border",
            allActive
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-muted-foreground border-border hover:border-foreground/30"
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Alla
        </button>
        <ToggleGroup 
          type="multiple" 
          value={activeCategories}
          onValueChange={handleCategoryToggle}
          className="gap-1"
        >
          {categories.map(cat => (
            <ToggleGroupItem
              key={cat.value}
              value={cat.value}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-border transition-all duration-200",
                "data-[state=off]:text-muted-foreground data-[state=off]:bg-card",
                cat.colorClass
              )}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
};

export default DashboardFilters;
