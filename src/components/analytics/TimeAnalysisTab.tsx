import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ScatterChart, Scatter, ZAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { DerivedProject, DerivedPeriod } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  projects: DerivedProject[];
  periods: DerivedPeriod[];
}

const formatSEK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
const formatMonth = (s: string) => new Date(s).toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' });

export const TimeAnalysisTab = ({ projects, periods }: Props) => {
  const navigate = useNavigate();
  const totalHours = projects.reduce((s, p) => s + p.total_hours, 0);
  const avgHours = projects.length > 0 ? totalHours / projects.length : 0;
  const totalOvertime = projects.reduce((s, p) => s + p.overtime_hours, 0);

  // Group by project type
  const typeMap = new Map<string, { hours: number; count: number; revenue: number; margin: number }>();
  projects.forEach(p => {
    const t = p.project_type || 'Okänd';
    const ex = typeMap.get(t) || { hours: 0, count: 0, revenue: 0, margin: 0 };
    ex.hours += p.total_hours;
    ex.count++;
    ex.revenue += p.revenue;
    ex.margin += p.margin_pct;
    typeMap.set(t, ex);
  });
  const byType = Array.from(typeMap.entries()).map(([type, v]) => ({
    type: type.length > 18 ? type.slice(0, 16) + '…' : type,
    hours: Math.round(v.hours),
    count: v.count,
    avgHours: Math.round(v.hours / v.count),
  })).sort((a, b) => b.hours - a.hours).slice(0, 10);

  // Hours over time
  const hoursOverTime = periods.map(p => ({
    month: formatMonth(p.month),
    hours: Math.round(p.total_hours),
    avgHours: Math.round(p.avg_project_hours),
    projects: p.project_count,
  }));

  // Scatter: hours vs revenue
  const scatterData = projects.filter(p => p.revenue > 0).map(p => ({
    x: p.total_hours,
    y: p.revenue,
    z: p.margin_pct,
    name: p.client_name,
  }));

  // Scatter: hours vs margin
  const marginScatter = projects.map(p => ({
    x: p.total_hours,
    y: p.margin_pct,
    z: p.revenue,
    name: p.client_name,
  }));

  // Most time-intensive projects
  const topTime = [...projects].sort((a, b) => b.total_hours - a.total_hours).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Totala timmar</div><div className="text-xl font-bold">{Math.round(totalHours)}</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Snitt per projekt</div><div className="text-xl font-bold">{avgHours.toFixed(1)} h</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Total övertid</div><div className={cn("text-xl font-bold", totalOvertime > totalHours * 0.1 ? "text-red-600" : "")}>{Math.round(totalOvertime)} h</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Antal projekt</div><div className="text-xl font-bold">{projects.length}</div></CardContent></Card>
      </div>

      {/* Hours over time */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Timmar över tid</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hoursOverTime}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Legend />
              <Bar dataKey="hours" name="Totala timmar" fill="hsl(184, 55%, 38%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hours by project type */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Timmar per projekttyp</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byType} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey="type" className="text-xs" width={90} />
                <Tooltip />
                <Bar dataKey="hours" name="Timmar" fill="hsl(184, 45%, 65%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Scatter: time vs revenue */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Tid vs intäkt</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" dataKey="x" name="Timmar" unit=" h" className="text-xs" />
                <YAxis type="number" dataKey="y" name="Intäkt" tickFormatter={formatSEK} className="text-xs" />
                <ZAxis type="number" dataKey="z" name="Marginal %" range={[30, 300]} />
                <Tooltip formatter={(v: number, name: string) => name === 'Intäkt' ? `${formatSEK(v)} kr` : name === 'Timmar' ? `${v} h` : `${v.toFixed(1)}%`} />
                <Scatter data={scatterData} fill="hsl(184, 55%, 38%)" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Scatter: time vs margin */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Tid vs marginal</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" dataKey="x" name="Timmar" unit=" h" className="text-xs" />
              <YAxis type="number" dataKey="y" name="Marginal" unit="%" className="text-xs" />
              <ZAxis type="number" dataKey="z" name="Intäkt" range={[30, 300]} />
              <Tooltip formatter={(v: number, name: string) => name === 'Marginal' ? `${v.toFixed(1)}%` : name === 'Timmar' ? `${v} h` : `${formatSEK(v)} kr`} />
              <Scatter data={marginScatter} fill="hsl(45, 93%, 47%)" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top time projects */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Mest tidskrävande projekt</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {topTime.map(p => (
              <button key={p.id} onClick={() => navigate(`/economy/${p.booking_id}`)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors text-left">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.booking_number || p.booking_id.slice(0, 8)} · {p.project_type || '-'}</div>
                </div>
                <div className="text-right ml-3">
                  <Badge variant="outline" className="text-xs">{Math.round(p.total_hours)} h</Badge>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.margin_pct.toFixed(1)}% marginal</div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
