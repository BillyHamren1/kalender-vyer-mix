import { useState, useRef, useCallback, useMemo } from 'react';
import { OpsTimelineStaff, OpsTimelineAssignment } from '@/services/opsControlService';
import { assignStaffToBooking } from '@/services/planningDashboardService';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, MapPin, Clock } from 'lucide-react';
import OpsStaffPanel from './OpsStaffPanel';
import OpsAssignmentTooltip from './OpsAssignmentTooltip';

interface Props {
  timeline: OpsTimelineStaff[];
  isLoading: boolean;
  onOpenDM?: (staffId: string, staffName: string) => void;
}

const HOUR_START = 6;
const HOUR_END = 24;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const NAME_COL_W = 180;

function timeToPercent(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const d = new Date(timeStr);
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.max(0, Math.min(100, ((h - HOUR_START) / TOTAL_HOURS) * 100));
}

const eventTypeColors: Record<string, { bg: string; border: string }> = {
  Rigg: { bg: 'bg-primary/75', border: 'border-primary' },
  Event: { bg: 'bg-amber-500/75', border: 'border-amber-500' },
  Nedrigg: { bg: 'bg-secondary/75', border: 'border-secondary' },
};

const statusConfig = {
  available: { dot: 'bg-emerald-500', label: 'Tillgänglig' },
  assigned: { dot: 'bg-blue-500', label: 'Tilldelad' },
  off_duty: { dot: 'bg-muted-foreground/40', label: 'Ej i tjänst' },
};

