import { OpsTimelineStaff } from '@/services/opsControlService';
import { useNavigate } from 'react-router-dom';
import { X, MapPin, Clock, Briefcase, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  staff: OpsTimelineStaff;
  onClose: () => void;
}

const statusLabels = {
  available: 'Tillgänglig',
  assigned: 'Tilldelad',
  off_duty: 'Ej i tjänst',
};

const statusColors = {
  available: 'bg-emerald-500',
  assigned: 'bg-blue-500',
  off_duty: 'bg-muted-foreground/40',
};

const OpsStaffPanel = ({ staff, onClose }: Props) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-card border-l border-border shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: staff.color || 'hsl(var(--primary))' }}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground truncate">{staff.name}</h3>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColors[staff.status]}`} />
              <span className="text-[10px] text-muted-foreground">{statusLabels[staff.status]}</span>
              {staff.role && <span className="text-[10px] text-muted-foreground">· {staff.role}</span>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current job */}
        {staff.currentJob && (
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Pågående jobb</div>
            <div
              className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 cursor-pointer hover:bg-primary/15 transition-colors"
              onClick={() => navigate(`/booking/${staff.currentJob!.bookingId}`)}
            >
              <div className="text-xs font-semibold text-foreground">{staff.currentJob.client}</div>
              {staff.currentJob.bookingNumber && (
                <div className="text-[10px] text-muted-foreground">#{staff.currentJob.bookingNumber}</div>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                {staff.currentJob.deliveryAddress && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MapPin className="w-3 h-3" /> {staff.currentJob.deliveryAddress}
                  </span>
                )}
                {staff.currentJob.startTime && staff.currentJob.endTime && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {format(new Date(staff.currentJob.startTime), 'HH:mm')}–{format(new Date(staff.currentJob.endTime), 'HH:mm')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Next job */}
        {staff.nextJob && (
          <div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Nästa jobb</div>
            <div
              className="p-2.5 rounded-lg bg-muted/50 border border-border cursor-pointer hover:bg-muted transition-colors"
              onClick={() => navigate(`/booking/${staff.nextJob!.bookingId}`)}
            >
              <div className="text-xs font-semibold text-foreground">{staff.nextJob.client}</div>
              <div className="flex items-center gap-3 mt-1">
                {staff.nextJob.startTime && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" /> {format(new Date(staff.nextJob.startTime), 'HH:mm')}
                  </span>
                )}
                {staff.nextJob.deliveryAddress && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate">
                    <MapPin className="w-3 h-3" /> {staff.nextJob.deliveryAddress}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* All assignments */}
        <div>
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Alla uppdrag idag ({staff.assignments.length})
          </div>
          {staff.assignments.length === 0 ? (
            <div className="text-xs text-muted-foreground py-2">Inga uppdrag</div>
          ) : (
            <div className="space-y-1">
              {staff.assignments.map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/booking/${a.bookingId}`)}
                >
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-foreground truncate">{a.client}</div>
                    <div className="text-[9px] text-muted-foreground">
                      {a.eventType || 'Jobb'}
                      {a.startTime && ` · ${format(new Date(a.startTime), 'HH:mm')}`}
                      {a.endTime && `–${format(new Date(a.endTime), 'HH:mm')}`}
                    </div>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Conflict warning */}
        {staff.hasConflict && (
          <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-1">⚠ Konflikt upptäckt</div>
            <div className="text-[10px] text-destructive/80">
              Denna person har överlappande uppdrag. Kontrollera tiderna och omfördela vid behov.
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-3 shrink-0">
        <button
          className="w-full text-xs font-medium text-primary hover:underline"
          onClick={() => navigate(`/staff/${staff.id}`)}
        >
          Öppna personalprofil →
        </button>
      </div>
    </div>
  );
};

export default OpsStaffPanel;
