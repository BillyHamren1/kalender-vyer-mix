import { OpsTimelineStaff } from '@/services/opsControlService';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { User } from 'lucide-react';

interface Props {
  timeline: OpsTimelineStaff[];
  isLoading: boolean;
}

const HOUR_START = 6;
const HOUR_END = 22;
const TOTAL_HOURS = HOUR_END - HOUR_START;

function timeToPercent(timeStr: string | null): number | null {
  if (!timeStr) return null;
  const d = new Date(timeStr);
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.max(0, Math.min(100, ((h - HOUR_START) / TOTAL_HOURS) * 100));
}

const eventTypeColors: Record<string, string> = {
  Rigg: 'bg-primary/80',
  Event: 'bg-amber-500/80',
  Nedrigg: 'bg-secondary/80',
};

const OpsStaffTimeline = ({ timeline, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Personal tidsöversikt</div>
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  return (
    <div>
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
        Personal tidsöversikt — {timeline.length} schemalagda
      </div>

      {/* Hour labels */}
      <div className="flex mb-1 ml-[120px]">
        {hours.map(h => (
          <div key={h} className="flex-1 text-[9px] text-muted-foreground text-center tabular-nums">
            {String(h).padStart(2, '0')}
          </div>
        ))}
      </div>

      {timeline.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Ingen personal schemalagd idag</div>
      ) : (
        <div className="space-y-0.5">
          {timeline.map(staff => (
            <div key={staff.id} className="flex items-center h-7 group">
              {/* Name */}
              <div className="w-[120px] shrink-0 flex items-center gap-1.5 pr-2">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: staff.color || 'hsl(var(--primary))' }}
                />
                <span className="text-[11px] font-medium text-foreground truncate">{staff.name}</span>
              </div>

              {/* Timeline bar */}
              <div className="flex-1 relative bg-muted/40 rounded-sm h-5">
                {/* Grid lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-l border-border/30"
                    style={{ left: `${((h - HOUR_START) / TOTAL_HOURS) * 100}%` }}
                  />
                ))}

                {/* Now indicator */}
                {(() => {
                  const nowPct = timeToPercent(new Date().toISOString());
                  if (nowPct === null || nowPct < 0 || nowPct > 100) return null;
                  return (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-destructive z-10"
                      style={{ left: `${nowPct}%` }}
                    />
                  );
                })()}

                {/* Assignment blocks */}
                {staff.assignments.map((a, i) => {
                  const left = timeToPercent(a.startTime);
                  const right = timeToPercent(a.endTime);
                  if (left === null || right === null) return null;
                  const width = Math.max(right - left, 2);
                  const colorClass = eventTypeColors[a.eventType || ''] || 'bg-primary/60';

                  return (
                    <div
                      key={i}
                      className={`absolute top-0.5 bottom-0.5 rounded-sm ${colorClass} flex items-center px-1 overflow-hidden cursor-default`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${a.client} — ${a.eventType || 'Jobb'} ${a.startTime ? format(new Date(a.startTime), 'HH:mm') : ''}`}
                    >
                      <span className="text-[9px] text-primary-foreground font-medium truncate">
                        {a.client}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 mt-3">
        {Object.entries(eventTypeColors).map(([type, cls]) => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-sm ${cls}`} />
            <span className="text-[9px] text-muted-foreground">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <div className="w-3 h-px bg-destructive" />
          <span className="text-[9px] text-muted-foreground">Nu</span>
        </div>
      </div>
    </div>
  );
};

export default OpsStaffTimeline;
