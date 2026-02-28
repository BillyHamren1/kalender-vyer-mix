import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Info } from 'lucide-react';
import type { EconomySummary } from '@/types/projectEconomy';
import type { BookingEconomics } from '@/types/booking';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface EconomySummaryCardProps {
  summary: EconomySummary;
  bookingEconomics?: BookingEconomics | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

export const EconomySummaryCard = ({ summary, bookingEconomics }: EconomySummaryCardProps) => {
  const [budgetOpen, setBudgetOpen] = useState(false);

  // Revenue from booking economics (offert)
  const revenue = bookingEconomics?.revenue?.total_ex_vat ?? bookingEconomics?.total_revenue_ex_vat ?? 0;

  // Actual costs = staff + purchases + supplier invoices
  const totalCosts = summary.staffActual + summary.purchasesTotal + summary.supplierInvoicesTotal;

  // Result = Revenue - Costs
  const result = revenue - totalCosts;
  const marginPct = revenue > 0 ? (result / revenue) * 100 : 0;

  const resultColor = result >= 0 ? 'text-green-600' : 'text-red-600';
  const marginBadge = result >= 0
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-700';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Projektresultat
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main outcome: Revenue - Costs = Result */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Intäkter</p>
            <p className="text-xl font-bold">{formatCurrency(revenue)}</p>
            <p className="text-xs text-muted-foreground">från offert</p>
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Kostnader (utfall)</p>
            <p className="text-xl font-bold">{formatCurrency(totalCosts)}</p>
            <p className="text-xs text-muted-foreground">faktiska kostnader</p>
          </div>

          <div className="rounded-lg bg-primary/10 p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Resultat</p>
            <p className={`text-xl font-bold ${resultColor}`}>
              {result >= 0 ? '+' : ''}{formatCurrency(result)}
            </p>
            {revenue > 0 && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${marginBadge}`}>
                {marginPct.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Cost breakdown */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="p-2 rounded border text-center">
            <p className="text-xs text-muted-foreground">Personal</p>
            <p className="font-medium">{formatCurrency(summary.staffActual)}</p>
            <p className="text-xs text-muted-foreground">{summary.actualHours.toFixed(1)} tim</p>
          </div>
          <div className="p-2 rounded border text-center">
            <p className="text-xs text-muted-foreground">Inköp</p>
            <p className="font-medium">{formatCurrency(summary.purchasesTotal)}</p>
          </div>
          <div className="p-2 rounded border text-center">
            <p className="text-xs text-muted-foreground">Leverantörsfakturor</p>
            <p className="font-medium">{formatCurrency(summary.supplierInvoicesTotal)}</p>
          </div>
        </div>

        {/* Budget as collapsible info section */}
        {(summary.staffBudget > 0 || summary.productCostBudget > 0 || summary.quotesTotal > 0) && (
          <Collapsible open={budgetOpen} onOpenChange={setBudgetOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full py-2 border-t">
              <Info className="h-3.5 w-3.5" />
              <span>Budgetreferens</span>
              <ChevronDown className={`h-3.5 w-3.5 ml-auto transition-transform ${budgetOpen ? 'rotate-180' : ''}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="grid grid-cols-3 gap-3 p-3 bg-muted/20 rounded-lg text-sm mt-1">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Personalbudget</p>
                  <p className="font-medium">{formatCurrency(summary.staffBudget)}</p>
                  <p className="text-xs text-muted-foreground">{summary.budgetedHours} tim × {summary.hourlyRate} kr</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Produktkostnader</p>
                  <p className="font-medium">{formatCurrency(summary.productCostBudget)}</p>
                  <p className="text-xs text-muted-foreground">kalkylerad</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Offerter</p>
                  <p className="font-medium">{formatCurrency(summary.quotesTotal)}</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
