import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { format, addDays, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { OpsRangeData } from '@/hooks/useWarehouseOpsRange';

interface Props {
  data: OpsRangeData;
}

interface DayLoad {
  label: string;
  out: number;
  in: number;
}

const WarehouseOverviewNext7Days: React.FC<Props> = ({ data }) => {
  const navigate = useNavigate();

  const days = useMemo<DayLoad[]>(() => {
    const today = startOfDay(new Date());
    const result: DayLoad[] = [];

    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const dayKey = format(date, 'yyyy-MM-dd');
      const jobsForDay = data.jobs.filter((j) => j.anchorDate?.slice(0, 10) === dayKey);

      result.push({
        label: format(date, 'EEE d MMM', { locale: sv }),
        out: jobsForDay.filter((j) => j.direction === 'out').length,
        in: jobsForDay.filter((j) => j.direction === 'in').length,
      });
    }

    return result;
  }, [data.jobs]);

  const totalOut = days.reduce((sum, d) => sum + d.out, 0);
  const totalIn = days.reduce((sum, d) => sum + d.in, 0);

  return (
    <section className="mb-5">
      <header className="flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Kommande 7 dagar</h2>
        <span className="text-xs text-muted-foreground ml-auto">
          {totalOut} UT · {totalIn} IN
        </span>
      </header>

      <div className="rounded-xl border border-border/60 bg-card p-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {days.map((d) => (
            <button
              key={d.label}
              onClick={() => navigate('/warehouse/packing')}
              className="rounded-lg border border-border/40 bg-background p-2 text-left hover:bg-accent/40 transition-colors"
            >
              <div className="text-xs font-medium text-muted-foreground mb-1.5">{d.label}</div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  <ArrowUpRight className="h-3 w-3 text-blue-500" />
                  <span className="font-semibold">{d.out}</span>
                  <span className="text-muted-foreground">UT</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <ArrowDownLeft className="h-3 w-3 text-emerald-500" />
                  <span className="font-semibold">{d.in}</span>
                  <span className="text-muted-foreground">IN</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WarehouseOverviewNext7Days;
