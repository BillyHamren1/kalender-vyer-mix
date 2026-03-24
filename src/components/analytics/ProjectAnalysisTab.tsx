import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import type { DerivedProject } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  projects: DerivedProject[];
}

const formatSEK = (v: number) => `${Math.round(v).toLocaleString('sv-SE')} kr`;

export const ProjectAnalysisTab = ({ projects }: Props) => {
  const navigate = useNavigate();
  const sorted = [...projects];

  const mostProfitable = sorted.sort((a, b) => b.margin_pct - a.margin_pct).slice(0, 10);
  const leastProfitable = sorted.sort((a, b) => a.margin_pct - b.margin_pct).slice(0, 10);
  const overTime = sorted.filter(p => p.hours_per_product != null).sort((a, b) => (b.hours_per_product || 0) - (a.hours_per_product || 0)).slice(0, 10);
  const lateClosure = sorted.filter(p => p.closure_delay_days != null).sort((a, b) => (b.closure_delay_days || 0) - (a.closure_delay_days || 0)).slice(0, 10);

  const goToProject = (p: DerivedProject) => {
    if (p.booking_id) navigate(`/economy/${p.booking_id}`);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ProjectList title="Mest lönsamma projekt" projects={mostProfitable} onClick={goToProject} metric={p => `${p.margin_pct.toFixed(1)}%`} metricLabel="Marginal" goodAbove={20} />
      <ProjectList title="Minst lönsamma projekt" projects={leastProfitable} onClick={goToProject} metric={p => `${p.margin_pct.toFixed(1)}%`} metricLabel="Marginal" goodAbove={20} />
      <ProjectList title="Projekt som drar mest tid/produkt" projects={overTime} onClick={goToProject} metric={p => `${p.hours_per_product?.toFixed(1) || '-'} h`} metricLabel="Tim/produkt" />
      <ProjectList title="Projekt som stängs sent" projects={lateClosure} onClick={goToProject} metric={p => `${p.closure_delay_days || 0} dagar`} metricLabel="Closure delay" />
    </div>
  );
};

function ProjectList({
  title, projects, onClick, metric, metricLabel, goodAbove
}: {
  title: string;
  projects: DerivedProject[];
  onClick: (p: DerivedProject) => void;
  metric: (p: DerivedProject) => string;
  metricLabel: string;
  goodAbove?: number;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {projects.map((p, i) => (
            <button
              key={p.id}
              onClick={() => onClick(p)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.client_name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.booking_number || p.booking_id.slice(0, 8)} · {p.event_date || '-'}
                </div>
              </div>
              <div className="text-right ml-4">
                <Badge variant="outline" className={cn('text-xs', goodAbove != null && (
                  parseFloat(metric(p)) >= goodAbove ? 'border-green-300 text-green-700' : 'border-red-300 text-red-700'
                ))}>
                  {metric(p)}
                </Badge>
                <div className="text-[10px] text-muted-foreground mt-0.5">{metricLabel}</div>
              </div>
            </button>
          ))}
          {projects.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Ingen data</div>}
        </div>
      </CardContent>
    </Card>
  );
}
