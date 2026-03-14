import { createPortal } from 'react-dom';
import { OpsTimelineAssignment } from '@/services/opsControlService';
import { MapPin, Clock, Tag } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  assignment: OpsTimelineAssignment;
  staffName: string;
  rect: DOMRect;
}

const OpsAssignmentTooltip = ({ assignment, staffName, rect }: Props) => {
  const top = rect.bottom + 6;
  const left = Math.min(rect.left, window.innerWidth - 260);

  return createPortal(
    <div
      className="fixed z-[100] w-56 bg-card border border-border rounded-lg shadow-lg p-2.5 pointer-events-none animate-in fade-in duration-100"
      style={{ top, left }}
    >
      <div className="text-xs font-bold text-foreground mb-1">{assignment.client}</div>
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
        {assignment.eventType && (
          <div className="text-[10px] text-muted-foreground">
            Typ: {assignment.eventType}
          </div>
        )}
      </div>
      <div className="text-[9px] text-muted-foreground/60 mt-1.5 pt-1 border-t border-border/30">
        Klicka för jobbdetaljer
      </div>
    </div>,
    document.body
  );
};

export default OpsAssignmentTooltip;
