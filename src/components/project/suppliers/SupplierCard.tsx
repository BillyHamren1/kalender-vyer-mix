import { Card, CardContent } from "@/components/ui/card";
import { SupplierStatusBadge } from "./SupplierStatusBadge";
import type { ProjectSupplier } from "@/types/supplier";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Building2, Calendar, ChevronRight } from "lucide-react";

interface SupplierCardProps {
  supplier: ProjectSupplier;
  onClick: () => void;
}

const SupplierCard = ({ supplier, onClick }: SupplierCardProps) => {
  const price = supplier.confirmed_price ?? supplier.quoted_price;
  const priceLabel = supplier.confirmed_price ? 'Bekräftat' : supplier.quoted_price ? 'Offererat' : null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {supplier.name}
              </h3>
              <SupplierStatusBadge status={supplier.status} />
            </div>

            {supplier.company_name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{supplier.company_name}</span>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              {supplier.service_type && (
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {supplier.service_type}
                </span>
              )}

              {price != null && (
                <span className="text-xs font-medium text-foreground">
                  {price.toLocaleString('sv-SE')} {supplier.currency}
                  {priceLabel && (
                    <span className="text-muted-foreground font-normal ml-1">({priceLabel})</span>
                  )}
                </span>
              )}

              {supplier.delivery_date && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(supplier.delivery_date), 'd MMM yyyy', { locale: sv })}
                </span>
              )}
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  );
};

export default SupplierCard;
