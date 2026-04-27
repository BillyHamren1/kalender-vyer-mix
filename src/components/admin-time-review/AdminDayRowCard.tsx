import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AlertTriangle, ChevronRight, Clock, Car, Briefcase, CircleSlash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatHoursMinutes } from '@/utils/formatHours';
import type { AdminDayRow } from '@/lib/timeReview/dayAggregation';
import { DayStatusBadge } from './DayStatusBadge';

const formatTime = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'HH:mm');
  } catch {
    return '—';
  }
};

const formatDayLabel = (dayKey: string) => {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return format(date, 'EEE d MMM', { locale: sv });
};

interface Props {
  row: AdminDayRow;
  onOpen: (row: AdminDayRow) => void;
}

export const AdminDayRowCard = ({ row, onOpen }: Props) => {
  const showWarn = row.warnings.length > 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className={cn(
        'w-full text-left rounded-xl border bg-card p-3.5 transition-all',
        'hover:border-primary/40 hover:shadow-md active:scale-[0.998]',
        row.status === 'needs_review' && 'border-destructive/40',
        row.status === 'in_progress' && 'border-blue-500/40',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
          style={{ backgroundColor: row.staff_color || 'hsl(var(--muted))' }}
        >
          {row.staff_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-foreground truncate">{row.staff_name}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium text-muted-foreground">
              {formatDayLabel(row.day_key)}
            </span>
            {row.staff_role && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {row.staff_role}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <DayStatusBadge status={row.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
            <Stat
              icon={Clock}
              label="Dagspann"
              value={
                row.workday_started_at
                  ? `${formatTime(row.workday_started_at)}–${row.workday_ended_at ? formatTime(row.workday_ended_at) : 'NU'}`
                  : '—'
              }
              sub={row.total_day_hours > 0 ? formatHoursMinutes(row.total_day_hours) : undefined}
            />
            <Stat
              icon={Briefcase}
              label="Projekttid"
              value={row.reported_project_hours > 0 ? formatHoursMinutes(row.reported_project_hours) : '—'}
            />
            <Stat
              icon={Car}
              label="Restid"
              value={row.travel_hours > 0 ? formatHoursMinutes(row.travel_hours) : '—'}
            />
            <Stat
              icon={CircleSlash}
              label="Oallokerat"
              value={row.unallocated_hours > 0.05 ? formatHoursMinutes(row.unallocated_hours) : '—'}
              warn={row.unallocated_hours > 0.5}
            />
          </div>

          {showWarn && (
            <ul className="mt-2.5 space-y-1">
              {row.warnings.slice(0, 3).map((w, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-1.5 text-xs',
                    w.severity === 'error' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300',
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w.title}</span>
                </li>
              ))}
              {row.warnings.length > 3 && (
                <li className="text-[11px] text-muted-foreground pl-5">
                  +{row.warnings.length - 3} fler varningar
                </li>
              )}
            </ul>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </button>
  );
};

interface StatProps {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}
const Stat = ({ icon: Icon, label, value, sub, warn }: StatProps) => (
  <div className={cn('flex items-start gap-1.5', warn && 'text-amber-700 dark:text-amber-300')}>
    <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground" />
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">{label}</div>
      <div className="font-semibold text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  </div>
);
