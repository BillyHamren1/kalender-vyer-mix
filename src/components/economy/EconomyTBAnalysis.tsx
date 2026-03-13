import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Download, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isWithinInterval, parseISO, isBefore } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { EconomyProjectInsight } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v);

const formatK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

type ViewRange = '3m' | '6m' | '12m';

interface Props {
  projects: EconomyProjectInsight[];
}

interface MonthBucket {
  month: string; // YYYY-MM
  label: string;
  intäkt: number;
  kostnad: number;
  tb: number;
  tbPercent: number;
  projectCount: number;
  isPast: boolean;
}

function getMonthBuckets(projects: EconomyProjectInsight[], monthsBack: number, monthsForward: number): MonthBucket[] {
  const now = new Date();
  const buckets: MonthBucket[] = [];

  for (let i = -monthsBack; i <= monthsForward; i++) {
    const monthDate = i < 0 ? subMonths(now, -i) : i > 0 ? addMonths(now, i) : now;
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    const monthKey = format(monthDate, 'yyyy-MM');
    const label = format(monthDate, 'MMM yy', { locale: sv });
    const isPast = isBefore(monthEnd, now);

    let intäkt = 0;
    let kostnad = 0;
    let projectCount = 0;

    projects.forEach(p => {
      if (!p.eventdate) return;
      try {
        const eventDate = parseISO(p.eventdate);
        if (!isWithinInterval(eventDate, { start: monthStart, end: monthEnd })) return;
      } catch {
        return;
      }

      projectCount++;

      // Revenue = product revenue (what customer pays)
      intäkt += p.quotedAmount; // This is actually productRevenue via getExpectedRevenue

      // Cost = staff + purchases + supplier invoices
      kostnad += p.actualCost;

      // For future months where we don't have actuals yet, use forecast cost
      if (!isPast && p.forecastCost > p.actualCost) {
        kostnad += (p.forecastCost - p.actualCost);
      }
    });

    const tb = intäkt - kostnad;
    const tbPercent = intäkt > 0 ? (tb / intäkt) * 100 : 0;

    buckets.push({ month: monthKey, label, intäkt, kostnad, tb, tbPercent, projectCount, isPast });
  }

  return buckets;
}

function generateCSV(buckets: MonthBucket[]): string {
  const header = 'Månad,Intäkt,Kostnad,TB,TB%,Antal projekt';
  const rows = buckets.map(b =>
    `${b.label},${b.intäkt},${b.kostnad},${b.tb},${b.tbPercent.toFixed(1)}%,${b.projectCount}`
  );
  return [header, ...rows].join('\n');
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold mb-2 text-foreground capitalize">{data.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Intäkt</span>
          <span className="font-medium">{formatCurrency(data.intäkt)} kr</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Kostnad</span>
          <span className="font-medium">{formatCurrency(data.kostnad)} kr</span>
        </div>
        <div className="border-t border-border/50 pt-1 mt-1 flex justify-between">
          <span className="font-semibold">TB</span>
          <span className={cn("font-bold", data.tb >= 0 ? 'text-green-600' : 'text-destructive')}>
            {formatCurrency(data.tb)} kr ({data.tbPercent.toFixed(0)}%)
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Projekt</span>
          <span>{data.projectCount} st</span>
        </div>
        {!data.isPast && (
          <p className="text-[9px] text-muted-foreground/60 italic mt-1">* Prognos</p>
        )}
      </div>
    </div>
  );
};

