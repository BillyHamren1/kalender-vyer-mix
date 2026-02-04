import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import type { EconomySummary } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor, getDeviationBgColor } from '@/types/projectEconomy';

interface EconomySummaryCardProps {
  summary: EconomySummary;
}

export const EconomySummaryCard = ({ summary }: EconomySummaryCardProps) => {
  const status = getDeviationStatus(summary.totalDeviationPercent);
  // Budget usage for progress bar (how much of budget is used)
  const budgetUsagePercent = summary.totalBudget > 0 
    ? (summary.totalActual / summary.totalBudget) * 100 
    : (summary.totalActual > 0 ? 150 : 0);
  const progressValue = Math.min(budgetUsagePercent, 150);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };


  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Budget</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalBudget)}</p>
            <p className="text-xs text-muted-foreground">Totalt</p>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Utfall</p>
            <p className="text-2xl font-bold">{formatCurrency(summary.totalActual)}</p>
            <p className="text-xs text-muted-foreground">Totalt</p>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-1">Avvikelse</p>
          <div className="flex items-center justify-center gap-2">
              <p className={`text-2xl font-bold ${getDeviationColor(status)}`}>
                {summary.totalDeviation >= 0 ? '+' : ''}{formatCurrency(summary.totalDeviation)}
              </p>
              {status === 'ok' ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className={`h-5 w-5 ${status === 'danger' ? 'text-red-600' : 'text-yellow-600'}`} />
              )}
            </div>
            <p className={`text-xs ${getDeviationColor(status)}`}>
              {summary.totalBudget > 0 ? `${summary.totalDeviationPercent >= 0 ? '+' : ''}${summary.totalDeviationPercent.toFixed(1)}%` : '-'}
            </p>
          </div>
        </div>

        {/* Budget breakdown */}
        {(summary.productCostBudget > 0 || summary.staffBudget > 0 || summary.quotesTotal > 0) && (
          <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-muted/30 rounded-lg text-sm">
            <div className="text-center">
              <p className="text-muted-foreground">Produktkostnader</p>
              <p className="font-medium">{formatCurrency(summary.productCostBudget)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Personalbudget</p>
              <p className="font-medium">{formatCurrency(summary.staffBudget)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Offerter</p>
              <p className="font-medium">{formatCurrency(summary.quotesTotal)}</p>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Budgetanvändning</span>
            <span className={getDeviationColor(status)}>
              {budgetUsagePercent.toFixed(0)}%
            </span>
          </div>
          <div className="relative">
            <Progress 
              value={Math.min(progressValue, 100)} 
              className="h-3" 
            />
            {budgetUsagePercent > 100 && (
              <div 
                className="absolute top-0 h-3 bg-destructive rounded-r-full"
                style={{ 
                  left: `${(100 / progressValue) * 100}%`,
                  width: `${((progressValue - 100) / progressValue) * 100}%`
                }}
              />
            )}
            {/* Budget marker at 100% */}
            <div 
              className="absolute top-0 w-0.5 h-3 bg-foreground/50"
              style={{ left: `${(100 / 150) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>Budget (100%)</span>
            <span>150%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
