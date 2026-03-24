import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ScatterChart, Scatter, ZAxis, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { DerivedProject, DerivedProductCombination } from '@/services/derivedAnalyticsService';
import { cn } from '@/lib/utils';
import { AlertTriangle, TrendingDown, Clock, Target } from 'lucide-react';

interface Props {
  projects: DerivedProject[];
  combinations: DerivedProductCombination[];
}

function avg(arr: number[]): number { return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function stdDev(arr: number[]): number { if (arr.length < 2) return 0; const m = avg(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)); }
function pct(arr: number[], p: number): number { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const i = Math.ceil(p / 100 * s.length) - 1; return s[Math.max(0, i)]; }

export const ForecastTab = ({ projects, combinations }: Props) => {
  const navigate = useNavigate();

  // Expected time by project type
  const timeByType = useMemo(() => {
    const map = new Map<string, number[]>();
    projects.forEach(p => {
      const t = p.project_type || 'Okänd';
      const arr = map.get(t) || [];
      arr.push(p.total_hours);
      map.set(t, arr);
    });
    return Array.from(map.entries()).map(([type, hours]) => ({
      type: type.length > 18 ? type.slice(0, 16) + '…' : type,
      avg: Math.round(avg(hours) * 10) / 10,
      std: Math.round(stdDev(hours) * 10) / 10,
      p25: Math.round(pct(hours, 25) * 10) / 10,
      p75: Math.round(pct(hours, 75) * 10) / 10,
      count: hours.length,
    })).sort((a, b) => b.avg - a.avg);
  }, [projects]);

  // Risk projects
  const riskProjects = useMemo(() => {
    const avgMargin = avg(projects.map(p => p.margin_pct));
    const avgHpp = avg(projects.filter(p => p.hours_per_product != null).map(p => p.hours_per_product!));

    return projects.map(p => {
      const factors: string[] = [];
      if (p.margin_pct < 0) factors.push('Negativ marginal');
      if (p.had_deviations) factors.push('Avvikelser');
      if (p.had_late_changes) factors.push('Sena ändringar');
      if ((p.closure_delay_days || 0) > 30) factors.push('Sen stängning');
      if ((p.hours_per_product || 0) > avgHpp * 1.5) factors.push('Hög tidsåtgång');
      const score = factors.length * 20 + Math.max(0, avgMargin - p.margin_pct);
      return { ...p, risk_score: Math.round(score), risk_factors: factors };
    }).filter(p => p.risk_score > 30).sort((a, b) => b.risk_score - a.risk_score).slice(0, 15);
  }, [projects]);

  // Expected margin by combo
  const topCombos = [...combinations].sort((a, b) => b.co_occurrence_count - a.co_occurrence_count).slice(0, 10);

  // Scatter: combo avg_hours vs avg_margin_pct
  const comboScatter = combinations.map(c => ({
    x: c.avg_hours,
    y: c.avg_margin_pct,
    z: c.co_occurrence_count,
    name: `${c.category_a} + ${c.category_b}`,
  }));

  // Inefficient setups
  const inefficient = useMemo(() => {
    const map = new Map<string, DerivedProject[]>();
    projects.forEach(p => {
      const key = p.project_type || 'Okänd';
      const arr = map.get(key) || [];
      arr.push(p);
      map.set(key, arr);
    });
    return Array.from(map.entries()).map(([type, ps]) => ({
      type,
      count: ps.length,
      avgMargin: Math.round(avg(ps.map(p => p.margin_pct)) * 10) / 10,
      avgHours: Math.round(avg(ps.map(p => p.total_hours)) * 10) / 10,
      avgStaff: Math.round(avg(ps.map(p => p.total_staff_count)) * 10) / 10,
      score: Math.round(Math.max(0, 50 - avg(ps.map(p => p.margin_pct))) + (avg(ps.map(p => p.total_hours)) > 20 ? 10 : 0)),
    })).filter(r => r.score > 20).sort((a, b) => b.score - a.score).slice(0, 10);
  }, [projects]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Riskprojekt</div><div className="text-xl font-bold text-red-600">{riskProjects.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingDown className="h-3.5 w-3.5" /> Ineffektiva upplägg</div><div className="text-xl font-bold text-yellow-600">{inefficient.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Projekttyper analyserade</div><div className="text-xl font-bold">{timeByType.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 px-4"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" /> Kombination-dataset</div><div className="text-xl font-bold">{combinations.length}</div></CardContent></Card>
      </div>

      {/* Expected time by type */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Förväntad tid per projekttyp (snitt ± spridning)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={timeByType} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" unit=" h" className="text-xs" />
              <YAxis type="category" dataKey="type" className="text-xs" width={110} />
              <Tooltip formatter={(v: number) => `${v} h`} />
              <Legend />
              <Bar dataKey="p25" name="P25" fill="hsl(184, 45%, 75%)" stackId="range" radius={[0, 0, 0, 0]} />
              <Bar dataKey="avg" name="Snitt" fill="hsl(184, 55%, 38%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Combo scatter */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Kombination: Tid vs Marginal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" dataKey="x" name="Snittimmar" unit=" h" className="text-xs" />
                <YAxis type="number" dataKey="y" name="Snittmarginal" unit="%" className="text-xs" />
                <ZAxis type="number" dataKey="z" name="Förekomster" range={[40, 400]} />
                <Tooltip />
                <Scatter data={comboScatter} fill="hsl(184, 55%, 38%)" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Inefficient setups */}
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Ineffektiva upplägg</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {inefficient.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.type}</div>
                    <div className="text-xs text-muted-foreground">{r.count} projekt · {r.avgStaff} pers snitt · {r.avgHours} h snitt</div>
                  </div>
                  <Badge variant="outline" className={cn("text-xs", r.avgMargin < 10 ? "border-red-300 text-red-700" : "border-yellow-300 text-yellow-700")}>
                    {r.avgMargin}% marginal
                  </Badge>
                </div>
              ))}
              {inefficient.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Inga ineffektiva upplägg identifierade</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk projects */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Riskprojekt (baserat på historiska mönster)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {riskProjects.map(p => (
              <button key={p.id} onClick={() => navigate(`/economy/${p.booking_id}`)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors text-left">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.client_name}</div>
                  <div className="text-xs text-muted-foreground">{p.booking_number || p.booking_id.slice(0, 8)} · {p.event_date || '-'}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.risk_factors.map(f => (
                      <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right ml-3">
                  <Badge variant="outline" className={cn("text-xs", p.risk_score > 60 ? "border-red-300 text-red-700" : "border-yellow-300 text-yellow-700")}>
                    Risk: {p.risk_score}
                  </Badge>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.margin_pct.toFixed(1)}% marginal</div>
                </div>
              </button>
            ))}
            {riskProjects.length === 0 && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Inga riskprojekt identifierade</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
