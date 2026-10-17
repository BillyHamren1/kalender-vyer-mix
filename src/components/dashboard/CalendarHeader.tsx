import React, { useState, useRef, useEffect } from "react";
import { 
  Calendar, CalendarDays, CalendarRange,
  Users, Package, Truck, LayoutGrid,
  ChevronLeft, ChevronRight, SlidersHorizontal, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";

const viewModes: { value: DashboardViewMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'day', label: 'Dag', icon: Calendar },
  { value: 'week', label: 'Vecka', icon: CalendarRange },
  { value: 'month', label: 'Månad', icon: CalendarDays },
];

const categories: { value: EventCategory; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'planning', label: 'Personal', icon: Users },
  { value: 'warehouse', label: 'Lager', icon: Package },
  { value: 'logistics', label: 'Logistik', icon: Truck },
];

interface CalendarHeaderProps {
  title: string;
  onPrevious: () => void;
  onNext: () => void;
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const allActive = activeCategories.length === 3;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAll = () => {
    onCategoriesChange(allActive ? ['planning'] : ['planning', 'warehouse', 'logistics']);
  };

  const toggleCategory = (cat: EventCategory) => {
    if (activeCategories.includes(cat)) {
      if (activeCategories.length === 1) return;
      onCategoriesChange(activeCategories.filter(c => c !== cat));
    } else {
      onCategoriesChange([...activeCategories, cat]);
    }
  };

  const activeCount = activeCategories.length;

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card text-foreground border-b border-border gap-4">
      {/* Left: view mode tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
        {viewModes.map(mode => (
          <Button variant="ghost"
            key={mode.value}
            onClick={() => onViewModeChange(mode.value)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-150",
              viewMode === mode.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <mode.icon className="w-3.5 h-3.5" />
            {mode.label}
          </Button>
        ))}
      </div>

      {/* Center: navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevious}
          className="h-8 w-8 text-primary-foreground hover:bg-muted border border-border/30 rounded-lg"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-foreground font-semibold min-w-[90px] text-center text-sm">
          {title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          className="h-8 w-8 text-primary-foreground hover:bg-muted border border-border/30 rounded-lg"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Right: filter dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button variant="ghost"
          onClick={() => setDropdownOpen(prev => !prev)}
          className={cn(
            "flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium transition-all duration-150 border",
            dropdownOpen || !allActive
              ? "bg-card text-foreground border-border shadow-sm"
              : "text-muted-foreground hover:text-foreground border-border/30"
          )}
          title="Filtrera kategorier"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {!allActive && (
            <span className="text-xs font-bold">{activeCount}</span>
          )}
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
            {/* Alla */}
            <Button variant="ghost"
              onClick={toggleAll}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 text-foreground font-medium">
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                Alla
              </span>
              {allActive && <Check className="w-3.5 h-3.5 text-foreground" />}
            </Button>

            <div className="h-px bg-border mx-2" />

            {categories.map(cat => {
              const isActive = activeCategories.includes(cat.value);
              return (
                <Button variant="ghost"
                  key={cat.value}
                  onClick={() => toggleCategory(cat.value)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-muted transition-colors"
                >
                  <span className={cn(
                    "flex items-center gap-2",
                    isActive ? "text-foreground" : "text-muted-foreground"
                  )}>
                    <cat.icon className="w-4 h-4" />
                    {cat.label}
                  </span>
                  {isActive && <Check className="w-3.5 h-3.5 text-foreground" />}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CalendarHeader;