const OpsStaffTimeline = ({ timeline, isLoading, onOpenDM }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timelineRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [dragStaffId, setDragStaffId] = useState<string | null>(null);
  const [dragOverBookingId, setDragOverBookingId] = useState<string | null>(null);
  const [dragOverStaffId, setDragOverStaffId] = useState<string | null>(null);

  // Panel state
  const [selectedStaff, setSelectedStaff] = useState<OpsTimelineStaff | null>(null);
  const [hoveredAssignment, setHoveredAssignment] = useState<{ assignment: OpsTimelineAssignment; staffName: string; rect: DOMRect } | null>(null);

  // Now indicator
  const nowPct = useMemo(() => timeToPercent(new Date().toISOString()), []);
  const hours = useMemo(() => Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i), []);

  // Drag handlers for staff rows (drag staff to another staff's assignment)
  const handleDragStart = useCallback((staffId: string) => {
    setDragStaffId(staffId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, staffId: string, bookingId?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStaffId(staffId);
    if (bookingId) setDragOverBookingId(bookingId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStaffId(null);
    setDragOverBookingId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetBookingId: string) => {
    e.preventDefault();
    if (!dragStaffId || !targetBookingId) return;

    try {
      await assignStaffToBooking(dragStaffId, targetBookingId, new Date());
      toast.success('Personal tilldelad till jobb');
      queryClient.invalidateQueries({ queryKey: ['ops-control'] });
    } catch {
      toast.error('Kunde inte tilldela personal');
    } finally {
      setDragStaffId(null);
      setDragOverStaffId(null);
      setDragOverBookingId(null);
    }
  }, [dragStaffId, queryClient]);

  const handleAssignmentClick = useCallback((bookingId: string) => {
    navigate(`/booking/${bookingId}`);
  }, [navigate]);

  const handleStaffClick = useCallback((staff: OpsTimelineStaff) => {
    setSelectedStaff(prev => prev?.id === staff.id ? null : staff);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Personal tidsöversikt</div>
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
    );
  }

  const assignedCount = timeline.filter(s => s.status === 'assigned').length;
  const availableCount = timeline.filter(s => s.status === 'available').length;
  const conflictCount = timeline.filter(s => s.hasConflict).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Tidsöversikt
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> {assignedCount} tilldelade
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> {availableCount} lediga
          </span>
          {conflictCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-destructive font-medium">
              <AlertTriangle className="w-3 h-3" /> {conflictCount} konflikter
            </span>
          )}
        </div>
      </div>

      {/* Sticky hour header */}
      <div className="flex shrink-0 mb-0.5" style={{ paddingLeft: NAME_COL_W }}>
        {hours.map(h => (
          <div key={h} className="flex-1 text-center">
            <span className="text-[9px] text-muted-foreground tabular-nums font-medium">
              {String(h).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div className="flex-1 overflow-y-auto min-h-0" ref={timelineRef}>
        {timeline.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Ingen aktiv personal idag</div>
        ) : (
          <div className="space-y-px">
            {timeline.map(staff => {
              const cfg = statusConfig[staff.status];
              const isDragOver = dragOverStaffId === staff.id;
              const isConflict = staff.hasConflict;

              return (
                <div
                  key={staff.id}
                  className={`flex items-stretch rounded-sm transition-all ${
                    isDragOver ? 'bg-primary/5 ring-1 ring-primary/30' : ''
                  } ${isConflict ? 'bg-destructive/5' : ''} group`}
                  onDragOver={e => handleDragOver(e, staff.id)}
                  onDragLeave={handleDragLeave}
                >
                  {/* Staff info column */}
                  <div
                    className="shrink-0 flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-muted/50 rounded-l-sm select-none"
                    style={{ width: NAME_COL_W }}
                    draggable={staff.status !== 'off_duty'}
                    onDragStart={() => handleDragStart(staff.id)}
                    onClick={() => handleStaffClick(staff)}
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />

                    {/* Color bar */}
                    <div
                      className="w-1 h-6 rounded-full shrink-0"
                      style={{ backgroundColor: staff.color || 'hsl(var(--muted))' }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                        {staff.name}
                      </div>
                      <div className="text-[9px] text-muted-foreground truncate leading-tight">
                        {staff.currentJob
                          ? staff.currentJob.client
                          : staff.nextJob
                          ? `Nästa: ${staff.nextJob.client}`
                          : staff.role || cfg.label}
                      </div>
                    </div>

                    {isConflict && (
                      <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                    )}

                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>

                  {/* Timeline bar */}
                  <div className="flex-1 relative h-9 my-auto">
                    {/* Background with grid */}
                    <div className="absolute inset-0 rounded-r-sm bg-muted/25">
                      {hours.map(h => (
                        <div
                          key={h}
                          className={`absolute top-0 bottom-0 border-l ${h % 3 === 0 ? 'border-border/40' : 'border-border/15'}`}
                          style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
                        />
                      ))}
                    </div>

                    {/* Now line */}
                    {nowPct !== null && nowPct >= 0 && nowPct <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-destructive/70 z-20"
                        style={{ left: `${nowPct}%` }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute -top-0.5 -left-[2px]" />
                      </div>
                    )}

                    {/* Assignment blocks */}
                    {staff.assignments.map((a, i) => {
                      const left = timeToPercent(a.startTime);
                      const right = timeToPercent(a.endTime);
                      if (left === null || right === null) return null;
                      const width = Math.max(right - left, 3);
                      const colors = eventTypeColors[a.eventType || ''] || { bg: 'bg-primary/60', border: 'border-primary/40' };
                      const isActive = a.startTime && a.endTime &&
                        new Date(a.startTime) <= new Date() && new Date(a.endTime) >= new Date();
                      const isDragTarget = dragOverBookingId === a.bookingId && isDragOver;

                      return (
                        <div
                          key={`${a.bookingId}-${i}`}
                          className={`absolute top-1 bottom-1 rounded border-l-2 ${colors.bg} ${colors.border} 
                            flex items-center px-1.5 overflow-hidden cursor-pointer z-10
                            hover:brightness-110 hover:shadow-sm transition-all
                            ${isActive ? 'ring-1 ring-foreground/20 shadow-sm' : ''}
                            ${isDragTarget ? 'ring-2 ring-primary scale-[1.02]' : ''}
                          `}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          onClick={() => handleAssignmentClick(a.bookingId)}
                          onDragOver={e => { e.stopPropagation(); handleDragOver(e, staff.id, a.bookingId); }}
                          onDrop={e => handleDrop(e, a.bookingId)}
                          onMouseEnter={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredAssignment({ assignment: a, staffName: staff.name, rect });
                          }}
                          onMouseLeave={() => setHoveredAssignment(null)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] text-primary-foreground font-semibold truncate leading-tight">
                              {a.client}
                            </div>
                            {width > 8 && (
                              <div className="text-[8px] text-primary-foreground/70 truncate leading-tight">
                                {a.startTime ? format(new Date(a.startTime), 'HH:mm') : ''}
                                {a.endTime ? `–${format(new Date(a.endTime), 'HH:mm')}` : ''}
                              </div>
                            )}
                          </div>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse shrink-0" />
                          )}
                        </div>
                      );
                    })}

                    {/* Drop zone for available staff rows with no assignments */}
                    {staff.assignments.length === 0 && staff.status !== 'off_duty' && dragStaffId && (
                      <div className="absolute inset-0 flex items-center justify-center text-[9px] text-muted-foreground">
                        Släpp här för att tilldela
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/30 shrink-0">
        {Object.entries(eventTypeColors).map(([type, { bg }]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-sm ${bg}`} />
            <span className="text-[9px] text-muted-foreground">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-destructive/70 rounded" />
          <span className="text-[9px] text-muted-foreground">Nu</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-muted-foreground italic">Dra personal → block för att tilldela</span>
        </div>
      </div>

      {/* Staff detail panel (slide-in) */}
      {selectedStaff && (
        <OpsStaffPanel staff={selectedStaff} onClose={() => setSelectedStaff(null)} onOpenDM={(staffId, staffName) => {
          setSelectedStaff(null);
          onOpenDM?.(staffId, staffName);
        }} />
      )}

      {/* Assignment tooltip */}
      {hoveredAssignment && (
        <OpsAssignmentTooltip
          assignment={hoveredAssignment.assignment}
          staffName={hoveredAssignment.staffName}
          rect={hoveredAssignment.rect}
        />
      )}
    </div>
  );
};

export default OpsStaffTimeline;
