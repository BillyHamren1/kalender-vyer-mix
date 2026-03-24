import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { DerivedProject, DerivedProduct } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  projects: DerivedProject[];
  products: DerivedProduct[];
}

const COLORS = ['hsl(184, 55%, 38%)', 'hsl(0, 84%, 60%)', 'hsl(45, 93%, 47%)', 'hsl(200, 14%, 74%)', 'hsl(184, 45%, 65%)'];

export const DeviationAnalysisTab = ({ projects, products }: Props) => {
  const navigate = useNavigate();

  const withDeviations = projects.filter(p => p.had_deviations);
  const withLateChanges = projects.filter(p => p.had_late_changes);

  const deviationRate = projects.length > 0 ? Math.round((withDeviations.length / projects.length) * 100) : 0;
  const lateChangeRate = projects.length > 0 ? Math.round((withLateChanges.length / projects.length) * 100) : 0;

  const pieData = [
    { name: 'Utan avvikelser', value: projects.length - withDeviations.length },
    { name: 'Med avvikelser', value: withDeviations.length },
  ];

  // Products causing deviations
  const deviationProducts = products
    .filter(p => p.deviation_pct > 0)
    .sort((a, b) => b.deviation_pct - a.deviation_pct)
    .slice(0, 15);

  // Projects with deviations sorted by margin (worst first)
  const worstDeviationProjects = withDeviations
    .sort((a, b) => a.margin_pct - b.margin_pct)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">Avvikelsefrekvens</div>
            <div className={cn('text-xl font-bold', deviationRate > 20 ? 'text-red-600' : 'text-foreground')}>{deviationRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">Sena ändringar</div>
            <div className={cn('text-xl font-bold', lateChangeRate > 30 ? 'text-yellow-600' : 'text-foreground')}>{lateChangeRate}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">Projekt med avvikelser</div>
            <div className="text-xl font-bold">{withDeviations.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="text-xs text-muted-foreground">Projekt med sena ändr.</div>
            <div className="text-xl font-bold">{withLateChanges.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Avvikelsefördelning</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Products linked to deviations */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Produkter kopplade till avvikelser</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {deviationProducts.map(p => (
                <div key={`${p.product_name}-${p.sku}`} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.product_name}</div>
                    <div className="text-xs text-muted-foreground">{p.category || '-'} · {p.project_count} projekt</div>
                  </div>
                  <Badge variant="outline" className="text-xs border-red-300 text-red-700">
                    {p.deviation_pct.toFixed(0)}% avvikelse
                  </Badge>
                </div>
              ))}
              {deviationProducts.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Inga avvikelser registrerade</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects with worst margin + deviations */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Projekt med avvikelser (sämst marginal)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {worstDeviationProjects.map(p => (
              <button
                key={p.id}
                onClick={() => navigate(`/economy/${p.booking_id}`)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.booking_number || p.booking_id.slice(0, 8)} · {p.event_date || '-'}</div>
                </div>
                <Badge variant="outline" className={cn('text-xs', p.margin_pct < 0 ? 'border-red-300 text-red-700' : 'border-yellow-300 text-yellow-700')}>
                  {p.margin_pct.toFixed(1)}%
                </Badge>
              </button>
            ))}
            {worstDeviationProjects.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Inga projekt med avvikelser</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
