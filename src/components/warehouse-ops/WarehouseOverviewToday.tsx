import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, Wrench, Users, Activity } from 'lucide-react';
import { format, parseISO, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { OpsRangeData, OpsJob } from '@/hooks/useWarehouseOpsRange';

interface Props {
  data: OpsRangeData;
}

const ACTIVE_STATUSES = new Set([
  'in_progress',
  'returning',
  'back',
  'started_back',
  'in_production',
]);

function isJobActiveToday(j: OpsJob): boolean {
  if (ACTIVE_STATUSES.has(j.status)) return true;
  if (!j.anchorDate) return false;
  return isToday(parseISO(j.anchorDate));
}

const WarehouseOverviewToday: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const outToday = data.jobs.filter(j => j.direction === 'out' && j.anchorDate === todayStr);
  const inToday = data.jobs.filter(j => j.direction === 'in' && j.anchorDate === todayStr);
  const activeNow = data.jobs.filter(isJobActiveToday);

  const cards = [
    {
      key: 'out',
      label: 'UT idag',
      count: outToday.length,
      icon: ArrowUpRight,
      tone: 'text-blue-600',
      bg: 'bg-blue-500/5',
      border: 'border-blue-500/20',
    },
    {
      key: 'in',
      label: 'IN/retur idag',
      count: inToday.length,
      icon: ArrowDownLeft,
      tone: 'text-emerald-600',
      bg: 'bg-emerald-500/5',
      border: 'border-emerald-500/20',
    },
    {
      key: 'active',
      label: 'Pågående arbete',
      count: activeNow.length,
      icon: Wrench,
      tone: 'text-amber-600',
      bg: 'bg-amber-500/5',
      border: 'border-amber-500/20',
      clickable: true,
    },
    {
      key: 'people',
      label: 'Personal aktiv i lagret nu',
      count: data.summary.peopleActive,
      icon: Users,
      tone: 'text-warehouse',
      bg: 'bg-warehouse/5',
      border: 'border-warehouse/20',
    },
  ];

  return (
    <section className="mb-5">
      <header className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Idag</h2>
        <span className="text-xs text-muted-foreground">{format(new Date(), 'EEEE d MMM', { locale: sv })}</span>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.key}
              onClick={c.clickable ? () => navigate('/warehouse/packing') : undefined}
              className={cn(
                'rounded-xl border bg-card p-3 flex items-center gap-3',
                c.border,
                c.clickable && 'cursor-pointer hover:bg-accent/40'
              )}
            >
              <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0', c.bg)}>
                <Icon className={cn('h-4 w-4', c.tone)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-[hsl(var(--heading))]">{c.count}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default WarehouseOverviewToday;
