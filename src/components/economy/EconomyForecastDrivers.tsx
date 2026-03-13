import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, AlertTriangle, Receipt, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ForecastDrivers } from '@/lib/economy/economyOverviewSelectors';
import type { EconomyProjectInsight } from '@/types/economyOverview';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const TYPE_BADGE_CLASSES: Record<string, string> = {
  small: 'bg-[hsl(var(--project-small))] text-[hsl(var(--project-small-foreground))] ring-1 ring-[hsl(var(--project-small-border))]',
  medium: 'bg-[hsl(var(--project-medium))] text-[hsl(var(--project-medium-foreground))] ring-1 ring-[hsl(var(--project-medium-border))]',
  large: 'bg-[hsl(var(--project-large))] text-[hsl(var(--project-large-foreground))] ring-1 ring-[hsl(var(--project-large-border))]',
};
const TYPE_LABELS: Record<string, string> = { small: 'Litet', medium: 'Medel', large: 'Stort' };

interface Props {
  drivers: ForecastDrivers;
}

const DriverRow: React.FC<{
  project: EconomyProjectInsight;
  valueLabel: string;
  value: string;
  valueColor?: string;
}> = ({ project, valueLabel, value, valueColor = 'text-foreground' }) => {
  const navigate = useNavigate();
  const link = project.projectSize === 'medium' ? `/economy/${project.id}` : project.navigateTo;

  return (
    <div
      onClick={() => navigate(link)}
      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors group"
    >
      <Badge variant="outline" className={cn("text-[9px] px-1 py-0 font-medium shrink-0", TYPE_BADGE_CLASSES[project.projectSize])}>
        {TYPE_LABELS[project.projectSize]}
      </Badge>
      <span className="text-sm font-medium truncate flex-1">{project.name}</span>
      <div className="text-right shrink-0">
        <p className={cn("text-sm font-bold", valueColor)}>{value}</p>
        <p className="text-[9px] text-muted-foreground">{valueLabel}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />
    </div>
  );
};

const EconomyForecastDrivers: React.FC<Props> = ({ drivers }) => {
  const hasAny = drivers.topRevenue.length > 0 || drivers.topMarginRisk.length > 0 || drivers.topRemainingToInvoice.length > 0;

  if (!hasAny) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Top Revenue */}
      <Card className="border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Högst intäktsprognos</h3>
          </div>
          {drivers.topRevenue.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Ingen data</p>
          ) : (
            <div className="space-y-0.5">
              {drivers.topRevenue.map(p => (
                <DriverRow
                  key={p.id}
                  project={p}
                  valueLabel="prognos"
                  value={formatCurrency(p.forecastRevenue)}
                  valueColor="text-primary"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Margin Risk */}
      <Card className="border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold">Störst marginalrisk</h3>
          </div>
          {drivers.topMarginRisk.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Inga riskprojekt identifierade</p>
          ) : (
            <div className="space-y-0.5">
              {drivers.topMarginRisk.map(p => (
                <DriverRow
                  key={p.id}
                  project={p}
                  valueLabel="marginal"
                  value={`${p.forecastMarginPercent.toFixed(0)}%`}
                  valueColor={p.forecastMarginPercent < 0 ? 'text-destructive' : 'text-amber-600'}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remaining to Invoice */}
      <Card className="border-border/40">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Mest kvar att fakturera</h3>
          </div>
          {drivers.topRemainingToInvoice.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Allt fakturerat</p>
          ) : (
            <div className="space-y-0.5">
              {drivers.topRemainingToInvoice.map(p => (
                <DriverRow
                  key={p.id}
                  project={p}
                  valueLabel="kvar"
                  value={formatCurrency(p.remainingToInvoice)}
                  valueColor="text-primary"
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EconomyForecastDrivers;
