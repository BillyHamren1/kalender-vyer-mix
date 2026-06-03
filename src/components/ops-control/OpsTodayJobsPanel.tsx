import { useMemo, useState } from 'react';
import { Users, MapPin, Clock, AlertTriangle, CheckCircle2, Play, Pause, Truck } from 'lucide-react';
import type { OpsMapJob, OpsTimelineStaff } from '@/services/opsControlService';
import { extractClockTime } from '@/services/opsControlService';

export type TodayJobStatus =
  | 'not_started'
  | 'on_way'
  | 'on_site'
  | 'started'
  | 'missing_staff'
  | 'late_start'
  | 'done';

interface OpsTodayJobsPanelProps {
  mapJobs: OpsMapJob[];
  timeline: OpsTimelineStaff[];
  isLoading?: boolean;
  onFocusJob?: (job: OpsMapJob) => void;
  selectedBookingId?: string | null;
}

type FilterKey = 'all' | 'not_started' | 'on_way' | 'on_site' | 'started' | 'issues';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alla' },
  { key: 'not_started', label: 'Ej påbörjade' },
  { key: 'on_way', label: 'På väg' },
  { key: 'on_site', label: 'På plats' },
  { key: 'started', label: 'Påbörjade' },
  { key: 'issues', label: 'Avvikelser' },
];

interface JobRow {
  job: OpsMapJob;
  plannedStaff: number;
  staffOnSite: number;
  actualStartClock: string | null;
  status: TodayJobStatus;
  progress: number; // 0-1
}

function statusBadge(status: TodayJobStatus, actualStart?: string | null) {
  const map: Record<TodayJobStatus, { label: string; bg: string; fg: string; icon: any }> = {
    not_started: { label: 'Ej påbörjad', bg: 'hsl(220 14% 94%)', fg: 'hsl(220 20% 38%)', icon: Pause },
    on_way: { label: 'På väg', bg: 'hsl(38 90% 92%)', fg: 'hsl(28 70% 32%)', icon: Truck },
    on_site: { label: 'På plats', bg: 'hsl(150 55% 92%)', fg: 'hsl(150 50% 26%)', icon: MapPin },
    started: { label: actualStart ? `Påbörjat ${actualStart}` : 'Påbörjat', bg: 'hsl(150 60% 90%)', fg: 'hsl(150 55% 24%)', icon: Play },
    missing_staff: { label: 'Saknar personal', bg: 'hsl(0 80% 94%)', fg: 'hsl(0 65% 38%)', icon: AlertTriangle },
    late_start: { label: 'Sen start', bg: 'hsl(28 90% 92%)', fg: 'hsl(18 75% 34%)', icon: AlertTriangle },
    done: { label: 'Klar', bg: 'hsl(220 14% 94%)', fg: 'hsl(220 20% 38%)', icon: CheckCircle2 },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.fg }}
    >
      <Icon className="w-3 h-3" strokeWidth={2.4} />
      {s.label}
    </span>
  );
}

function eventTypeLabel(t: string | null): string {
  if (!t) return '—';
  const map: Record<string, string> = { rig: 'Rigg', event: 'Event', rigdown: 'Riv', rig_down: 'Riv' };
  return map[t.toLowerCase()] ?? t;
}

