import { Activity, Users, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpsOverviewJob } from '@/services/mobileApiService';

function fmtHm(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtDuration(min: number) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Props {
  jobActivity: NonNullable<OpsOverviewJob['jobActivity']>;
}

export function JobActivityStrip({ jobActivity }: Props) {
  if (!jobActivity.has_started) return null;
  const active = jobActivity.active_staff_count;
  const staff = jobActivity.active_staff.slice(0, 5);
  const more = Math.max(0, jobActivity.active_staff.length - staff.length);
  const ongoing = active > 0;
  const anyLost = jobActivity.active_staff.some(s => s.status === 'signal_lost');

  return (
    <div
      className={cn(
        'px-3 py-2 border-b border-border/60 text-[11px]',
        ongoing ? 'bg-emerald-500/10' : 'bg-muted/40',
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Activity className={cn('w-3 h-3 shrink-0', ongoing ? 'text-emerald-600' : 'text-muted-foreground')} />
        <span>
          Startade {fmtHm(jobActivity.started_at)}
        </span>
        {active > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <Users className="w-3 h-3 shrink-0" />
            <span>{active} på plats</span>
          </>
        )}
        <span className="text-muted-foreground">·</span>
        <span>pågått {fmtDuration(jobActivity.on_site_minutes)}</span>
        {anyLost && <WifiOff className="w-3 h-3 text-amber-500 shrink-0 ml-auto" />}
        {ongoing && !anyLost && <Wifi className="w-3 h-3 text-emerald-600 shrink-0 ml-auto" />}
      </div>
      {staff.length > 0 && (
        <div className="mt-1 flex items-center gap-1 flex-wrap">
          {staff.map(s => (
            <span
              key={s.staff_id}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px]',
                s.status === 'signal_lost'
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              )}
            >
              <span className="truncate max-w-[100px]">{s.name || '—'}</span>
              <span className="opacity-70">{fmtHm(s.since)}</span>
            </span>
          ))}
          {more > 0 && (
            <span className="text-[10px] text-muted-foreground">+{more}</span>
          )}
        </div>
      )}
      {jobActivity.latest_activity_at && jobActivity.latest_activity_at !== jobActivity.started_at && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Senast: {fmtHm(jobActivity.latest_activity_at)}
        </div>
      )}
    </div>
  );
}
