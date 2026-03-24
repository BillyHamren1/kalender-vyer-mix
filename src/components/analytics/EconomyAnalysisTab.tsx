import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, AreaChart, Area, LineChart, Line } from 'recharts';
import type { DerivedPeriod, DerivedProject, DerivedProduct } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';

interface Props {
  periods: DerivedPeriod[];
  projects: DerivedProject[];
  products: DerivedProduct[];
}

const formatSEK = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
};
const formatMonth = (s: string) => new Date(s).toLocaleDateString('sv-SE', { month: 'short', year: '2-digit' });

export const EconomyAnalysisTab = ({ periods, projects, products }: Props) => {
  const totalRevenue = periods.reduce((s, p) => s + p.total_revenue, 0);
  const totalCost = periods.reduce((s, p) => s + p.total_cost, 0);
  const totalTB = periods.reduce((s, p) => s + p.total_margin, 0);
  const avgMargin = totalRevenue > 0 ? (totalTB / totalRevenue) * 100 : 0;
  const avgRevenuePerProject = projects.length > 0 ? totalRevenue / projects.length : 0;

  const chartData = periods.map(p => ({
    month: formatMonth(p.month),
    revenue: p.total_revenue,
    cost: p.total_cost,
    tb: p.total_margin,
    marginPct: p.margin_pct,
    avgRevenue: p.avg_project_revenue,
  }));

  // Revenue by product category
  const catMap = new Map<string, { revenue: number; cost: number; count: number }>();
  products.forEach(p => {
    const cat = p.category || 'Övrigt';
    const ex = catMap.get(cat) || { revenue: 0, cost: 0, count: 0 };
    ex.revenue += p.total_revenue;
    ex.cost += p.total_direct_cost;
    ex.count += p.project_count;
    catMap.set(cat, ex);
  });
  const categoryData = Array.from(catMap.entries())
    .map(([cat, v]) => ({
      category: cat.length > 18 ? cat.slice(0, 16) + '…' : cat,
      revenue: Math.round(v.revenue),
      cost: Math.round(v.cost),
      projects: v.count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  // Top revenue projects
  const topRevenue = [...projects].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Total omsättning</div><div className="text-xl font-bold">{formatSEK(totalRevenue)} kr</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Total kostnad</div><div className="text-xl font-bold">{formatSEK(totalCost)} kr</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">TB</div><div className={cn("text-xl font-bold", totalTB >= 0 ? "text-green-600" : "text-red-600")}>{formatSEK(totalTB)} kr</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Snittmarginal</div><div className={cn("text-xl font-bold", avgMargin >= 20 ? "text-green-600" : avgMargin >= 0 ? "text-yellow-600" : "text-red-600")}>{avgMargin.toFixed(1)}%</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="text-xs text-muted-foreground">Snittintäkt/projekt</div><div className="text-xl font-bold">{formatSEK(avgRevenuePerProject)} kr</div></CardContent></Card>
      </div>

      {/* Revenue & cost over time */}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TB over time */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">TB över tid</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis tickFormatter={formatSEK} className="text-xs" />
                <Tooltip formatter={(v: number) => `${formatSEK(v)} kr`} />
                <Area type="monotone" dataKey="tb" name="TB" stroke="hsl(184, 55%, 38%)" fill="hsl(184, 55%, 38%)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Margin % over time */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Marginal % över tid</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis unit="%" className="text-xs" />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Line type="monotone" dataKey="marginPct" name="Marginal" stroke="hsl(45, 93%, 47%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Revenue by category */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Intäkt per produktkategori</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tickFormatter={formatSEK} className="text-xs" />
              <YAxis type="category" dataKey="category" className="text-xs" width={110} />
              <Tooltip formatter={(v: number) => `${formatSEK(v)} kr`} />
              <Legend />
              <Bar dataKey="revenue" name="Intäkt" fill="hsl(184, 55%, 38%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="cost" name="Direktkostnad" fill="hsl(200, 14%, 74%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top revenue projects */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Högst intäkt per projekt</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {topRevenue.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.booking_number || p.booking_id.slice(0, 8)} · {p.event_date || '-'}</div>
                </div>
                <div className="text-right ml-3">
                  <div className="text-sm font-medium">{formatSEK(p.revenue)} kr</div>
                  <Badge variant="outline" className={cn("text-[10px]", p.margin_pct >= 20 ? "border-green-300 text-green-700" : p.margin_pct >= 0 ? "border-yellow-300 text-yellow-700" : "border-red-300 text-red-700")}>
                    {p.margin_pct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
