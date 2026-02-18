
import React from 'react';
import { BookingEconomics } from '@/types/booking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface BookingEconomicsCardProps {
  economics: BookingEconomics;
}

const formatSEK = (value?: number): string => {
  if (value === undefined || value === null) return '–';
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(value);
};

const BookingEconomicsCard: React.FC<BookingEconomicsCardProps> = ({ economics }) => {
  const marginColor =
    (economics.margin_pct ?? 0) >= 60
      ? 'text-green-600'
      : (economics.margin_pct ?? 0) >= 40
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Ekonomisk kalkyl
          <span className="ml-auto text-xs font-normal text-muted-foreground">från offert</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tre nyckeltal */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Intäkter</p>
            <p className="font-semibold text-sm">{formatSEK(economics.total_revenue_ex_vat)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Kostnader</p>
            <p className="font-semibold text-sm">{formatSEK(economics.total_costs)}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Bruttomarginal</p>
            <p className={`font-semibold text-sm ${marginColor}`}>
              {formatSEK(economics.gross_margin)}
            </p>
            {economics.margin_pct !== undefined && (
              <p className={`text-xs font-medium ${marginColor}`}>{economics.margin_pct}%</p>
            )}
          </div>
        </div>

        {/* Kostnadsuppdelning */}
        {(economics.total_assembly_cost !== undefined ||
          economics.total_handling_cost !== undefined ||
          economics.total_purchase_cost !== undefined) && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Kostnadsuppdelning</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {economics.total_assembly_cost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Montage: </span>
                  <span className="font-medium">{formatSEK(economics.total_assembly_cost)}</span>
                </span>
              )}
              {economics.total_handling_cost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Lager: </span>
                  <span className="font-medium">{formatSEK(economics.total_handling_cost)}</span>
                </span>
              )}
              {economics.total_purchase_cost !== undefined && (
                <span className="text-xs">
                  <span className="text-muted-foreground">Inköp: </span>
                  <span className="font-medium">{formatSEK(economics.total_purchase_cost)}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BookingEconomicsCard;
