import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Gauge, TrendingUp, Shield, PiggyBank, BarChart3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadershipMetrics } from '@/lib/economy/economyOverviewSelectors';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface Props {
  metrics: LeadershipMetrics;
}

const EconomyLeadershipSummary: React.FC<Props> = ({ metrics }) => {
  const marginColor = metrics.margin90Percent >= 15 ? 'text-green-600' :
                       metrics.margin90Percent >= 0 ? 'text-foreground' : 'text-destructive';
  const safePercent = Math.round(metrics.safeRatio90 * 100);

  return (
    <Card className="border-border/40 bg-gradient-to-r from-card via-card to-muted/10">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Gauge className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Ledningsöverblick</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Revenue 30 */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Omsättning 30d</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(metrics.revenue30)}</p>
            <p className="text-[10px] text-muted-foreground">säker + trolig prognos</p>
          </div>

          {/* Revenue 90 */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Omsättning 90d</p>
            <p className="text-xl font-bold text-foreground">{formatCurrency(metrics.revenue90)}</p>
            <p className="text-[10px] text-muted-foreground">säker + trolig prognos</p>
          </div>

          {/* Margin 90 */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Marginal 90d</p>
            <p className={cn("text-xl font-bold", marginColor)}>
              {metrics.margin90Percent.toFixed(0)}%
            </p>
            <p className="text-[10px] text-muted-foreground">prognostiserad marginal</p>
          </div>

          {/* Safe ratio */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Säkerhetsgrad</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold text-foreground">{safePercent}%</p>
              <Shield className={cn("h-4 w-4", safePercent >= 50 ? 'text-green-600' : 'text-amber-500')} />
            </div>
            <p className="text-[10px] text-muted-foreground">säker av total prognos</p>
          </div>

          {/* Pipeline */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pipeline</p>
            <p className="text-xl font-bold text-muted-foreground">{formatCurrency(metrics.pipelineTotal)}</p>
            <p className="text-[10px] text-muted-foreground">osäker intäkt</p>
          </div>

          {/* Project count */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aktiva projekt</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold text-foreground">{metrics.forecastProjectCount}</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-[10px] text-muted-foreground">påverkar prognosen</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EconomyLeadershipSummary;
