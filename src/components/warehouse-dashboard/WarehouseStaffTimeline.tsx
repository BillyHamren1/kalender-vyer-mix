import { useMemo, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useWarehouseStaffTimeline,
  type WarehouseTimelineAssignment,
  type WarehouseTimelineStaff,
} from '@/hooks/useWarehouseStaffTimeline';
import WarehouseAssignmentTooltip from './WarehouseAssignmentTooltip';

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

const eventTypeColors: Record<string, { bg: string; border: string; label: string }> = {
  packing:        { bg: 'bg-primary/25', border: 'border-primary', label: 'Packning' },
  delivery:       { bg: 'bg-green-200/75', border: 'border-green-500', label: 'Utleverans' },
  return:         { bg: 'bg-amber-200/75', border: 'border-amber-500', label: 'Retur' },
  inventory:      { bg: 'bg-sky-200/75', border: 'border-sky-500', label: 'Inventering' },
  unpacking:      { bg: 'bg-cyan-200/75', border: 'border-cyan-500', label: 'Uppackning' },
  internal_task:  { bg: 'bg-warehouse/25', border: 'border-warehouse', label: 'Lageruppgift' },
  warehouse_shift:{ bg: 'bg-warehouse/20', border: 'border-warehouse/70', label: 'Lagerpass' },
  transport:      { bg: 'bg-slate-200/75', border: 'border-slate-500', label: 'Transport' },
  field:          { bg: 'bg-emerald-200/75', border: 'border-emerald-500', label: 'Ute i fält' },
};

const statusConfig = {
  available: { dot: 'bg-emerald-500', label: 'Tillgänglig' },
  assigned: { dot: 'bg-blue-500', label: 'Tilldelad' },
  off_duty: { dot: 'bg-muted-foreground/40', label: 'Ej i tjänst' },
};

interface Props {
  date: Date;
  onNextDay: () => void;
  onPrevDay: () => void;
  onToday: () => void;
}

