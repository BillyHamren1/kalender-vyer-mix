import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Filter, Package, Truck, Calendar, RotateCcw, ClipboardList, PackageOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export type WarehouseEventTypeFilter = 'packing' | 'delivery' | 'event' | 'return' | 'inventory' | 'unpacking';

interface WarehouseEventFilterProps {
  activeFilters: WarehouseEventTypeFilter[];
  onFilterChange: (filters: WarehouseEventTypeFilter[]) => void;
}

const EVENT_TYPES: { id: WarehouseEventTypeFilter; label: string; icon: React.ElementType; color: string }[] = [
  { id: 'packing', label: 'Packning', icon: Package, color: 'text-purple-600' },
  { id: 'delivery', label: 'Utleverans', icon: Truck, color: 'text-blue-600' },
  { id: 'event', label: 'Event', icon: Calendar, color: 'text-yellow-600' },
  { id: 'return', label: 'Retur', icon: RotateCcw, color: 'text-orange-600' },
  { id: 'inventory', label: 'Inventering', icon: ClipboardList, color: 'text-cyan-600' },
  { id: 'unpacking', label: 'Uppackning', icon: PackageOpen, color: 'text-gray-600' },
];

const WarehouseEventFilter: React.FC<WarehouseEventFilterProps> = ({
  activeFilters,
  onFilterChange,
}) => {
  const handleToggle = (eventType: WarehouseEventTypeFilter) => {
    if (activeFilters.includes(eventType)) {
      onFilterChange(activeFilters.filter(f => f !== eventType));
    } else {
      onFilterChange([...activeFilters, eventType]);
    }
  };

  const handleSelectAll = () => {
    onFilterChange(EVENT_TYPES.map(t => t.id));
  };

  const handleClearAll = () => {
    onFilterChange([]);
  };

  const activeCount = activeFilters.length;
  const totalCount = EVENT_TYPES.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-9 px-3 bg-card border-border hover:bg-accent/50",
            activeCount < totalCount && "border-warehouse text-warehouse"
          )}
        >
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
          {activeCount < totalCount && (
            <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold rounded-full bg-warehouse text-white">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 bg-card border shadow-lg" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Visa händelser</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleSelectAll}
              >
                Alla
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleClearAll}
              >
                Ingen
              </Button>
            </div>
          </div>
          
          <div className="space-y-1">
            {EVENT_TYPES.map((eventType) => {
              const Icon = eventType.icon;
              const isActive = activeFilters.includes(eventType.id);
              
              return (
                <label
                  key={eventType.id}
                  className={cn(
                    "flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
                    isActive ? "bg-accent/50" : "hover:bg-accent/30"
                  )}
                >
                  <Checkbox
                    checked={isActive}
                    onCheckedChange={() => handleToggle(eventType.id)}
                    className="border-muted-foreground data-[state=checked]:bg-warehouse data-[state=checked]:border-warehouse"
                  />
                  <Icon className={cn("h-4 w-4", eventType.color)} />
                  <span className="text-sm text-foreground">{eventType.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default WarehouseEventFilter;
