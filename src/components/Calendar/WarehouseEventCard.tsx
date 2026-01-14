import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Package, Truck, Calendar, RotateCcw, ClipboardList, PackageOpen } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { 
  WAREHOUSE_EVENT_COLORS, 
  WAREHOUSE_EVENT_LABELS,
  WarehouseEventType 
} from '@/services/warehouseCalendarService';

interface WarehouseEventCardProps {
  event: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: WarehouseEventType;
    booking_number?: string | null;
    delivery_address?: string | null;
    has_source_changes: boolean;
    change_details?: string | null;
    manually_adjusted: boolean;
  };
  onClick?: () => void;
  compact?: boolean;
}

// Icons for each event type
const EVENT_ICONS: Record<WarehouseEventType, React.ComponentType<{ className?: string }>> = {
  packing: Package,
  delivery: Truck,
  event: Calendar,
  return: RotateCcw,
  inventory: ClipboardList,
  unpacking: PackageOpen
};

export function WarehouseEventCard({ event, onClick, compact = false }: WarehouseEventCardProps) {
  const Icon = EVENT_ICONS[event.event_type];
  const backgroundColor = WAREHOUSE_EVENT_COLORS[event.event_type];
  const label = WAREHOUSE_EVENT_LABELS[event.event_type];
  
  const hasChanges = event.has_source_changes && !event.manually_adjusted;
  
  const startTime = format(new Date(event.start_time), 'HH:mm');
  const endTime = format(new Date(event.end_time), 'HH:mm');

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded px-2 py-1 text-xs cursor-pointer transition-all",
          "hover:opacity-80",
          hasChanges && "ring-2 ring-orange-500 animate-pulse"
        )}
        style={{ backgroundColor }}
      >
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3" />
          <span className="font-medium truncate">{label}</span>
          {hasChanges && <AlertTriangle className="w-3 h-3 text-orange-600" />}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 cursor-pointer transition-all",
        "hover:shadow-md",
        hasChanges && "border-2 border-orange-500 animate-pulse bg-orange-50"
      )}
      style={{ 
        backgroundColor: hasChanges ? undefined : backgroundColor,
        borderColor: hasChanges ? undefined : 'transparent'
      }}
    >
      {/* Change warning badge */}
      {hasChanges && (
        <Badge className="mb-2 bg-orange-500 text-white">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Ändrad i personalplanering!
        </Badge>
      )}

      {/* Header with icon and type */}
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-foreground/70" />
        <span className="font-semibold text-sm">{label}</span>
        {event.booking_number && (
          <Badge variant="outline" className="ml-auto text-xs">
            #{event.booking_number}
          </Badge>
        )}
      </div>

      {/* Title (client name) */}
      <div className="text-sm font-medium mb-1 truncate">
        {event.title.replace(`${label} - `, '')}
      </div>

      {/* Time */}
      <div className="text-xs text-muted-foreground">
        {startTime} - {endTime}
      </div>

      {/* Delivery address if exists */}
      {event.delivery_address && !compact && (
        <div className="text-xs text-muted-foreground mt-1 truncate">
          📍 {event.delivery_address}
        </div>
      )}

      {/* Change details if showing changes */}
      {hasChanges && event.change_details && (
        <div className="text-xs text-orange-700 mt-2 bg-orange-100 rounded p-1">
          {event.change_details}
        </div>
      )}
    </div>
  );
}

// Small dot indicator for month view
export function WarehouseEventDot({ eventType, hasChanges }: { eventType: WarehouseEventType; hasChanges: boolean }) {
  const backgroundColor = WAREHOUSE_EVENT_COLORS[eventType];
  
  return (
    <div
      className={cn(
        "w-2 h-2 rounded-full",
        hasChanges && "ring-2 ring-orange-500 animate-pulse"
      )}
      style={{ backgroundColor }}
    />
  );
}