const OpsTodayJobsPanel = ({
  mapJobs,
  timeline,
  isLoading,
  onFocusJob,
  selectedBookingId,
}: OpsTodayJobsPanelProps) => {
  const [filter, setFilter] = useState<FilterKey>('all');

  const rows: JobRow[] = useMemo(() => {
    const now = new Date();
    return mapJobs.map((job) => {
      const plannedStaff = job.assignedStaff.length;
      // staff actually working on this booking right now
      const onSiteList = timeline.filter(s => s.currentJob?.bookingId === job.bookingId);
      const staffOnSite = onSiteList.length;
      const actualStartClock =
        onSiteList
          .map(s => s.currentJob?.startClock)
          .filter((v): v is string => !!v)
          .sort()[0] || null;

      const start = job.startTime ? new Date(job.startTime) : null;
      const end = job.endTime ? new Date(job.endTime) : null;
      const startedAlready = staffOnSite > 0;
      const ended = !!(end && end < now && !startedAlready);

      let status: TodayJobStatus;
      if (plannedStaff === 0) status = 'missing_staff';
      else if (ended) status = 'done';
      else if (startedAlready) status = 'started';
      else if (start && start < now) status = 'late_start';
      else status = 'not_started';

      let progress = 0;
      if (start && end) {
        const total = end.getTime() - start.getTime();
        const elapsed = now.getTime() - start.getTime();
        progress = Math.max(0, Math.min(1, total > 0 ? elapsed / total : 0));
      }

      return { job, plannedStaff, staffOnSite, actualStartClock, status, progress };
    }).sort((a, b) => {
      const at = a.job.startTime || '';
      const bt = b.job.startTime || '';
      return at.localeCompare(bt);
    });
  }, [mapJobs, timeline]);

  const counts = useMemo(() => ({
    all: rows.length,
    not_started: rows.filter(r => r.status === 'not_started').length,
    on_way: rows.filter(r => r.status === 'on_way').length,
    on_site: rows.filter(r => r.status === 'on_site' || r.status === 'started').length,
    started: rows.filter(r => r.status === 'started').length,
    issues: rows.filter(r => r.status === 'missing_staff' || r.status === 'late_start').length,
  }), [rows]);

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    if (filter === 'issues') return rows.filter(r => r.status === 'missing_staff' || r.status === 'late_start');
    if (filter === 'on_site') return rows.filter(r => r.status === 'on_site' || r.status === 'started');
    return rows.filter(r => r.status === filter);
  }, [rows, filter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-3.5 pb-2 overflow-x-auto hide-scrollbar shrink-0">
        {FILTERS.map(f => {
          const active = f.key === filter;
          const c = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
              style={{
                background: active ? 'hsl(270 55% 58%)' : 'hsl(270 30% 96%)',
                color: active ? 'white' : 'hsl(270 18% 36%)',
                border: active ? '1px solid hsl(270 55% 50%)' : '1px solid hsl(270 25% 88%)',
              }}
            >
              {f.label}
              <span
                className="tabular-nums text-[10px] px-1 rounded"
                style={{
                  background: active ? 'hsl(0 0% 100% / 0.22)' : 'hsl(270 20% 90%)',
                  color: active ? 'white' : 'hsl(270 18% 42%)',
                }}
              >
                {c}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2">
        {isLoading ? (
          <div className="text-xs text-muted-foreground px-3 py-4">Laddar jobb…</div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground px-3 py-4">Inga jobb matchar filtret.</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {filtered.map(({ job, plannedStaff, staffOnSite, actualStartClock, status, progress }) => {
              const isSelected = selectedBookingId === job.bookingId;
              const startClock = extractClockTime(job.startTime);
              const endClock = extractClockTime(job.endTime);
              return (
                <li key={job.bookingId}>
                  <button
                    onClick={() => onFocusJob?.(job)}
                    className="w-full text-left rounded-lg px-3 py-2 transition-all hover:brightness-[0.99]"
                    style={{
                      background: isSelected
                        ? 'linear-gradient(180deg, hsl(270 55% 96%) 0%, hsl(275 50% 94%) 100%)'
                        : 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(270 30% 99%) 100%)',
                      border: isSelected
                        ? '1px solid hsl(270 55% 70%)'
                        : '1px solid hsl(270 22% 90%)',
                      boxShadow: isSelected
                        ? '0 1px 3px hsl(270 50% 35% / 0.18)'
                        : '0 1px 2px hsl(270 30% 25% / 0.04)',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0"
                            style={{ background: 'hsl(270 30% 94%)', color: 'hsl(270 30% 30%)' }}
                          >
                            {eventTypeLabel(job.eventType)}
                          </span>
                          <span
                            className="text-[12.5px] font-semibold truncate"
                            style={{ color: 'hsl(280 35% 18%)' }}
                            title={job.client}
                          >
                            {job.client || '—'}
                          </span>
                          {job.bookingNumber && (
                            <span className="text-[10px] text-muted-foreground shrink-0">#{job.bookingNumber}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {job.deliveryAddress && (
                            <span className="inline-flex items-center gap-1 truncate" title={job.deliveryAddress}>
                              <MapPin className="w-3 h-3 shrink-0" strokeWidth={2} />
                              <span className="truncate">{job.deliveryAddress}</span>
                            </span>
                          )}
                          {(startClock || endClock) && (
                            <span className="inline-flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" strokeWidth={2} />
                              <span className="tabular-nums">{startClock || '—'}–{endClock || '—'}</span>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 shrink-0">
                            <Users className="w-3 h-3" strokeWidth={2} />
                            <span className="tabular-nums">
                              {staffOnSite}/{plannedStaff}
                            </span>
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {statusBadge(status, actualStartClock)}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div
                      className="mt-1.5 h-1 rounded-full overflow-hidden"
                      style={{ background: 'hsl(270 20% 92%)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round(progress * 100)}%`,
                          background:
                            status === 'started' || status === 'on_site'
                              ? 'linear-gradient(90deg, hsl(150 55% 50%), hsl(150 55% 40%))'
                              : status === 'missing_staff' || status === 'late_start'
                              ? 'linear-gradient(90deg, hsl(0 70% 60%), hsl(15 75% 50%))'
                              : 'linear-gradient(90deg, hsl(270 50% 60%), hsl(282 50% 50%))',
                        }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default OpsTodayJobsPanel;
