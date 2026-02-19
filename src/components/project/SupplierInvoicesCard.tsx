import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { SupplierInvoice } from '@/types/projectEconomy';

interface SupplierInvoicesCardProps {
  supplierInvoices: SupplierInvoice[];
  onRefresh?: () => Promise<any>;
}

const fmt = (v: number) =>
  v == null ? '–' : v === 0 ? '0' : v.toLocaleString('sv-SE');

export const SupplierInvoicesCard = ({ supplierInvoices, onRefresh }: SupplierInvoicesCardProps) => {
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

  const total = supplierInvoices.reduce(
    (sum, si) => sum + (Number(si.invoice_data?.Total) || 0), 0
  );

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
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Fakturanr</th>
                <th className="text-left py-2 px-2 font-medium">Leverantör</th>
                <th className="text-left py-2 px-2 font-medium">Fakturadatum</th>
                <th className="text-left py-2 px-2 font-medium">Förfallodatum</th>
                <th className="text-right py-2 px-2 font-medium">Belopp</th>
                <th className="text-right py-2 pl-2 font-medium">Kvar att betala</th>
              </tr>
            </thead>
            <tbody>
              {supplierInvoices.map((si) => (
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
                  <td className="py-2 px-2 text-sm text-muted-foreground">
                    {si.invoice_data?.DueDate || '–'}
                  </td>
                  <td className="py-2 px-2 text-sm text-right font-medium">
                    {fmt(Number(si.invoice_data?.Total) || 0)} kr
                  </td>
                  <td className="py-2 pl-2 text-sm text-right">
                    {fmt(Number(si.invoice_data?.Balance) || 0)} kr
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 text-sm font-semibold">
                <td className="py-2.5 pr-3" colSpan={4}>Totalt</td>
                <td className="py-2.5 px-2 text-right">{fmt(total)} kr</td>
                <td className="py-2.5 pl-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
