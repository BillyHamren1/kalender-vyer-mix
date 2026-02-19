import { 
  Calendar, CalendarDays, CalendarRange,
  Users, Package, Truck, LayoutGrid,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";

const viewModes: { value: DashboardViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'day', label: 'Dag', icon: Calendar },
  { value: 'week', label: 'Vecka', icon: CalendarRange },
  { value: 'month', label: 'Månad', icon: CalendarDays },
];

const categories: { value: EventCategory; label: string; icon: React.ComponentType<{ className?: string }>; activeClass: string }[] = [
  { value: 'planning', label: 'Personal', icon: Users, activeClass: 'bg-primary text-primary-foreground border-primary' },
  { value: 'warehouse', label: 'Lager', icon: Package, activeClass: 'bg-warehouse text-warehouse-foreground border-warehouse' },
  { value: 'logistics', label: 'Logistik', icon: Truck, activeClass: 'bg-secondary text-secondary-foreground border-secondary' },
];

interface CalendarHeaderProps {
  // Navigation
  title: string;
  onPrevious: () => void;
  onNext: () => void;
  // Filters
  viewMode: DashboardViewMode;
  onViewModeChange: (mode: DashboardViewMode) => void;
  activeCategories: EventCategory[];
  onCategoriesChange: (cats: EventCategory[]) => void;
}

const CalendarHeader = ({
  title,
  onPrevious,
  onNext,
  viewMode,
  onViewModeChange,
  activeCategories,
  onCategoriesChange,
}: CalendarHeaderProps) => {
  const allActive = activeCategories.length === 3;

  const toggleAll = () => {
    onCategoriesChange(allActive ? ['planning'] : ['planning', 'warehouse', 'logistics']);
  };

  const toggleCategory = (cat: EventCategory) => {
    if (activeCategories.includes(cat)) {
      if (activeCategories.length === 1) return; // keep at least one
      onCategoriesChange(activeCategories.filter(c => c !== cat));
    } else {
      onCategoriesChange([...activeCategories, cat]);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary to-primary/80 gap-4 flex-wrap">
      {/* Left: view mode tabs */}
      <div className="flex items-center gap-1 bg-primary-foreground/10 rounded-lg p-0.5">
        {viewModes.map(mode => (
          <button
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
              viewMode === mode.value
                ? "bg-primary-foreground text-primary shadow-sm"
                : "text-primary-foreground/70 hover:text-primary-foreground"
            )}
          >
            <mode.icon className="w-3.5 h-3.5" />
            {mode.label}
          </button>
        ))}
      </div>

      {/* Center: navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevious}
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-primary-foreground font-semibold min-w-[90px] text-center text-sm">
          {title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/10 border border-primary-foreground/30 rounded-lg"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Right: category filters */}
      <div className="flex items-center gap-1">
        {/* Alla */}
        <button
          onClick={toggleAll}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border",
            allActive
              ? "bg-primary-foreground text-primary border-primary-foreground shadow-sm"
              : "text-primary-foreground/70 hover:text-primary-foreground border-primary-foreground/30"
          )}
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Alla
        </button>

        {categories.map(cat => {
          const isActive = activeCategories.includes(cat.value);
          return (
            <button
              key={cat.value}
              onClick={() => toggleCategory(cat.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 border",
                isActive
                  ? "bg-primary-foreground/90 text-primary border-primary-foreground/80 shadow-sm"
                  : "text-primary-foreground/50 border-primary-foreground/20 hover:text-primary-foreground/80 hover:border-primary-foreground/40"
              )}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarHeader;
