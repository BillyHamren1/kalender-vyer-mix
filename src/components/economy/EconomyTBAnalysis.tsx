import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { parseISO, getYear, getMonth } from 'date-fns';
import type { EconomyProjectInsight } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v);

const formatK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

type TabValue = 'orderingang' | 'ordersumma';

interface Props {
  projects: EconomyProjectInsight[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

interface YoYBucket {
  monthIndex: number;
  monthName: string;
  [key: string]: number | string;
}

interface YoYResult {
  buckets: YoYBucket[];
  years: number[];
  availableYears: number[];
  yearTotals: Record<number, { intäkt: number; kostnad: number; tb: number }>;
}

interface DrillDownSelection {
  monthIndex: number;
  year: number;
}

function computeYoY(
  projects: EconomyProjectInsight[],
  selectedYears: number[],
  dateSelector: (p: EconomyProjectInsight) => string | null | undefined,
): YoYResult {
  const yearMonthData = new Map<string, { intäkt: number; kostnad: number }>();

  projects.forEach(p => {
    const dateStr = dateSelector(p);
    if (!dateStr) return;
    try {
      const d = parseISO(dateStr);
      const key = `${getYear(d)}-${String(getMonth(d)).padStart(2, '0')}`;
      const existing = yearMonthData.get(key) || { intäkt: 0, kostnad: 0 };
      existing.intäkt += p.quotedAmount;
      existing.kostnad += p.actualCost;
      yearMonthData.set(key, existing);
    } catch { return; }
  });

  const availableYearsSet = new Set<number>();
  yearMonthData.forEach((_, key) => availableYearsSet.add(parseInt(key.split('-')[0])));
  const currentYear = new Date().getFullYear();
  if (availableYearsSet.size === 0) {
    availableYearsSet.add(currentYear - 1);
    availableYearsSet.add(currentYear);
  }
  const availableYears = Array.from(availableYearsSet).sort();

  const years = selectedYears.length > 0
    ? selectedYears.filter(y => availableYears.includes(y)).sort()
    : availableYears.slice(-2);

  const buckets: YoYBucket[] = MONTH_NAMES.map((name, i) => {
    const bucket: YoYBucket = { monthIndex: i, monthName: name };
    years.forEach(y => {
      const key = `${y}-${String(i).padStart(2, '0')}`;
      const data = yearMonthData.get(key) || { intäkt: 0, kostnad: 0 };
      bucket[String(y)] = data.intäkt;
      bucket[`${y}_kostnad`] = data.kostnad;
      bucket[`${y}_tb`] = data.intäkt - data.kostnad;
    });
    return bucket;
  });

  const yearTotals: Record<number, { intäkt: number; kostnad: number; tb: number }> = {};
  years.forEach(y => {
    const t = { intäkt: 0, kostnad: 0, tb: 0 };
    buckets.forEach(b => {
      t.intäkt += Number(b[String(y)]) || 0;
      t.kostnad += Number(b[`${y}_kostnad`]) || 0;
    });
    t.tb = t.intäkt - t.kostnad;
    yearTotals[y] = t;
  });

  return { buckets, years, availableYears, yearTotals };
}

function getDrillDownProjects(
  projects: EconomyProjectInsight[],
  monthIndex: number,
  year: number,
  dateSelector: (p: EconomyProjectInsight) => string | null | undefined,
): EconomyProjectInsight[] {
  return projects.filter(p => {
    const dateStr = dateSelector(p);
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return getYear(d) === year && getMonth(d) === monthIndex;
    } catch { return false; }
  });
}

function generateYoYCSV(buckets: YoYBucket[], years: number[], includeTB: boolean): string {
  const headers = ['Månad'];
  years.forEach(y => {
    headers.push(`Intäkt ${y}`);
    if (includeTB) headers.push(`Kostnad ${y}`, `TB ${y}`);
  });
  const rows = buckets.map(b => {
    const row = [b.monthName];
    years.forEach(y => {
      row.push(String(b[String(y)] || 0));
      if (includeTB) row.push(String(b[`${y}_kostnad`] || 0), String(b[`${y}_tb`] || 0));
    });
    return row.join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const YOY_COLORS = [
  'hsl(var(--muted-foreground))',
  'hsl(var(--primary))',
  'hsl(142 71% 45%)',
  'hsl(280 70% 50%)',
];

const YoYTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const intäktBars = payload.filter((p: any) => !String(p.dataKey).includes('_'));
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      <div className="space-y-2">
        {intäktBars.map((p: any) => {
          const year = p.dataKey;
          const kostnad = payload.find((x: any) => x.dataKey === `${year}_kostnad`)?.value || 0;
          const intäkt = p.value || 0;
          const tb = intäkt - kostnad;
          const tbPct = intäkt > 0 ? (tb / intäkt) * 100 : 0;
          return (
            <div key={year} className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span style={{ color: p.color }} className="font-semibold">{year}</span>
                <span className="font-bold">{formatCurrency(intäkt)} kr</span>
              </div>
              <div className="flex justify-between gap-4 text-[10px] text-muted-foreground">
                <span>TB</span>
                <span className={cn("font-medium", tb >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {formatCurrency(tb)} kr ({tbPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 border-t border-border/30 pt-1">Klicka för att se detaljer</p>
    </div>
  );
};

const DrillDownPanel: React.FC<{
  projects: EconomyProjectInsight[];
  monthName: string;
  year: number;
  onClose: () => void;
}> = ({ projects, monthName, year, onClose }) => {
  const sorted = useMemo(() =>
    [...projects].sort((a, b) => b.quotedAmount - a.quotedAmount),
    [projects]
  );
  const total = sorted.reduce((s, p) => s + p.quotedAmount, 0);
  const totalCost = sorted.reduce((s, p) => s + p.actualCost, 0);
  const tb = total - totalCost;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in fade-in-50 slide-in-from-top-2 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {monthName} {year} — {sorted.length} projekt
          </h3>
          <p className="text-xs text-muted-foreground">
            Summa: {formatCurrency(total)} kr · TB: <span className={cn(tb >= 0 ? 'text-green-600' : 'text-destructive')}>{formatCurrency(tb)} kr</span>
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Inga projekt i denna period.</p>
      ) : (
        <div className="rounded-md border border-border/40 overflow-hidden max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 sticky top-0">
                <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Projekt</th>
                <th className="text-left py-1.5 px-3 font-semibold text-muted-foreground">Eventdatum</th>
                <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Intäkt</th>
                <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">Kostnad</th>
                <th className="text-right py-1.5 px-3 font-semibold text-muted-foreground">TB</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const pTb = p.quotedAmount - p.actualCost;
                return (
                  <tr key={p.id} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 px-3 font-medium truncate max-w-[250px]">{p.name}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{p.eventdate || '–'}</td>
                    <td className="py-1.5 px-3 text-right font-medium">{formatCurrency(p.quotedAmount)}</td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">{formatCurrency(p.actualCost)}</td>
                    <td className={cn("py-1.5 px-3 text-right font-medium", pTb >= 0 ? 'text-green-600' : 'text-destructive')}>
                      {formatCurrency(pTb)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const YoYView: React.FC<{
  data: YoYResult;
  allProjects: EconomyProjectInsight[];
  dateSelector: (p: EconomyProjectInsight) => string | null | undefined;
  selectedYears: number[];
  onToggleYear: (y: number) => void;
  label: string;
}> = ({ data, allProjects, dateSelector, selectedYears, onToggleYear, label }) => {
  const { buckets, years, availableYears, yearTotals } = data;
  const [drillDown, setDrillDown] = useState<DrillDownSelection | null>(null);

  const handleBarClick = useCallback((monthIndex: number, year: number) => {
    setDrillDown(prev =>
      prev?.monthIndex === monthIndex && prev?.year === year ? null : { monthIndex, year }
    );
  }, []);

  const drillDownProjects = useMemo(() => {
    if (!drillDown) return [];
    return getDrillDownProjects(allProjects, drillDown.monthIndex, drillDown.year, dateSelector);
  }, [drillDown, allProjects, dateSelector]);

  return (
    <div className="space-y-4">
      {/* Year selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">Jämför år:</span>
        <div className="flex bg-muted/50 rounded-lg p-0.5 gap-0.5">
          {availableYears.map(y => {
            const isActive = years.includes(y);
            return (
              <button key={y} onClick={() => onToggleYear(y)}
                className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {y}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className={cn("grid gap-3", years.length <= 2 ? "grid-cols-2" : years.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
        {years.map((y, i) => {
          const t = yearTotals[y] || { intäkt: 0, kostnad: 0, tb: 0 };
          const tbPct = t.intäkt > 0 ? (t.tb / t.intäkt) * 100 : 0;
          return (
            <div key={y} className={cn("rounded-xl border p-4", i === years.length - 1 ? "border-primary/20 bg-primary/5" : "border-border/40 bg-muted/10")}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{y}</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(t.intäkt)} kr</p>
              <p className={cn("text-xs mt-0.5 font-medium", t.tb >= 0 ? 'text-green-600' : 'text-destructive')}>
                TB: {formatCurrency(t.tb)} kr ({tbPct.toFixed(0)}%)
              </p>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatK} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<YoYTooltip />} />
            {years.map((y, i) => (
              <React.Fragment key={y}>
                <Bar
                  dataKey={String(y)}
                  name={String(y)}
                  fill={YOY_COLORS[i % YOY_COLORS.length]}
                  radius={[3, 3, 0, 0]}
                  opacity={i === years.length - 1 ? 0.9 : 0.5}
                  cursor="pointer"
                  onClick={(barData: any) => {
                    if (barData && typeof barData.monthIndex === 'number') {
                      handleBarClick(barData.monthIndex, y);
                    }
                  }}
                />
                <Bar dataKey={`${y}_kostnad`} hide />
              </React.Fragment>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        {years.map((y, i) => (
          <div key={y} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: YOY_COLORS[i % YOY_COLORS.length], opacity: i === years.length - 1 ? 0.9 : 0.5 }} />
            {y}
          </div>
        ))}
      </div>

      {/* Drill-down panel */}
      {drillDown && (
        <DrillDownPanel
          projects={drillDownProjects}
          monthName={MONTH_NAMES[drillDown.monthIndex]}
          year={drillDown.year}
          onClose={() => setDrillDown(null)}
        />
      )}

      {/* Table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Månad</th>
              {years.map(y => (
                <React.Fragment key={y}>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt {y}</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB {y}</th>
                </React.Fragment>
              ))}
              {years.length === 2 && (
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Δ%</th>
              )}
            </tr>
          </thead>
          <tbody>
            {buckets.map(b => {
              const intäkts = years.map(y => Number(b[String(y)]) || 0);
              return (
                <tr key={b.monthIndex} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                  <td className="py-2 px-3 text-xs font-medium">{b.monthName}</td>
                  {years.map((y, i) => {
                    const intäkt = intäkts[i];
                    const tb = Number(b[`${y}_tb`]) || 0;
                    return (
                      <React.Fragment key={y}>
                        <td className="py-2 px-3 text-xs text-right font-medium">{formatCurrency(intäkt)}</td>
                        <td className={cn("py-2 px-3 text-xs text-right font-medium", tb >= 0 ? 'text-green-600' : 'text-destructive')}>
                          {formatCurrency(tb)}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  {years.length === 2 && (() => {
                    const delta = intäkts[0] > 0 ? ((intäkts[1] - intäkts[0]) / intäkts[0]) * 100 : null;
                    return (
                      <td className={cn("py-2 px-3 text-xs text-right font-semibold",
                        delta !== null ? (delta >= 0 ? 'text-green-600' : 'text-destructive') : 'text-muted-foreground'
                      )}>
                        {delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%` : intäkts[1] > 0 ? 'Ny' : '–'}
                      </td>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border/40 bg-muted/20 font-semibold">
              <td className="py-2.5 px-3 text-xs">Totalt</td>
              {years.map(y => {
                const t = yearTotals[y] || { intäkt: 0, tb: 0 };
                return (
                  <React.Fragment key={y}>
                    <td className="py-2.5 px-3 text-xs text-right font-bold">{formatCurrency(t.intäkt)}</td>
                    <td className={cn("py-2.5 px-3 text-xs text-right font-bold", t.tb >= 0 ? 'text-green-600' : 'text-destructive')}>
                      {formatCurrency(t.tb)}
                    </td>
                  </React.Fragment>
                );
              })}
              {years.length === 2 && (() => {
                const a = yearTotals[years[0]]?.intäkt || 0;
                const b = yearTotals[years[1]]?.intäkt || 0;
                const delta = a > 0 ? ((b - a) / a) * 100 : null;
                return (
                  <td className={cn("py-2.5 px-3 text-xs text-right font-bold",
                    delta !== null ? (delta >= 0 ? 'text-green-600' : 'text-destructive') : 'text-muted-foreground'
                  )}>
                    {delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%` : '–'}
                  </td>
                );
              })()}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const EconomyTBAnalysis: React.FC<Props> = ({ projects }) => {
  const [activeTab, setActiveTab] = useState<TabValue>('orderingang');
  const [selectedYearsIngang, setSelectedYearsIngang] = useState<number[]>([]);
  const [selectedYearsSumma, setSelectedYearsSumma] = useState<number[]>([]);

  const orderIngång = useMemo(
    () => computeYoY(projects, selectedYearsIngang, p => p.bookingCreatedAt),
    [projects, selectedYearsIngang],
  );

  const orderSumma = useMemo(
    () => computeYoY(projects, selectedYearsSumma, p => p.eventdate),
    [projects, selectedYearsSumma],
  );

  const toggleYearIngang = (year: number) => {
    setSelectedYearsIngang(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort());
  };

  const toggleYearSumma = (year: number) => {
    setSelectedYearsSumma(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort());
  };

  const handleExport = () => {
    const data = activeTab === 'orderingang' ? orderIngång : orderSumma;
    const csv = generateYoYCSV(data.buckets, data.years, true);
    downloadCSV(csv, `${activeTab}-analys.csv`);
  };

  const dateSelectors = useMemo(() => ({
    orderingang: (p: EconomyProjectInsight) => p.bookingCreatedAt,
    ordersumma: (p: EconomyProjectInsight) => p.eventdate,
  }), []);

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Ekonomisk analys</h2>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />Exportera
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)} className="space-y-4">
          <TabsList className="h-8 p-0.5 bg-muted/50">
            <TabsTrigger value="orderingang" className="text-xs px-4 h-7">Orderingång</TabsTrigger>
            <TabsTrigger value="ordersumma" className="text-xs px-4 h-7">Ordersumma</TabsTrigger>
          </TabsList>

          <TabsContent value="orderingang" className="mt-0">
            <p className="text-xs text-muted-foreground mb-3">Ordervärde per månad baserat på <span className="font-semibold">när affären kommer in</span> (bokningsdatum)</p>
            <YoYView data={orderIngång} allProjects={projects} dateSelector={dateSelectors.orderingang} selectedYears={selectedYearsIngang} onToggleYear={toggleYearIngang} label="Orderingång" />
          </TabsContent>

          <TabsContent value="ordersumma" className="mt-0">
            <p className="text-xs text-muted-foreground mb-3">Ordervärde per månad baserat på <span className="font-semibold">när projektet utförs</span> (eventdatum)</p>
            <YoYView data={orderSumma} allProjects={projects} dateSelector={dateSelectors.ordersumma} selectedYears={selectedYearsSumma} onToggleYear={toggleYearSumma} label="Ordersumma" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EconomyTBAnalysis;