import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ForecastBucket } from '@/hooks/useEconomyDashboard';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(v);

interface Props {
  forecasts: ForecastBucket[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {formatCurrency(entry.value)} kr
        </p>
      ))}
    </div>
  );
};

const EconomyForecastPanel: React.FC<Props> = ({ forecasts }) => {
  const chartData = forecasts.map(f => ({
    name: f.label,
    Säker: f.secure,
    Trolig: f.probable,
    Pipeline: f.pipeline,
    Total: f.secure + f.probable + f.pipeline,
  }));

  const maxVal = Math.max(...chartData.map(d => d.Total));

  return (
    <Card className="border-border/40">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Intäktsprognos</h2>
          </div>
          <div className="flex items-center gap-3">
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

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {forecasts.map((f, i) => (
            <div key={f.label} className="rounded-xl border border-border/40 p-3 bg-muted/20">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{f.label}</p>
              <p className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(f.secure + f.probable + f.pipeline)} kr</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] text-primary font-medium">{formatCurrency(f.secure)} säker</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">{formatCurrency(f.probable)} trolig</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis 
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} 
                tick={{ fontSize: 10 }} 
                axisLine={false} 
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Säker" stackId="a" fill="hsl(184 55% 38%)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Trolig" stackId="a" fill="hsl(184 55% 38% / 0.5)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Pipeline" stackId="a" fill="hsl(184 55% 38% / 0.2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomyForecastPanel;
