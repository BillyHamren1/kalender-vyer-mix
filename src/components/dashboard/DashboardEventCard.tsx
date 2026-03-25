import { Calendar, Users, Package, Truck, MapPin, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DashboardEvent, EventCategory } from "@/hooks/useDashboardEvents";
import { useNavigate } from "react-router-dom";
import { usePackingProgressContext } from "./PackingProgressProvider";
import { PackingProgress } from "@/hooks/usePackingProgress";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

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

// Packing status color config
const PACKING_STATUS_STYLES: Record<string, { bg: string; bar: string; text: string; label: string }> = {
  planning:     { bg: 'bg-muted',         bar: 'bg-muted-foreground/30', text: 'text-muted-foreground', label: 'Ej påbörjad' },
  in_progress:  { bg: 'bg-blue-500/10',   bar: 'bg-blue-500',           text: 'text-blue-600',         label: 'Pågår' },
  packed:       { bg: 'bg-emerald-500/10', bar: 'bg-emerald-500',        text: 'text-emerald-600',      label: 'Packad' },
  delivered:    { bg: 'bg-emerald-700/10', bar: 'bg-emerald-700',        text: 'text-emerald-700',      label: 'Levererad' },
  cancelled:    { bg: 'bg-destructive/10', bar: 'bg-destructive',        text: 'text-destructive',      label: 'Avbokad' },
};

function PackingProgressBar({ progress }: { progress: PackingProgress }) {
  const style = PACKING_STATUS_STYLES[progress.status] || PACKING_STATUS_STYLES.planning;
  const pct = progress.totalItems > 0 ? Math.min(100, Math.round((progress.scannedItems / progress.totalItems) * 100)) : 0;

  // Edge states
  const getStatusText = () => {
    if (progress.totalItems === 0) return 'Inga artiklar';
    if (progress.scannedItems === 0) return 'Ej påbörjad';
    if (progress.scannedItems >= progress.totalItems) return 'Klar för leverans';
    return `${progress.scannedItems} / ${progress.totalItems} packade`;
  };

  return (
    <div className={cn("mt-1 rounded px-1.5 py-1", style.bg)}>
      {/* Status + count row */}
      <div className="flex items-center justify-between gap-1 mb-0.5">
        <div className="flex items-center gap-1">
          <Package className={cn("w-2.5 h-2.5", style.text)} />
          <span className={cn("text-[9px] font-semibold", style.text)}>{style.label}</span>
        </div>
        {progress.totalItems > 0 && progress.remainingItems > 0 && (
          <span className="text-[9px] text-muted-foreground">{progress.remainingItems} kvar</span>
        )}
      </div>

      {/* Progress bar */}
      {progress.totalItems > 0 && (
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", style.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Text summary */}
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[9px] text-muted-foreground">{getStatusText()}</span>
        {progress.lastActivity && (
          <span className="text-[8px] text-muted-foreground/70 flex items-center gap-0.5">
            <Clock className="w-2 h-2" />
            {formatDistanceToNow(new Date(progress.lastActivity), { addSuffix: true, locale: sv })}
          </span>
        )}
      </div>
    </div>
  );
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
  const progressMap = usePackingProgressContext();
  const packingProgress = event.category === 'planning' ? progressMap.get(event.bookingId) : undefined;

  const handleClick = () => {
    if (event.category === 'warehouse' && event.eventType.toLowerCase() === 'packing') {
      navigate(`/warehouse/packing?booking=${event.bookingId}`);
    } else if (event.category === 'logistics') {
      navigate('/logistics/planning');
    } else if (event.category === 'planning' && packingProgress?.packingId) {
      // Navigate to scanner with the exact packing job
      navigate(`/scanner?packingId=${packingProgress.packingId}`);
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
        "group relative rounded border transition-all duration-200 overflow-hidden cursor-pointer",
        categoryColor.bg, categoryColor.border,
        "hover:shadow-sm"
      )}
    >
      <div className="px-2 py-1.5">
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn(
            "px-1.5 py-px rounded text-[9px] tracking-wide font-bold border shrink-0",
            badgeStyle
          )}>
            {getEventTypeLabel(event.eventType)}
          </span>
          {event.bookingNumber && (
            <span className="text-[10px] font-mono text-muted-foreground truncate">
              #{event.bookingNumber}
            </span>
          )}
          <CategoryIcon className={cn("w-2.5 h-2.5 ml-auto shrink-0", categoryColor.text)} />
        </div>
        
        {/* Client name - single line */}
        <h4 className="font-semibold text-xs text-foreground truncate mb-0.5">
          {event.client}
        </h4>
        
        {/* Assigned staff (planning only) */}
        {event.category === 'planning' && (
          <div className="flex items-center gap-1">
            <Users className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
            {event.assignedStaff.length === 0 ? (
              <span className="text-[10px] italic text-muted-foreground/50">
                Ingen tilldelad
              </span>
            ) : (
              <span className="text-[10px] text-foreground leading-tight truncate">
                {event.assignedStaff.map(s => s.name.split(' ')[0]).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* Packing progress (planning only) */}
        {event.category === 'planning' && packingProgress && (
          <PackingProgressBar progress={packingProgress} />
        )}
        {event.category === 'planning' && !packingProgress && (
          <div className="mt-1 rounded px-1.5 py-0.5 bg-muted">
            <div className="flex items-center gap-1">
              <Package className="w-2.5 h-2.5 text-muted-foreground/50" />
              <span className="text-[9px] text-muted-foreground/60 italic">Ingen packning</span>
            </div>
          </div>
        )}

        {/* Status for logistics */}
        {event.category === 'logistics' && event.status && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              event.status === 'delivered' ? 'bg-primary' :
              event.status === 'in_transit' ? 'bg-secondary animate-pulse' :
              'bg-muted-foreground'
            )} />
            <span className="text-[10px] text-muted-foreground">
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
