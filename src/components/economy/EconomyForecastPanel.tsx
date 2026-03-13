import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, BarChart3, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { EconomyForecastBucket } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v);

const formatK = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
};

interface Props {
  forecasts: EconomyForecastBucket[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1.5 text-foreground">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-xs flex items-center justify-between gap-4" style={{ color: entry.color }}>
          <span>{entry.name}</span>
          <span className="font-medium">{formatCurrency(entry.value)} kr</span>
        </p>
      ))}
    </div>
  );
};

type SelectedPeriod = '30' | '60' | '90';

const EconomyForecastPanel: React.FC<Props> = ({ forecasts }) => {
  const [selected, setSelected] = useState<SelectedPeriod>('90');
  const selectedForecast = forecasts.find(f => f.days === Number(selected)) ?? forecasts[2];

  const chartData = forecasts.map(f => ({
    name: f.label,
    Säker: f.safeRevenue,
    Trolig: f.likelyRevenue,
    Pipeline: f.pipelineRevenue,
    Kostnad: f.forecastCost,
  }));

  const totalSelected = selectedForecast
    ? selectedForecast.safeRevenue + selectedForecast.likelyRevenue + selectedForecast.pipelineRevenue
    : 0;
  const hasData = totalSelected > 0 || (selectedForecast?.forecastCost ?? 0) > 0;

  const marginColor = (selectedForecast?.forecastMarginPercent ?? 0) >= 10
    ? 'text-green-600'
    : (selectedForecast?.forecastMarginPercent ?? 0) >= 0
      ? 'text-foreground'
      : 'text-destructive';

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Prognos & framåtblick</h2>
          </div>
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              value={selected}
              onValueChange={(v) => v && setSelected(v as SelectedPeriod)}
              className="gap-1"
            >
              <ToggleGroupItem value="30" className="text-[10px] h-7 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">30 dagar</ToggleGroupItem>
              <ToggleGroupItem value="60" className="text-[10px] h-7 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">60 dagar</ToggleGroupItem>
              <ToggleGroupItem value="90" className="text-[10px] h-7 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary">90 dagar</ToggleGroupItem>
            </ToggleGroup>

            {/* Legend */}
            <div className="hidden sm:flex items-center gap-3 ml-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
                <span className="text-[10px] text-muted-foreground">Säker</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary/50" />
                <span className="text-[10px] text-muted-foreground">Trolig</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm bg-primary/20" />
                <span className="text-[10px] text-muted-foreground">Pipeline</span>
              </div>
            </div>
          </div>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inga projekt påverkar prognosen för vald period</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Prognosen baseras på projekt med ekonomiskt underlag</p>
          </div>
        ) : (
          <>
            {/* Detail cards for selected period */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
              <MetricCard
                label="Säker intäkt"
                value={formatCurrency(selectedForecast?.safeRevenue ?? 0)}
                hint="Redan fakturerat + redo att fakturera"
                accent="text-primary"
              />
              <MetricCard
                label="Trolig intäkt"
                value={formatCurrency(selectedForecast?.likelyRevenue ?? 0)}
                hint="Aktiva projekt med starkt underlag"
                accent="text-foreground"
              />
              <MetricCard
                label="Pipeline"
                value={formatCurrency(selectedForecast?.pipelineRevenue ?? 0)}
                hint="Kommande med preliminärt värde"
                accent="text-muted-foreground"
              />
              <MetricCard
                label="Faktisk kostnad"
                value={formatCurrency(selectedForecast?.actualCost ?? 0)}
                hint="Registrerad hittills"
                accent="text-muted-foreground"
              />
              <MetricCard
                label="Progn. kostnad"
                value={formatCurrency(selectedForecast?.forecastCost ?? 0)}
                hint="Budget eller faktisk som grund"
                accent="text-muted-foreground"
              />
              <MetricCard
                label="Progn. marginal"
                value={`${(selectedForecast?.forecastMarginPercent ?? 0).toFixed(0)}%`}
                subValue={`${formatCurrency(selectedForecast?.forecastMargin ?? 0)} kr`}
                hint="Trolig intäkt minus progn. kostnad"
                accent={marginColor}
              />
            </div>

            {/* Chart */}
            <div className="h-56 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(200 12% 90%)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => formatK(v)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={55}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Säker" stackId="revenue" fill="hsl(184 55% 38%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Trolig" stackId="revenue" fill="hsl(184 55% 38% / 0.5)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Pipeline" stackId="revenue" fill="hsl(184 55% 38% / 0.2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Kostnad" fill="hsl(0 84% 60% / 0.25)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Data quality note */}
            <div className="flex items-start gap-2 mt-4 px-1">
              <Info className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Prognosen baseras på ordervärde, fakturerade belopp och budgetdata. Projekt utan ekonomiskt underlag inkluderas inte.
                Säker = redan fakturerat + redo för fakturering. Trolig = starka aktiva projekt. Pipeline = kommande med preliminärt värde.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Metric Card ────────────────────────────────────────────────────────────

const MetricCard: React.FC<{
  label: string;
  value: string;
  subValue?: string;
  hint: string;
  accent?: string;
}> = ({ label, value, subValue, hint, accent = 'text-foreground' }) => (
  <div className="rounded-xl border border-border/40 p-3 bg-muted/20">
    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className={cn("text-lg font-bold mt-0.5 leading-tight", accent)}>{value}</p>
    {subValue && <p className="text-[10px] text-muted-foreground mt-0.5">{subValue}</p>}
    <p className="text-[10px] text-muted-foreground/60 mt-1 leading-snug">{hint}</p>
  </div>
);

export default EconomyForecastPanel;