const WarehouseStaffTimeline = ({ date, onNextDay, onPrevDay, onToday }: Props) => {
  const navigate = useNavigate();
  const { timeline, isLoading } = useWarehouseStaffTimeline(date);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredAssignment, setHoveredAssignment] = useState<{
    assignment: WarehouseTimelineAssignment;
    staffName: string;
    rect: DOMRect;
  } | null>(null);

  const showNow = isToday(date);
  const nowPct = useMemo(
    () => (showNow ? timeToPercent(new Date().toISOString()) : null),
    [showNow],
  );
  const hours = useMemo(() => Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i), []);

  const filteredAndGrouped = useMemo(() => {
    const activeStaff = timeline.filter((s) => s.status !== 'off_duty');
    const teamGroups = new Map<string, { teamName: string; staff: WarehouseTimelineStaff[] }>();
    const unassigned: WarehouseTimelineStaff[] = [];

    for (const s of activeStaff) {
      if (s.teamId && s.teamName) {
        if (!teamGroups.has(s.teamId)) {
          teamGroups.set(s.teamId, { teamName: s.teamName, staff: [] });
        }
        teamGroups.get(s.teamId)!.staff.push(s);
      } else {
        unassigned.push(s);
      }
    }

    const sortedTeams = [...teamGroups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true }),
    );
    return { sortedTeams, unassigned };
  }, [timeline]);

  const handleAssignmentClick = (a: WarehouseTimelineAssignment) => {
    if (a.packingProjectId) {
      navigate(`/warehouse/packing/${a.packingProjectId}`);
      return;
    }
    if (a.eventType === 'transport') {
      navigate('/warehouse/transport');
      return;
    }
    if (a.bookingId) {
      navigate(`/booking/${a.bookingId}`);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-3 shadow-sm">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
          Tidsöversikt
        </div>
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-9 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const assignedCount = timeline.filter((s) => s.status === 'assigned').length;
  const availableCount = timeline.filter((s) => s.status === 'available').length;
  const conflictCount = timeline.filter((s) => s.hasConflict).length;
  const totalAssignments = timeline.reduce((sum, s) => sum + s.assignments.length, 0);

  const renderStaffRow = (staff: WarehouseTimelineStaff) => {
    const cfg = statusConfig[staff.status];
    const isConflict = staff.hasConflict;

    return (
      <div
        key={staff.id}
        className={`flex items-stretch rounded-sm transition-all ${
          isConflict ? 'bg-destructive/5' : ''
        } group`}
      >
        <div
          className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-l-sm select-none"
          style={{ width: NAME_COL_W }}
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
              {staff.name}
            </div>
            <div className="text-[9px] text-muted-foreground truncate leading-tight">
              {staff.currentJob
                ? staff.currentJob.title
                : staff.nextJob
                ? `Nästa: ${staff.nextJob.title}`
                : cfg.label}
            </div>
          </div>
          {isConflict && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
        </div>

        <div className="flex-1 relative h-9 my-auto">
          <div className="absolute inset-0 rounded-r-sm bg-muted/25">
            {hours.map((h) => (
              <div
                key={h}
                className={`absolute top-0 bottom-0 border-l ${
                  h % 3 === 0 ? 'border-border/40' : 'border-border/15'
                }`}
                style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
              />
            ))}
          </div>

          {nowPct !== null && nowPct >= 0 && nowPct <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive/70 z-20"
              style={{ left: `${nowPct}%` }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-destructive absolute -top-0.5 -left-[2px]" />
            </div>
          )}

          {staff.assignments.map((a, i) => {
            const left = timeToPercent(a.startTime);
            const right = timeToPercent(a.endTime);
            // For items without start/end (e.g. plain "lagerpass"), show a faint full-width chip
            if (left === null || right === null) {
              return (
                <div
                  key={`${a.id}-${i}`}
                  className="absolute top-1 bottom-1 left-1 right-1 rounded border-l-2 border-dashed border-warehouse/40 bg-warehouse/10 flex items-center px-1.5 overflow-hidden cursor-pointer z-0 hover:brightness-110"
                  onClick={() => handleAssignmentClick(a)}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoveredAssignment({ assignment: a, staffName: staff.name, rect });
                  }}
                  onMouseLeave={() => setHoveredAssignment(null)}
                >
                  <div className="text-[9px] text-foreground/70 italic truncate">
                    {a.title} · ingen tid
                  </div>
                </div>
              );
            }
            const width = Math.max(right - left, 3);
            const colors =
              eventTypeColors[a.eventType || ''] || {
                bg: 'bg-muted/60',
                border: 'border-muted',
                label: a.eventType || '',
              };
            const isActive =
              showNow &&
              a.startTime &&
              a.endTime &&
              new Date(a.startTime) <= new Date() &&
              new Date(a.endTime) >= new Date();

            return (
              <div
                key={`${a.id}-${i}`}
                className={`absolute top-1 bottom-1 rounded border-l-2 ${colors.bg} ${colors.border}
                  flex items-center px-1.5 overflow-hidden cursor-pointer z-10
                  hover:brightness-110 hover:shadow-sm transition-all
                  ${isActive ? 'ring-1 ring-foreground/20 shadow-sm' : ''}
                `}
                style={{ left: `${left}%`, width: `${width}%` }}
                onClick={() => handleAssignmentClick(a)}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setHoveredAssignment({ assignment: a, staffName: staff.name, rect });
                }}
                onMouseLeave={() => setHoveredAssignment(null)}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-foreground font-semibold truncate leading-tight">
                    {a.title}
                  </div>
                  {width > 8 && (
                    <div className="text-[8px] text-foreground/70 truncate leading-tight">
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
        </div>
      </div>
    );
  };

  const { sortedTeams, unassigned } = filteredAndGrouped;
  const hasContent = sortedTeams.length > 0 || unassigned.length > 0;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-3 shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Tidsöversikt
          </div>
          <div className="flex items-center gap-1 bg-muted/50 rounded-md px-1">
            <button onClick={onPrevDay} className="p-0.5 hover:bg-muted rounded transition-colors">
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button
              onClick={onToday}
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                isToday(date) ? 'text-primary font-bold' : 'text-foreground hover:bg-muted'
              }`}
            >
              {isToday(date) ? 'Idag' : format(date, 'EEE d MMM', { locale: sv })}
            </button>
            <button onClick={onNextDay} className="p-0.5 hover:bg-muted rounded transition-colors">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
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

      {/* Hour header */}
      <div className="flex shrink-0 mb-0.5" style={{ paddingLeft: NAME_COL_W }}>
        {hours.map((h) => (
          <div key={h} className="flex-1 text-center">
            <span className="text-[9px] text-muted-foreground tabular-nums font-medium">
              {String(h).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-y-auto max-h-[560px] min-h-0" ref={timelineRef}>
        {!hasContent ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Ingen aktiv lagerpersonal{' '}
            {isToday(date) ? 'idag' : format(date, 'd MMMM', { locale: sv })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sortedTeams.map(([teamId, group]) => (
              <div key={teamId}>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 rounded-sm mb-px">
                  <div className="w-1.5 h-1.5 rounded-sm bg-warehouse/70" />
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                    {group.teamName}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">({group.staff.length})</span>
                </div>
                <div className="space-y-px pl-1 border-l-2 border-warehouse/15 ml-2">
                  {group.staff.map(renderStaffRow)}
                </div>
              </div>
            ))}

            {unassigned.length > 0 && (
              <div>
                {sortedTeams.length > 0 && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-muted/40 rounded-sm mb-px mt-1">
                    <div className="w-1.5 h-1.5 rounded-sm bg-emerald-500/60" />
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                      Ej tilldelade lagerteam
                    </span>
                    <span className="text-[9px] text-muted-foreground/60">({unassigned.length})</span>
                  </div>
                )}
                <div className="space-y-px">{unassigned.map(renderStaffRow)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap mt-2 pt-2 border-t border-border/30 shrink-0">
        {Object.entries(eventTypeColors).map(([type, { bg, label }]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-sm ${bg}`} />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
        {showNow && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-destructive/70 rounded" />
            <span className="text-[9px] text-muted-foreground">Nu</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] text-muted-foreground italic">
            {totalAssignments} pass · klicka för detaljer
          </span>
        </div>
      </div>

      {hoveredAssignment && (
        <WarehouseAssignmentTooltip
          assignment={hoveredAssignment.assignment}
          staffName={hoveredAssignment.staffName}
          rect={hoveredAssignment.rect}
        />
      )}
    </div>
  );
};

export default WarehouseStaffTimeline;
