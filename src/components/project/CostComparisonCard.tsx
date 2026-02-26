import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { BarChart3 } from 'lucide-react';
import type { ProductCostSummary } from '@/services/productCostService';
import type { StaffTimeReport, SupplierInvoice, ProjectPurchase } from '@/types/projectEconomy';
import { getDeviationStatus, getDeviationColor } from '@/types/projectEconomy';

const fmt = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface CostComparisonCardProps {
  productCosts: ProductCostSummary | null;
  staffActual: number;
  supplierInvoices: SupplierInvoice[];
  purchases: ProjectPurchase[];
}

interface CostRow {
  label: string;
  budget: number;
  actual: number;
}

export const CostComparisonCard = ({
  productCosts,
  staffActual,
  supplierInvoices,
  purchases,
}: CostComparisonCardProps) => {
  const products = productCosts?.products ?? [];

  const assemblyBudget = products.reduce(
    (sum, p) => sum + (p.assembly_cost ?? 0) * (p.quantity ?? 1),
    0
  );
  const handlingBudget = products.reduce(
    (sum, p) => sum + (p.handling_cost ?? 0) * (p.quantity ?? 1),
    0
  );
  const purchaseBudget = products.reduce(
    (sum, p) => sum + (p.purchase_cost ?? 0) * (p.quantity ?? 1),
    0
  );

  // Actual: supplier invoices linked to products + registered purchases
  const purchaseActual =
    supplierInvoices
      .filter((si) => si.linked_cost_type === 'product')
      .reduce((sum, si) => sum + (si.invoice_data?.Total ?? 0), 0) +
    purchases.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const rows: CostRow[] = [
    { label: 'Montagekostnad', budget: assemblyBudget, actual: staffActual },
    { label: 'Lagerkostnad', budget: handlingBudget, actual: 0 },
    { label: 'Inköpskostnad', budget: purchaseBudget, actual: purchaseActual },
  ];

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  const renderDeviation = (budget: number, actual: number) => {
    const deviation = budget - actual;
    const pct = budget !== 0 ? (deviation / budget) * 100 : 0;
    const status = getDeviationStatus(-Math.abs(pct) * (deviation < 0 ? 1 : -1));
    // Positive deviation = under budget (good), negative = over budget (bad)
    const deviationPct = budget !== 0 ? ((budget - actual) / budget) * 100 : 0;
    const deviationStatus = getDeviationStatus(deviationPct);
    const color = getDeviationColor(deviationStatus);

    return (
      <>
        <TableCell className={`text-right font-medium ${color}`}>
          {deviation >= 0 ? '' : '-'}{fmt(Math.abs(deviation))} kr
        </TableCell>
        <TableCell className={`text-right font-medium ${color}`}>
          {deviationPct >= 0 ? '+' : ''}{deviationPct.toFixed(1)}%
        </TableCell>
      </>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Budget vs Utfall per kostnadstyp
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kostnadstyp</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Utfall</TableHead>
                <TableHead className="text-right">Avvikelse</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right">{fmt(row.budget)} kr</TableCell>
                  <TableCell className="text-right">{fmt(row.actual)} kr</TableCell>
                  {renderDeviation(row.budget, row.actual)}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-bold">
                <TableCell>Totalt</TableCell>
                <TableCell className="text-right">{fmt(totalBudget)} kr</TableCell>
                <TableCell className="text-right">{fmt(totalActual)} kr</TableCell>
                {renderDeviation(totalBudget, totalActual)}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
