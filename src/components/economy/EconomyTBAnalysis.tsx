import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BarChart3, Download, CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, isWithinInterval, parseISO, isBefore, subMonths, addMonths, getYear, getMonth } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { EconomyProjectInsight } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v);

const formatK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

type QuickRange = '3m' | '6m' | '12m' | 'custom';
type TabValue = 'tb' | 'revenue' | 'orderingang';

interface Props {
  projects: EconomyProjectInsight[];
}

interface MonthBucket {
  month: string;
  label: string;
  intäkt: number;
  kostnad: number;
  tb: number;
  tbPercent: number;
  projectCount: number;
  isPast: boolean;
}

// ── Compute buckets by eventdate ──
function computeBuckets(projects: EconomyProjectInsight[], from: Date, to: Date): MonthBucket[] {
  const now = new Date();
  const months = eachMonthOfInterval({ start: startOfMonth(from), end: startOfMonth(to) });

  return months.map(monthDate => {
    const mStart = startOfMonth(monthDate);
    const mEnd = endOfMonth(monthDate);
    const monthKey = format(monthDate, 'yyyy-MM');
    const label = format(monthDate, 'MMM yy', { locale: sv });
    const isPast = isBefore(mEnd, now);

    let intäkt = 0, kostnad = 0, projectCount = 0;

    projects.forEach(p => {
      if (!p.eventdate) return;
      try {
        const eventDate = parseISO(p.eventdate);
        if (!isWithinInterval(eventDate, { start: mStart, end: mEnd })) return;
      } catch { return; }

      projectCount++;
      intäkt += p.quotedAmount;
      kostnad += p.actualCost;
      if (!isPast && p.forecastCost > p.actualCost) {
        kostnad += (p.forecastCost - p.actualCost);
      }
    });

    const tb = intäkt - kostnad;
    const tbPercent = intäkt > 0 ? (tb / intäkt) * 100 : 0;
    return { month: monthKey, label, intäkt, kostnad, tb, tbPercent, projectCount, isPast };
  });
}

// ── Compute order intake YoY ──
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

interface OrderYoYBucket {
  monthIndex: number;
  monthName: string;
  [key: string]: number | string; // year keys like "2025", "2026"
}

function computeOrderIntakeYoY(projects: EconomyProjectInsight[], selectedYears: number[]): { buckets: OrderYoYBucket[]; years: number[]; availableYears: number[] } {
  const yearMonthMap = new Map<string, number>();

  projects.forEach(p => {
    const dateStr = p.bookingCreatedAt;
    if (!dateStr) return;
    try {
      const d = parseISO(dateStr);
      const key = `${getYear(d)}-${String(getMonth(d)).padStart(2, '0')}`;
      yearMonthMap.set(key, (yearMonthMap.get(key) || 0) + p.quotedAmount);
    } catch { return; }
  });

  // All available years from data
  const availableYearsSet = new Set<number>();
  yearMonthMap.forEach((_, key) => availableYearsSet.add(parseInt(key.split('-')[0])));
  const currentYear = new Date().getFullYear();
  if (availableYearsSet.size === 0) {
    availableYearsSet.add(currentYear - 1);
    availableYearsSet.add(currentYear);
  }
  const availableYears = Array.from(availableYearsSet).sort();

  // Use selected years or default to last 2
  const years = selectedYears.length > 0
    ? selectedYears.filter(y => availableYears.includes(y)).sort()
    : availableYears.slice(-2);

  const buckets: OrderYoYBucket[] = MONTH_NAMES.map((name, i) => {
    const bucket: OrderYoYBucket = { monthIndex: i, monthName: name };
    years.forEach(y => {
      const key = `${y}-${String(i).padStart(2, '0')}`;
      bucket[String(y)] = yearMonthMap.get(key) || 0;
    });
    return bucket;
  });

  return { buckets, years, availableYears };
}

