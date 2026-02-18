
import React, { useState } from 'react';
import { BookingEconomics, BookingEconomicsLineItem } from '@/types/booking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BookingEconomicsCardProps {
  economics: BookingEconomics;
  label?: string;
}

const formatSEK = (value?: number): string => {
  if (value === undefined || value === null) return '–';
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(value);
};

const normalizeEconomics = (e: BookingEconomics) => ({
  revenue: e.revenue?.total_ex_vat ?? e.total_revenue_ex_vat,
  currency: e.revenue?.currency ?? 'SEK',
  assemblyCost: e.costs?.assembly ?? e.total_assembly_cost,
  handlingCost: e.costs?.handling ?? e.total_handling_cost,
  purchaseCost: e.costs?.purchase ?? e.total_purchase_cost,
  totalCosts: e.costs?.total ?? e.total_costs,
  grossMargin: e.margin?.gross ?? e.gross_margin,
  marginPct: e.margin?.pct ?? e.margin_pct,
  lineItems: e.line_items ?? [],
});

const BookingEconomicsCard: React.FC<BookingEconomicsCardProps> = ({ economics, label }) => {
  const [showLineItems, setShowLineItems] = useState(false);
  const n = normalizeEconomics(economics);

  const marginColor =
    (n.marginPct ?? 0) >= 60
      ? 'text-green-600'
      : (n.marginPct ?? 0) >= 40
      ? 'text-yellow-600'
      : 'text-red-600';

  const marginBadgeClass =
    (n.marginPct ?? 0) >= 60
      ? 'bg-green-100 text-green-700'
      : (n.marginPct ?? 0) >= 40
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          {label ?? 'Ekonomisk kalkyl'}
          <span className="ml-auto text-xs font-normal text-muted-foreground">från offert</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* KPI boxes */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Intäkter</p>
            <p className="font-semibold text-sm">{formatSEK(n.revenue)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Kostnader</p>
            <p className="font-semibold text-sm">{formatSEK(n.totalCosts)}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Bruttomarginal</p>
            <p className={`font-semibold text-sm ${marginColor}`}>{formatSEK(n.grossMargin)}</p>
            {n.marginPct !== undefined && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${marginBadgeClass}`}>
                {n.marginPct}%
              </span>
            )}
          </div>
        </div>

        {/* Cost breakdown row */}
        {(n.assemblyCost !== undefined || n.handlingCost !== undefined || n.purchaseCost !== undefined) && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Kostnadsuppdelning</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {n.assemblyCost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Montage: </span>
                  <span className="font-medium">{formatSEK(n.assemblyCost)}</span>
                </span>
              )}
              {n.handlingCost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Lager: </span>
                  <span className="font-medium">{formatSEK(n.handlingCost)}</span>
                </span>
              )}
              {n.purchaseCost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Inköp: </span>
                  <span className="font-medium">{formatSEK(n.purchaseCost)}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Line items table */}
        {n.lineItems.length > 0 && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full flex items-center justify-between h-8 px-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowLineItems(!showLineItems)}
            >
              <span>Produktkalkyl ({n.lineItems.length} produkter)</span>
              {showLineItems ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>

            {showLineItems && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-1.5 pr-3 font-medium">Produkt</th>
                      <th className="text-right py-1.5 px-2 font-medium">Ant</th>
                      <th className="text-right py-1.5 px-2 font-medium">Intäkt</th>
                      <th className="text-right py-1.5 px-2 font-medium">Montage</th>
                      <th className="text-right py-1.5 px-2 font-medium">Lager</th>
                      <th className="text-right py-1.5 px-2 font-medium">Inköp</th>
                      <th className="text-right py-1.5 pl-2 font-medium">Totalt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {n.lineItems.map((item: BookingEconomicsLineItem, idx: number) => (
                      <tr key={idx} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-1.5 pr-3 font-medium max-w-[180px] truncate" title={item.product_name}>
                          {item.product_name}
                        </td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{item.quantity}</td>
                        <td className="text-right py-1.5 px-2">{formatSEK(item.total_revenue)}</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{formatSEK(item.assembly_cost)}</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{formatSEK(item.handling_cost)}</td>
                        <td className="text-right py-1.5 px-2 text-muted-foreground">{formatSEK(item.purchase_cost)}</td>
                        <td className="text-right py-1.5 pl-2 font-medium">{formatSEK(item.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-1.5 pr-3">Totalt</td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground">–</td>
                      <td className="text-right py-1.5 px-2">{formatSEK(n.revenue)}</td>
                      <td className="text-right py-1.5 px-2">{formatSEK(n.assemblyCost)}</td>
                      <td className="text-right py-1.5 px-2">{formatSEK(n.handlingCost)}</td>
                      <td className="text-right py-1.5 px-2">{formatSEK(n.purchaseCost)}</td>
                      <td className="text-right py-1.5 pl-2">{formatSEK(n.totalCosts)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingEconomicsCard;
