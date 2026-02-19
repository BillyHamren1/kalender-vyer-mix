import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, RefreshCw, AlertTriangle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SupplierInvoice, LinkedCostType, ProjectPurchase, ProjectBudget } from '@/types/projectEconomy';

interface ProductCostItem {
  id: string;
  product_name?: string;
  name?: string;
  total?: number;
}

interface SupplierInvoicesCardProps {
  supplierInvoices: SupplierInvoice[];
  onRefresh?: () => Promise<any>;
  purchases?: ProjectPurchase[];
  productCosts?: { products?: ProductCostItem[] } | null;
  budget?: ProjectBudget | null;
  onLinkInvoice?: (data: { id: string; linked_cost_type: LinkedCostType; linked_cost_id: string | null }) => void;
}

const fmt = (v: number) =>
  v == null ? '–' : v === 0 ? '0' : v.toLocaleString('sv-SE');

const buildLinkValue = (type: LinkedCostType, id: string | null): string => {
  if (!type || !id) return '__none__';
  return `${type}::${id}`;
};

const parseLinkValue = (value: string): { type: LinkedCostType; id: string | null } => {
  if (value === '__none__') return { type: null, id: null };
  const [type, id] = value.split('::');
  return { type: type as LinkedCostType, id };
};

export const SupplierInvoicesCard = ({
  supplierInvoices,
  onRefresh,
  purchases = [],
  productCosts,
  budget,
  onLinkInvoice,
}: SupplierInvoicesCardProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      toast.success('Leverantörsfakturor uppdaterade');
    } catch {
      toast.error('Kunde inte uppdatera');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLinkChange = (invoiceId: string, value: string) => {
    if (!onLinkInvoice) return;
    const { type, id } = parseLinkValue(value);
    onLinkInvoice({ id: invoiceId, linked_cost_type: type, linked_cost_id: id });
  };

  const products = productCosts?.products || [];

  const getLinkLabel = (si: SupplierInvoice): string | null => {
    if (!si.linked_cost_type || !si.linked_cost_id) return null;
    switch (si.linked_cost_type) {
      case 'purchase': {
        const p = purchases.find(x => x.id === si.linked_cost_id);
        return p ? `Inköp: ${p.description}` : 'Inköp (okänd)';
      }
      case 'product': {
        const pr = products.find(x => x.id === si.linked_cost_id);
        return pr ? `Produkt: ${pr.product_name || pr.name}` : 'Produkt (okänd)';
      }
      case 'budget':
        return 'Budgetpost';
      default:
        return null;
    }
  };

  const total = supplierInvoices.reduce(
    (sum, si) => sum + (Number(si.invoice_data?.Total) || 0), 0
  );

  const hasLinkingOptions = purchases.length > 0 || products.length > 0 || !!budget;

  if (supplierInvoices.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Leverantörsfakturor (Fortnox)
            </CardTitle>
            {onRefresh && (
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-sm">
            Inga leverantörsfakturor hittades. Data hämtas från Booking-systemet när det är tillgängligt.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Leverantörsfakturor (Fortnox)
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px]">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Fakturanr</th>
                <th className="text-left py-2 px-2 font-medium">Leverantör</th>
                <th className="text-left py-2 px-2 font-medium">Fakturadatum</th>
                <th className="text-right py-2 px-2 font-medium">Belopp</th>
                <th className="text-right py-2 px-2 font-medium">Kvar att betala</th>
                {hasLinkingOptions && (
                  <th className="text-left py-2 pl-2 font-medium">Kopplad till</th>
                )}
              </tr>
            </thead>
            <tbody>
              {supplierInvoices.map((si) => {
                const currentValue = buildLinkValue(si.linked_cost_type, si.linked_cost_id);
                const isLinked = !!si.linked_cost_type && !!si.linked_cost_id;

                return (
                  <tr key={si.id} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="py-2 pr-3 text-sm font-medium">
                      {si.invoice_data?.GivenNumber || si.given_number || '–'}
                    </td>
                    <td className="py-2 px-2 text-sm">
                      {si.invoice_data?.SupplierName || '–'}
                    </td>
                    <td className="py-2 px-2 text-sm text-muted-foreground">
                      {si.invoice_data?.InvoiceDate || '–'}
                    </td>
                    <td className="py-2 px-2 text-sm text-right font-medium">
                      {fmt(Number(si.invoice_data?.Total) || 0)} kr
                    </td>
                    <td className="py-2 px-2 text-sm text-right">
                      {fmt(Number(si.invoice_data?.Balance) || 0)} kr
                    </td>
                    {hasLinkingOptions && (
                      <td className="py-1.5 pl-2">
                        {onLinkInvoice ? (
                          <div className="flex items-center gap-1.5">
                            {!isLinked && (
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                            )}
                            {isLinked && (
                              <Link2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            )}
                            <Select value={currentValue} onValueChange={(v) => handleLinkChange(si.id, v)}>
                              <SelectTrigger className="h-7 text-xs w-[180px]">
                                <SelectValue placeholder="Välj koppling..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  <span className="text-muted-foreground">Ingen koppling</span>
                                </SelectItem>

                                {purchases.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>Inköp</SelectLabel>
                                    {purchases.map(p => (
                                      <SelectItem key={`purchase::${p.id}`} value={`purchase::${p.id}`}>
                                        {p.description} ({fmt(p.amount)} kr)
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}

                                {products.length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel>Produktkostnader</SelectLabel>
                                    {products.map(pr => (
                                      <SelectItem key={`product::${pr.id}`} value={`product::${pr.id}`}>
                                        {pr.product_name || pr.name} ({fmt(pr.total || 0)} kr)
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )}

                                {budget && (
                                  <SelectGroup>
                                    <SelectLabel>Budget</SelectLabel>
                                    <SelectItem value={`budget::${budget.id}`}>
                                      Budgetpost ({fmt(budget.budgeted_hours * budget.hourly_rate)} kr)
                                    </SelectItem>
                                  </SelectGroup>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {getLinkLabel(si) || '–'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 text-sm font-semibold">
                <td className="py-2.5 pr-3" colSpan={3}>Totalt</td>
                <td className="py-2.5 px-2 text-right">{fmt(total)} kr</td>
                <td className="py-2.5 px-2" />
                {hasLinkingOptions && <td className="py-2.5 pl-2" />}
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