// ── CSV helpers ──
function generateCSV(buckets: MonthBucket[], mode: 'tb' | 'revenue'): string {
  if (mode === 'revenue') {
    const header = 'Månad,Intäkt,Antal projekt,Typ';
    const rows = buckets.map(b => `${b.label},${b.intäkt},${b.projectCount},${b.isPast ? 'Faktisk' : 'Prognos'}`);
    return [header, ...rows].join('\n');
  }
  const header = 'Månad,Intäkt,Kostnad,TB,TB%,Antal projekt';
  const rows = buckets.map(b => `${b.label},${b.intäkt},${b.kostnad},${b.tb},${b.tbPercent.toFixed(1)}%,${b.projectCount}`);
  return [header, ...rows].join('\n');
}

function generateOrderCSV(buckets: OrderYoYBucket[], years: number[]): string {
  const header = ['Månad', ...years.map(String)].join(',');
  const rows = buckets.map(b => [b.monthName, ...years.map(y => b[String(y)] || 0)].join(','));
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

// ── Tooltips ──

const TBTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm min-w-[180px]">
      <p className="font-semibold mb-2 text-foreground capitalize">{d.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Intäkt</span><span className="font-medium">{formatCurrency(d.intäkt)} kr</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Kostnad</span><span className="font-medium">{formatCurrency(d.kostnad)} kr</span></div>
        <div className="border-t border-border/50 pt-1 mt-1 flex justify-between">
          <span className="font-semibold">TB</span>
          <span className={cn("font-bold", d.tb >= 0 ? 'text-green-600' : 'text-destructive')}>{formatCurrency(d.tb)} kr ({d.tbPercent.toFixed(0)}%)</span>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Projekt</span><span>{d.projectCount} st</span></div>
        {!d.isPast && <p className="text-[9px] text-muted-foreground/60 italic mt-1">* Prognos</p>}
      </div>
    </div>
  );
};

const RevenueTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm min-w-[160px]">
      <p className="font-semibold mb-2 text-foreground capitalize">{d.label}</p>
      <div className="space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Intäkt</span><span className="font-bold">{formatCurrency(d.intäkt)} kr</span></div>
        <div className="flex justify-between text-[10px] text-muted-foreground"><span>Projekt</span><span>{d.projectCount} st</span></div>
        {!d.isPast && <p className="text-[9px] text-muted-foreground/60 italic mt-1">* Prognos</p>}
      </div>
    </div>
  );
};

const OrderTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm min-w-[140px]">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.color }} className="font-medium">{p.dataKey}</span>
            <span className="font-bold">{formatCurrency(p.value)} kr</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── YoY bar colors ──
const YOY_COLORS = [
  'hsl(var(--muted-foreground))',
  'hsl(var(--primary))',
  'hsl(142 71% 45%)',
  'hsl(280 70% 50%)',
];

// ── Main component ──

