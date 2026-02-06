import { Calendar, Users, Package, Truck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DashboardEvent, EventCategory } from "@/hooks/useDashboardEvents";
import { useNavigate } from "react-router-dom";

// Shared event card styling used across all calendar views
export function getEventCategoryColor(category: EventCategory) {
  switch (category) {
    case 'planning':
      return { dot: 'bg-primary', text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' };
    case 'warehouse':
      return { dot: 'bg-warehouse', text: 'text-warehouse-foreground', bg: 'bg-warehouse/10', border: 'border-warehouse/30' };
    case 'logistics':
      return { dot: 'bg-secondary', text: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/30' };
  }
}

export function getEventTypeLabel(eventType: string): string {
  const t = eventType.toLowerCase().trim();
  if (t === 'rigg' || t === 'rig') return 'RIGG';
  if (t === 'event') return 'EVENT';
  if (t === 'riggdown' || t === 'rigdown') return 'NEDMONT.';
  if (t === 'packing') return 'PACKNING';
  if (t === 'delivery') return 'LEVERANS';
  if (t === 'return') return 'RETUR';
  if (t === 'inventory') return 'INVENTERING';
  if (t === 'unpacking') return 'UPPACKNING';
  if (t === 'transport') return 'TRANSPORT';
  return eventType.toUpperCase();
}

export function getEventTypeBadgeStyle(eventType: string, category: EventCategory): string {
  const t = eventType.toLowerCase().trim();
  
  if (category === 'planning') {
    if (t === 'rigg' || t === 'rig') return 'bg-planning-rig text-planning-rig-foreground border-planning-rig-border';
    if (t === 'event') return 'bg-planning-event text-planning-event-foreground border-planning-event-border';
    if (t === 'riggdown' || t === 'rigdown') return 'bg-planning-rigdown text-planning-rigdown-foreground border-planning-rigdown-border';
  }
  
  if (category === 'warehouse') {
    if (t === 'packing') return 'bg-amber-100 text-amber-800 border-amber-300';
    if (t === 'delivery') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (t === 'return') return 'bg-purple-100 text-purple-800 border-purple-300';
    if (t === 'inventory') return 'bg-green-100 text-green-800 border-green-300';
    if (t === 'unpacking') return 'bg-teal-100 text-teal-800 border-teal-300';
  }
  
  if (category === 'logistics') {
    return 'bg-secondary/20 text-secondary border-secondary/40';
  }
  
  return 'bg-muted text-foreground border-border';
}

export function getCategoryIcon(category: EventCategory) {
  switch (category) {
    case 'planning': return Users;
    case 'warehouse': return Package;
    case 'logistics': return Truck;
  }
}

interface DashboardEventCardProps {
  event: DashboardEvent;
  compact?: boolean;
}

const DashboardEventCard = ({ event, compact = false }: DashboardEventCardProps) => {
  const navigate = useNavigate();
  const categoryColor = getEventCategoryColor(event.category);
  const badgeStyle = getEventTypeBadgeStyle(event.eventType, event.category);
  const CategoryIcon = getCategoryIcon(event.category);

  const handleClick = () => {
    if (event.category === 'warehouse' && event.eventType.toLowerCase() === 'packing') {
      navigate(`/warehouse/packing?booking=${event.bookingId}`);
    } else if (event.category === 'logistics') {
      navigate('/logistics/planning');
    } else {
      navigate(`/booking/${event.bookingId}`);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 w-full text-left px-2 py-1 rounded-md transition-colors",
          "hover:bg-accent/50 group"
        )}
      >
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", categoryColor.dot)} />
        <span className="text-xs font-medium truncate flex-1">{event.client}</span>
        <span className={cn("text-[9px] px-1 py-0 rounded border font-medium shrink-0", badgeStyle)}>
          {getEventTypeLabel(event.eventType)}
        </span>
      </button>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group relative rounded-lg border transition-all duration-200 overflow-hidden cursor-pointer",
        categoryColor.bg, categoryColor.border,
        "hover:shadow-sm hover:scale-[1.01]"
      )}
    >
      <div className="p-2.5">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cn(
            "px-2 py-0.5 rounded text-[10px] tracking-wide font-bold border",
            badgeStyle
          )}>
            {getEventTypeLabel(event.eventType)}
          </span>
          {event.bookingNumber && (
            <span className="text-xs font-mono text-muted-foreground">
              #{event.bookingNumber}
            </span>
          )}
          <CategoryIcon className={cn("w-3 h-3 ml-auto", categoryColor.text)} />
        </div>
        
        {/* Client name */}
        <h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1">
          {event.client}
        </h4>
        
        {/* Assigned staff (planning only) */}
        {event.category === 'planning' && (
          <div className="flex items-start gap-1.5">
            <Users className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
            {event.assignedStaff.length === 0 ? (
              <span className="text-xs italic text-muted-foreground/50">
                Ingen tilldelad
              </span>
            ) : (
              <span className="text-xs text-foreground leading-tight">
                {event.assignedStaff.map(s => s.name.split(' ')[0]).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Status for logistics */}
        {event.category === 'logistics' && event.status && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className={cn(
              "w-2 h-2 rounded-full",
              event.status === 'delivered' ? 'bg-primary' :
              event.status === 'in_transit' ? 'bg-secondary animate-pulse' :
              'bg-muted-foreground'
            )} />
            <span className="text-xs text-muted-foreground">
              {event.status === 'delivered' ? 'Levererad' :
               event.status === 'in_transit' ? 'På väg' :
               'Väntar'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardEventCard;
