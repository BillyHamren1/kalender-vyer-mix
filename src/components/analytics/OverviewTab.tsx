import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Area, AreaChart } from 'recharts';
import type { DerivedPeriod, DerivedProject } from '@/services/derivedAnalyticsService';
import { TrendingUp, TrendingDown, Banknote, Clock, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  periods: DerivedPeriod[];
  projects: DerivedProject[];
}

const formatSEK = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};

const formatMonth = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' });
};

export const OverviewTab = ({ periods, projects }: Props) => {
  const totalRevenue = periods.reduce((s, p) => s + p.total_revenue, 0);
  const totalMargin = periods.reduce((s, p) => s + p.total_margin, 0);
  const totalProjects = periods.reduce((s, p) => s + p.project_count, 0);
  const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const totalHours = periods.reduce((s, p) => s + p.total_hours, 0);

  const chartData = periods.map(p => ({
    month: formatMonth(p.month),
    revenue: p.total_revenue,
    cost: p.total_cost,
    margin: p.total_margin,
    marginPct: p.margin_pct,
    projects: p.project_count,
    hours: p.total_hours,
  }));

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Omsättning" value={formatSEK(totalRevenue)} suffix="kr" icon={<Banknote className="h-4 w-4" />} />
        <KpiCard label="TB" value={formatSEK(totalMargin)} suffix="kr" color={totalMargin >= 0 ? 'text-green-600' : 'text-red-600'} icon={<TrendingUp className="h-4 w-4" />} />
        <KpiCard label="Snittmarginal" value={avgMarginPct.toFixed(1)} suffix="%" color={avgMarginPct >= 20 ? 'text-green-600' : avgMarginPct >= 0 ? 'text-yellow-600' : 'text-red-600'} icon={<TrendingDown className="h-4 w-4" />} />
        <KpiCard label="Projekt" value={totalProjects.toString()} icon={<FolderOpen className="h-4 w-4" />} />
        <KpiCard label="Timmar" value={totalHours.toFixed(0)} icon={<Clock className="h-4 w-4" />} />
      </div>

      {/* Revenue & Cost over time */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Omsättning & kostnad över tid</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis tickFormatter={formatSEK} className="text-xs" />
              <Tooltip formatter={(v: number) => `${formatSEK(v)} kr`} />
              <Legend />
              <Bar dataKey="revenue" name="Intäkt" fill="hsl(184, 55%, 38%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cost" name="Kostnad" fill="hsl(200, 14%, 74%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Margin % over time */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Marginal % över tid</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis unit="%" className="text-xs" />
              <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
              <Area type="monotone" dataKey="marginPct" name="Marginal" stroke="hsl(184, 55%, 38%)" fill="hsl(184, 55%, 38%)" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Projects per month */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Antal projekt per månad</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey="projects" name="Projekt" fill="hsl(184, 45%, 65%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

function KpiCard({ label, value, suffix, color, icon }: { label: string; value: string; suffix?: string; color?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className={cn('text-xl font-bold', color || 'text-foreground')}>
          {value}{suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