const EconomyTBAnalysis: React.FC<Props> = ({ projects }) => {
  const [range, setRange] = useState<ViewRange>('6m');

  const config = useMemo(() => {
    switch (range) {
      case '3m': return { back: 2, forward: 1 };
      case '6m': return { back: 3, forward: 3 };
      case '12m': return { back: 6, forward: 6 };
    }
  }, [range]);

  const buckets = useMemo(
    () => getMonthBuckets(projects, config.back, config.forward),
    [projects, config],
  );

  // Summary for the range
  const summary = useMemo(() => {
    const pastBuckets = buckets.filter(b => b.isPast);
    const futureBuckets = buckets.filter(b => !b.isPast);

    const pastIntäkt = pastBuckets.reduce((s, b) => s + b.intäkt, 0);
    const pastKostnad = pastBuckets.reduce((s, b) => s + b.kostnad, 0);
    const pastTB = pastIntäkt - pastKostnad;
    const pastTBPercent = pastIntäkt > 0 ? (pastTB / pastIntäkt) * 100 : 0;

    const futureIntäkt = futureBuckets.reduce((s, b) => s + b.intäkt, 0);
    const futureKostnad = futureBuckets.reduce((s, b) => s + b.kostnad, 0);
    const futureTB = futureIntäkt - futureKostnad;
    const futureTBPercent = futureIntäkt > 0 ? (futureTB / futureIntäkt) * 100 : 0;

    const totalIntäkt = pastIntäkt + futureIntäkt;
    const totalKostnad = pastKostnad + futureKostnad;
    const totalTB = totalIntäkt - totalKostnad;
    const totalTBPercent = totalIntäkt > 0 ? (totalTB / totalIntäkt) * 100 : 0;

    return { pastIntäkt, pastKostnad, pastTB, pastTBPercent, futureIntäkt, futureKostnad, futureTB, futureTBPercent, totalIntäkt, totalKostnad, totalTB, totalTBPercent };
  }, [buckets]);

  const handleExport = () => {
    const csv = generateCSV(buckets);
    const rangeLabel = range === '3m' ? '3mån' : range === '6m' ? '6mån' : '12mån';
    downloadCSV(csv, `tb-analys-${rangeLabel}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">TB-analys</h2>
            <span className="text-xs text-muted-foreground ml-1">Täckningsbidrag per månad</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Range selector */}
            <div className="flex bg-muted/50 rounded-lg p-0.5">
              {(['3m', '6m', '12m'] as ViewRange[]).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition-all",
                    range === r
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === '3m' ? '3 mån' : r === '6m' ? '6 mån' : '12 mån'}
                </button>
              ))}
            </div>

            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
              Exportera
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {/* Historical TB */}
          <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Faktiskt TB (historik)</p>
            <p className={cn("text-2xl font-bold", summary.pastTB >= 0 ? 'text-green-600' : 'text-destructive')}>
              {formatCurrency(summary.pastTB)} kr
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.pastTBPercent.toFixed(0)}% av {formatCurrency(summary.pastIntäkt)} kr intäkt
            </p>
          </div>

          {/* Forecast TB */}
          <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Beräknat TB (prognos)</p>
            <p className={cn("text-2xl font-bold", summary.futureTB >= 0 ? 'text-green-600' : 'text-destructive')}>
              {formatCurrency(summary.futureTB)} kr
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.futureTBPercent.toFixed(0)}% av {formatCurrency(summary.futureIntäkt)} kr intäkt
            </p>
          </div>

          {/* Total TB */}
          <div className="rounded-xl border border-primary/20 p-4 bg-primary/5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Totalt TB (period)</p>
            <p className={cn("text-2xl font-bold", summary.totalTB >= 0 ? 'text-green-600' : 'text-destructive')}>
              {formatCurrency(summary.totalTB)} kr
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {summary.totalTBPercent.toFixed(0)}% av {formatCurrency(summary.totalIntäkt)} kr intäkt
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatK}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar dataKey="intäkt" name="Intäkt" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="kostnad" name="Kostnad" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} opacity={0.4} />
              <Bar dataKey="tb" name="TB" radius={[3, 3, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.tb >= 0 ? 'hsl(142 71% 45%)' : 'hsl(0 84% 60%)'} opacity={b.isPast ? 0.9 : 0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-sm bg-primary opacity-85" />
            Intäkt
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-sm bg-muted-foreground opacity-40" />
            Kostnad
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(142 71% 45%)' }} />
            TB (positiv)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(0 84% 60%)', opacity: 0.5 }} />
            TB (negativ/prognos)
          </div>
        </div>

        {/* Monthly table */}
        <div className="mt-5 rounded-lg border border-border/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Månad</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kostnad</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB</th>
                <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB%</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Projekt</th>
                <th className="text-center py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Typ</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map(b => {
                const tbColor = b.tb > 0 ? 'text-green-600' : b.tb < 0 ? 'text-destructive' : 'text-muted-foreground';
                return (
                  <tr key={b.month} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2 px-3 text-xs font-medium capitalize">{b.label}</td>
                    <td className="py-2 px-3 text-xs text-right">{formatCurrency(b.intäkt)}</td>
                    <td className="py-2 px-3 text-xs text-right text-muted-foreground">{formatCurrency(b.kostnad)}</td>
                    <td className={cn("py-2 px-3 text-xs text-right font-semibold", tbColor)}>{formatCurrency(b.tb)}</td>
                    <td className={cn("py-2 px-3 text-xs text-right font-medium", tbColor)}>{b.tbPercent.toFixed(0)}%</td>
                    <td className="py-2 px-3 text-xs text-center text-muted-foreground">{b.projectCount}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="outline" className={cn("text-[9px] px-1.5", b.isPast ? 'bg-muted/50' : 'bg-primary/10 text-primary')}>
                        {b.isPast ? 'Faktisk' : 'Prognos'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            <tfoot>
              <tr className="border-t-2 border-border/40 bg-muted/20 font-semibold">
                <td className="py-2.5 px-3 text-xs">Totalt</td>
                <td className="py-2.5 px-3 text-xs text-right">{formatCurrency(summary.totalIntäkt)}</td>
                <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{formatCurrency(summary.totalKostnad)}</td>
                <td className={cn("py-2.5 px-3 text-xs text-right font-bold", summary.totalTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {formatCurrency(summary.totalTB)}
                </td>
                <td className={cn("py-2.5 px-3 text-xs text-right font-bold", summary.totalTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {summary.totalTBPercent.toFixed(0)}%
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomyTBAnalysis;
