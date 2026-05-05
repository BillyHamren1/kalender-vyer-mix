import { Activity, Wifi, WifiOff, MapPin, Play, Square, Plane, LogIn, Clock, Sun, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MiniTimelineEvent = {
  at: string;                     // ISO
  end?: string | null;            // ISO if range
  type:
    | 'workday_start'
    | 'arrival'
    | 'on_site'
    | 'timer_start'
    | 'timer_stop'
    | 'travel'
    | 'left'
    | 'signal_lost'
    | 'note';
  label: string;
  status?: string;
  staff_name?: string;
};

interface Props {
  events: MiniTimelineEvent[];
  /** Max rows to show (default 4). Excess collapsed into "+N tidigare" */
  maxRows?: number;
  /** Highlight ongoing vibe with emerald background (job in progress, etc.) */
  ongoing?: boolean;
  className?: string;
}

const ICONS: Record<MiniTimelineEvent['type'], React.ComponentType<{ className?: string }>> = {
  workday_start: Sun,
  arrival: LogIn,
  on_site: MapPin,
  timer_start: Play,
  timer_stop: Square,
  travel: Plane,
  left: Square,
  signal_lost: WifiOff,
  note: Clock,
};

const TONE: Record<MiniTimelineEvent['type'], string> = {
  workday_start: 'text-amber-600',
  arrival: 'text-emerald-600',
  on_site: 'text-emerald-600',
  timer_start: 'text-emerald-600',
  timer_stop: 'text-muted-foreground',
  travel: 'text-sky-600',
  left: 'text-muted-foreground',
  signal_lost: 'text-amber-600',
  note: 'text-muted-foreground',
};

function fmtHm(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function OpsMiniTimeline({ events, maxRows = 4, ongoing, className }: Props) {
  if (!events || events.length === 0) return null;

  const sorted = [...events].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const tail = sorted.slice(-maxRows);
  const hidden = sorted.length - tail.length;

  return (
    <div
      className={cn(
        'px-3 py-2 border-b border-border/60 text-[11px] space-y-0.5',
        ongoing ? 'bg-emerald-500/10' : 'bg-muted/40',
        className,
      )}
    >
      {hidden > 0 && (
        <div className="text-[10px] text-muted-foreground">+{hidden} tidigare händelser</div>
      )}
      {tail.map((e, i) => {
        const Icon = ICONS[e.type] ?? Activity;
        return (
          <div key={i} className="flex items-center gap-1.5 leading-tight">
            <Icon className={cn('w-3 h-3 shrink-0', TONE[e.type] ?? 'text-muted-foreground')} />
            <span className="tabular-nums text-muted-foreground w-10 shrink-0">{fmtHm(e.at)}</span>
            <span className="truncate flex-1">
              {e.label}
              {e.staff_name && <span className="text-muted-foreground"> · {e.staff_name}</span>}
            </span>
            {e.type === 'signal_lost' && <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />}
          </div>
        );
      })}
    </div>
  );
}

/** Build mini-timeline events from a job's jobActivity payload. */
export function buildJobMiniTimeline(jobActivity: {
  has_started: boolean;
  started_at: string | null;
  active_staff?: Array<{ staff_id: string; name: string; since: string; status: string }>;
  timeline?: Array<{ type: string; at: string; staff_name: string; label: string; status: string }>;
}): MiniTimelineEvent[] {
  if (!jobActivity?.has_started) return [];
  const out: MiniTimelineEvent[] = [];
  if (jobActivity.started_at) {
    out.push({ type: 'on_site', at: jobActivity.started_at, label: 'Jobb startade' });
  }
  for (const t of jobActivity.timeline ?? []) {
    const type: MiniTimelineEvent['type'] =
      t.type === 'timer_start' ? 'timer_start'
      : t.type === 'timer_stop' ? 'timer_stop'
      : t.type === 'arrival' ? 'arrival'
      : t.type === 'travel' ? 'travel'
      : t.type === 'left' ? 'left'
      : 'note';
    out.push({ type, at: t.at, label: t.label, staff_name: t.staff_name, status: t.status });
  }
  return out;
}

/** Build mini-timeline events for a staff member from OpsStaffStatus. */
export function buildStaffMiniTimeline(s: {
  workday_started_at?: string | null;
  active_timer?: { started_at: string; target_type: string; target_label?: string | null } | null;
  current_status?: string | null;
  current_since?: string | null;
  current_target_label?: string | null;
  gps_status?: string;
  latest_known_location?: { updated_at: string } | null;
}): MiniTimelineEvent[] {
  const out: MiniTimelineEvent[] = [];
  if (s.workday_started_at) {
    out.push({ type: 'workday_start', at: s.workday_started_at, label: 'Arbetsdag startade' });
  }
  if (s.current_since && s.current_target_label) {
    const t: MiniTimelineEvent['type'] =
      s.current_status === 'traveling' ? 'travel'
      : s.current_status === 'on_project' || s.current_status === 'on_location' ? 'arrival'
      : 'on_site';
    out.push({
      type: t,
      at: s.current_since,
      label: s.current_target_label,
    });
  }
  if (s.active_timer?.started_at) {
    out.push({
      type: 'timer_start',
      at: s.active_timer.started_at,
      label: `Timer (${s.active_timer.target_type})${s.active_timer.target_label ? ` · ${s.active_timer.target_label}` : ''}`,
    });
  }
  if (s.gps_status === 'stale' && s.latest_known_location?.updated_at) {
    out.push({
      type: 'signal_lost',
      at: s.latest_known_location.updated_at,
      label: 'Signal tappad',
    });
  }
  return out;
}
