import { createPortal } from 'react-dom';
import { MapPin, Clock, Tag, Package } from 'lucide-react';
import { format } from 'date-fns';
import type { WarehouseTimelineAssignment } from '@/hooks/useWarehouseStaffTimeline';

interface Props {
  assignment: WarehouseTimelineAssignment;
  staffName: string;
  rect: DOMRect;
}

const typeLabel = (t: string | null | undefined): string => {
  switch (t) {
    case 'packing': return 'Packning';
    case 'delivery': return 'Utleverans';
    case 'return': return 'Retur';
    case 'inventory': return 'Inventering';
    case 'unpacking': return 'Uppackning';
    case 'internal_task': return 'Lageruppgift';
    case 'warehouse_shift': return 'Lagerpass';
    case 'transport': return 'Transport';
    case 'field': return 'Ute i fält';
    default: return t || 'Övrigt';
  }
};

const WarehouseAssignmentTooltip = ({ assignment, staffName, rect }: Props) => {
  const top = rect.bottom + 6;
  const left = Math.min(rect.left, window.innerWidth - 260);

  return createPortal(
    <div
      className="fixed z-[100] w-56 bg-card border border-border rounded-lg shadow-lg p-2.5 pointer-events-none animate-in fade-in duration-100"
      style={{ top, left }}
    >
      <div className="text-xs font-bold text-foreground mb-1 truncate">{assignment.title}</div>
      <div className="text-[10px] text-muted-foreground mb-1.5">{staffName}</div>
      {assignment.bookingNumber && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
          <Tag className="w-3 h-3" /> #{assignment.bookingNumber}
        </div>
      )}
      <div className="space-y-0.5">
        {assignment.startTime && assignment.endTime && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            {format(new Date(assignment.startTime), 'HH:mm')}–{format(new Date(assignment.endTime), 'HH:mm')}
          </div>
        )}
        {assignment.deliveryAddress && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{assignment.deliveryAddress}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Package className="w-3 h-3" />
          Typ: {typeLabel(assignment.eventType)}
        </div>
      </div>
      <div className="text-[9px] text-muted-foreground/60 mt-1.5 pt-1 border-t border-border/30">
        Klicka för detaljer
      </div>
    </div>,
    document.body
  );
};

export default WarehouseAssignmentTooltip;