const EconomyTBAnalysis: React.FC<Props> = ({ projects }) => {
  const [activeTab, setActiveTab] = useState<TabValue>('tb');
  const [quickRange, setQuickRange] = useState<QuickRange>('6m');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);

  const dateRange = useMemo(() => {
    if (quickRange === 'custom' && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    const now = new Date();
    switch (quickRange) {
      case '3m': return { from: subMonths(now, 2), to: addMonths(now, 1) };
      case '6m': return { from: subMonths(now, 3), to: addMonths(now, 3) };
      case '12m': return { from: subMonths(now, 6), to: addMonths(now, 6) };
      default: return { from: subMonths(now, 3), to: addMonths(now, 3) };
    }
  }, [quickRange, customFrom, customTo]);

  const buckets = useMemo(
    () => computeBuckets(projects, dateRange.from, dateRange.to),
    [projects, dateRange],
  );

  const orderYoY = useMemo(
    () => computeOrderIntakeYoY(projects, selectedYears),
    [projects, selectedYears],
  );

  const summary = useMemo(() => {
    const past = buckets.filter(b => b.isPast);
    const future = buckets.filter(b => !b.isPast);
    const sum = (arr: MonthBucket[], key: 'intäkt' | 'kostnad') => arr.reduce((s, b) => s + b[key], 0);

    const pastI = sum(past, 'intäkt'), pastK = sum(past, 'kostnad');
    const futI = sum(future, 'intäkt'), futK = sum(future, 'kostnad');
    const totI = pastI + futI, totK = pastK + futK;
    const pastTB = pastI - pastK, futTB = futI - futK, totTB = totI - totK;

    return {
      pastIntäkt: pastI, pastKostnad: pastK, pastTB, pastTBPct: pastI > 0 ? (pastTB / pastI) * 100 : 0,
      futIntäkt: futI, futKostnad: futK, futTB, futTBPct: futI > 0 ? (futTB / futI) * 100 : 0,
      totIntäkt: totI, totKostnad: totK, totTB, totTBPct: totI > 0 ? (totTB / totI) * 100 : 0,
    };
  }, [buckets]);

  const orderSummary = useMemo(() => {
    const totals: Record<number, number> = {};
    orderYoY.years.forEach(y => {
      totals[y] = orderYoY.buckets.reduce((s, b) => s + (Number(b[String(y)]) || 0), 0);
    });
    return totals;
  }, [orderYoY]);

  const handleExport = () => {
    if (activeTab === 'orderingang') {
      const csv = generateOrderCSV(orderYoY.buckets, orderYoY.years);
      downloadCSV(csv, `orderingang-yoy.csv`);
    } else {
      const csv = generateCSV(buckets, activeTab as 'tb' | 'revenue');
      const label = activeTab === 'tb' ? 'tb-analys' : 'intäkt';
      downloadCSV(csv, `${label}-${format(dateRange.from, 'yyyy-MM')}-${format(dateRange.to, 'yyyy-MM')}.csv`);
    }
  };

  const handleQuickRange = (r: QuickRange) => {
    setQuickRange(r);
    if (r !== 'custom') { setCustomFrom(undefined); setCustomTo(undefined); }
  };

  const toggleYear = (year: number) => {
    setSelectedYears(prev => {
      if (prev.includes(year)) {
        return prev.filter(y => y !== year);
      }
      return [...prev, year].sort();
    });
  };

  const handleFromSelect = (d: Date | undefined) => { setCustomFrom(d); setQuickRange('custom'); setFromOpen(false); };
  const handleToSelect = (d: Date | undefined) => { setCustomTo(d); setQuickRange('custom'); setToOpen(false); };

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Ekonomisk analys</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-muted/50 rounded-lg p-0.5">
              {(['3m', '6m', '12m'] as const).map(r => (
                <button key={r} onClick={() => handleQuickRange(r)}
                  className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all",
                    quickRange === r ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {r === '3m' ? '3 mån' : r === '6m' ? '6 mån' : '12 mån'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 min-w-[100px] justify-start", !customFrom && quickRange !== 'custom' && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3" />
                    {customFrom ? format(customFrom, 'MMM yyyy', { locale: sv }) : 'Från'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={handleFromSelect} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">–</span>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-7 text-xs gap-1 min-w-[100px] justify-start", !customTo && quickRange !== 'custom' && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3" />
                    {customTo ? format(customTo, 'MMM yyyy', { locale: sv }) : 'Till'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" selected={customTo} onSelect={handleToSelect} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />Exportera
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)} className="space-y-4">
          <TabsList className="h-8 p-0.5 bg-muted/50">
            <TabsTrigger value="tb" className="text-xs px-4 h-7">Täckningsbidrag</TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs px-4 h-7">Intäkt</TabsTrigger>
            <TabsTrigger value="orderingang" className="text-xs px-4 h-7">Orderingång</TabsTrigger>
          </TabsList>

          {/* ── TB Tab ── */}
          <TabsContent value="tb" className="space-y-4 mt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Faktiskt TB</p>
                <p className={cn("text-2xl font-bold", summary.pastTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {formatCurrency(summary.pastTB)} kr
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{summary.pastTBPct.toFixed(0)}% · {formatCurrency(summary.pastIntäkt)} kr intäkt</p>
              </div>
              <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Beräknat TB</p>
                <p className={cn("text-2xl font-bold", summary.futTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {formatCurrency(summary.futTB)} kr
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{summary.futTBPct.toFixed(0)}% · {formatCurrency(summary.futIntäkt)} kr intäkt</p>
              </div>
              <div className="rounded-xl border border-primary/20 p-4 bg-primary/5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Totalt TB</p>
                <p className={cn("text-2xl font-bold", summary.totTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                  {formatCurrency(summary.totTB)} kr
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{summary.totTBPct.toFixed(0)}% · {formatCurrency(summary.totIntäkt)} kr intäkt</p>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatK} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<TBTooltip />} />
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

            <div className="flex items-center gap-4 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm bg-primary opacity-85" /> Intäkt</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm bg-muted-foreground opacity-40" /> Kostnad</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(142 71% 45%)' }} /> TB+</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'hsl(0 84% 60%)', opacity: 0.5 }} /> TB−</div>
            </div>
          </TabsContent>

          {/* ── Revenue Tab (by eventdate) ── */}
          <TabsContent value="revenue" className="space-y-4 mt-0">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Faktisk intäkt</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.pastIntäkt)} kr</p>
                <p className="text-xs text-muted-foreground mt-0.5">Historisk period</p>
              </div>
              <div className="rounded-xl border border-border/40 p-4 bg-muted/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Prognostiserad intäkt</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.futIntäkt)} kr</p>
                <p className="text-xs text-muted-foreground mt-0.5">Kommande period</p>
              </div>
              <div className="rounded-xl border border-primary/20 p-4 bg-primary/5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total intäkt</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(summary.totIntäkt)} kr</p>
                <p className="text-xs text-muted-foreground mt-0.5">Per eventdatum</p>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={buckets} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatK} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<RevenueTooltip />} />
                  <Bar dataKey="intäkt" name="Intäkt" radius={[4, 4, 0, 0]}>
                    {buckets.map((b, i) => (
                      <Cell key={i} fill="hsl(var(--primary))" opacity={b.isPast ? 0.9 : 0.45} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 justify-center">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm bg-primary opacity-90" /> Faktisk</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3 h-3 rounded-sm bg-primary opacity-45" /> Prognos</div>
            </div>
          </TabsContent>

          {/* ── Orderingång Tab (YoY by created_at) ── */}
          <TabsContent value="orderingang" className="space-y-4 mt-0">
            <div className={cn("grid gap-3", orderYoY.years.length <= 2 ? "grid-cols-2" : `grid-cols-${Math.min(orderYoY.years.length, 4)}`)}>
              {orderYoY.years.map((y, i) => (
                <div key={y} className={cn("rounded-xl border p-4", i === orderYoY.years.length - 1 ? "border-primary/20 bg-primary/5" : "border-border/40 bg-muted/10")}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{y}</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(orderSummary[y] || 0)} kr</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total orderingång</p>
                </div>
              ))}
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orderYoY.buckets} barCategoryGap="15%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis dataKey="monthName" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={formatK} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={50} />
                  <Tooltip content={<OrderTooltip />} />
                  {orderYoY.years.map((y, i) => (
                    <Bar key={y} dataKey={String(y)} name={String(y)} fill={YOY_COLORS[i % YOY_COLORS.length]} radius={[3, 3, 0, 0]} opacity={i === orderYoY.years.length - 1 ? 0.9 : 0.5} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center gap-4 justify-center">
              {orderYoY.years.map((y, i) => (
                <div key={y} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: YOY_COLORS[i % YOY_COLORS.length], opacity: i === orderYoY.years.length - 1 ? 0.9 : 0.5 }} />
                  {y}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Monthly table */}
        {activeTab !== 'orderingang' && (
          <div className="mt-5 rounded-lg border border-border/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Månad</th>
                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Intäkt</th>
                  {activeTab === 'tb' && <>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kostnad</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB</th>
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">TB%</th>
                  </>}
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
                      <td className="py-2 px-3 text-xs text-right font-medium">{formatCurrency(b.intäkt)}</td>
                      {activeTab === 'tb' && <>
                        <td className="py-2 px-3 text-xs text-right text-muted-foreground">{formatCurrency(b.kostnad)}</td>
                        <td className={cn("py-2 px-3 text-xs text-right font-semibold", tbColor)}>{formatCurrency(b.tb)}</td>
                        <td className={cn("py-2 px-3 text-xs text-right font-medium", tbColor)}>{b.tbPercent.toFixed(0)}%</td>
                      </>}
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
              <tfoot>
                <tr className="border-t-2 border-border/40 bg-muted/20 font-semibold">
                  <td className="py-2.5 px-3 text-xs">Totalt</td>
                  <td className="py-2.5 px-3 text-xs text-right font-bold">{formatCurrency(summary.totIntäkt)}</td>
                  {activeTab === 'tb' && <>
                    <td className="py-2.5 px-3 text-xs text-right text-muted-foreground">{formatCurrency(summary.totKostnad)}</td>
                    <td className={cn("py-2.5 px-3 text-xs text-right font-bold", summary.totTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                      {formatCurrency(summary.totTB)}
                    </td>
                    <td className={cn("py-2.5 px-3 text-xs text-right font-bold", summary.totTB >= 0 ? 'text-green-600' : 'text-destructive')}>
                      {summary.totTBPct.toFixed(0)}%
                    </td>
                  </>}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Order intake table */}
        {activeTab === 'orderingang' && (
          <div className="mt-5 rounded-lg border border-border/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Månad</th>
                  {orderYoY.years.map(y => (
                    <th key={y} className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{y}</th>
                  ))}
                  {orderYoY.years.length === 2 && (
                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Δ%</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {orderYoY.buckets.map(b => {
                  const vals = orderYoY.years.map(y => Number(b[String(y)]) || 0);
                  return (
                    <tr key={b.monthIndex} className="border-t border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="py-2 px-3 text-xs font-medium">{b.monthName}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="py-2 px-3 text-xs text-right font-medium">{formatCurrency(v)}</td>
                      ))}
                      {orderYoY.years.length === 2 && (
                        <td className={cn("py-2 px-3 text-xs text-right font-semibold",
                          vals[0] > 0 ? (((vals[1] - vals[0]) / vals[0]) * 100 >= 0 ? 'text-green-600' : 'text-destructive') : 'text-muted-foreground'
                        )}>
                          {vals[0] > 0
                            ? `${((vals[1] - vals[0]) / vals[0]) * 100 >= 0 ? '+' : ''}${(((vals[1] - vals[0]) / vals[0]) * 100).toFixed(0)}%`
                            : vals[1] > 0 ? 'Ny' : '–'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/40 bg-muted/20 font-semibold">
                  <td className="py-2.5 px-3 text-xs">Totalt</td>
                  {orderYoY.years.map(y => (
                    <td key={y} className="py-2.5 px-3 text-xs text-right font-bold">{formatCurrency(orderSummary[y] || 0)}</td>
                  ))}
                  {orderYoY.years.length === 2 && (
                    <td className={cn("py-2.5 px-3 text-xs text-right font-bold",
                      orderSummary[orderYoY.years[0]] > 0
                        ? ((orderSummary[orderYoY.years[1]] - orderSummary[orderYoY.years[0]]) / orderSummary[orderYoY.years[0]] * 100) >= 0
                          ? 'text-green-600' : 'text-destructive'
                        : 'text-muted-foreground'
                    )}>
                      {orderSummary[orderYoY.years[0]] > 0
                        ? `${((orderSummary[orderYoY.years[1]] - orderSummary[orderYoY.years[0]]) / orderSummary[orderYoY.years[0]] * 100) >= 0 ? '+' : ''}${((orderSummary[orderYoY.years[1]] - orderSummary[orderYoY.years[0]]) / orderSummary[orderYoY.years[0]] * 100).toFixed(0)}%`
                        : '–'}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EconomyTBAnalysis;
