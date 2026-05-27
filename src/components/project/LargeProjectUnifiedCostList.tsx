import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, ShoppingCart, Package, Wrench, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BatchEconomyData } from '@/services/planningApiService';
import type { StaffTimeReport } from '@/types/projectEconomy';
import type { LargeProjectPurchase } from '@/types/largeProject';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const fmt = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

interface LocalProduct {
  id: string;
  booking_id: string;
  name: string;
  quantity: number;
  assembly_cost: number | null;
  handling_cost: number | null;
  purchase_cost: number | null;
  parent_product_id: string | null;
  is_package_component: boolean | null;
}

interface Props {
  bookingEconomyData: Record<string, BatchEconomyData> | null;
  localProducts: LocalProduct[];
  timeReportsByBooking: Record<string, StaffTimeReport[]>;
  purchases: LargeProjectPurchase[];
}

type CategoryKey = 'purchase' | 'handling' | 'assembly' | 'other';

const CATEGORY_META: Record<CategoryKey, { label: string; icon: React.ComponentType<any>; color: string }> = {
  purchase: { label: 'Inköp', icon: ShoppingCart, color: 'text-blue-600' },
  handling: { label: 'Lagerkostnad / Hantering', icon: Package, color: 'text-amber-600' },
  assembly: { label: 'Montagekostnad (Arbetstid)', icon: Wrench, color: 'text-purple-600' },
  other:    { label: 'Övriga kostnader', icon: Receipt, color: 'text-slate-600' },
};

export function LargeProjectUnifiedCostList({
  bookingEconomyData, localProducts, timeReportsByBooking, purchases,
}: Props) {
  const [expanded, setExpanded] = useState<Record<CategoryKey, boolean>>({
    purchase: false, handling: false, assembly: true, other: false,
  });

  const data = useMemo(() => {
    let budgetPurchase = 0, budgetHandling = 0, budgetAssembly = 0;
    const productLines: Array<{ name: string; qty: number; purchase: number; handling: number; assembly: number }> = [];

    localProducts.forEach((p) => {
      const qty = Number(p.quantity) || 1;
      const pu = (Number(p.purchase_cost) || 0) * qty;
      const ha = (Number(p.handling_cost) || 0) * qty;
      const as = (Number(p.assembly_cost) || 0) * qty;
      budgetPurchase += pu;
      budgetHandling += ha;
      budgetAssembly += as;
      if (pu > 0 || ha > 0 || as > 0) {
        productLines.push({ name: p.name, qty, purchase: pu, handling: ha, assembly: as });
      }
    });

    let actualAssembly = 0;
    let totalReportedHours = 0;
    const timeRows: Array<{ staff: string; date: string; hours: number; cost: number }> = [];
    Object.values(timeReportsByBooking).forEach((reports) => {
      reports.forEach((r: any) => {
        const date = r.work_date || r.date || '';
        // ⛔ Filtrera odaterade rader — får inte räknas in i Faktiskt-summan.
        if (!date) return;
        const hours = (Number(r.total_hours) || 0) + (Number(r.overtime_hours) || 0);
        const cost = Number(r.total_cost) || 0;
        actualAssembly += cost;
        totalReportedHours += hours;
        timeRows.push({
          staff: r.staff_name || r.staff_id || 'Okänd',
          date,
          hours,
          cost,
        });
      });
    });
    timeRows.sort((a, b) => (a.date < b.date ? 1 : -1));

    let actualPurchase = 0;
    const purchaseRows: Array<{ desc: string; supplier: string; date: string; amount: number; source: string }> = [];

    if (bookingEconomyData) {
      Object.values(bookingEconomyData).forEach((bd) => {
        const pu = bd.purchases;
        if (Array.isArray(pu)) {
          pu.forEach((p: any) => {
            const amt = Number(p.amount) || 0;
            actualPurchase += amt;
            purchaseRows.push({
              desc: p.description || 'Inköp',
              supplier: p.supplier || '-',
              date: p.purchase_date || '',
              amount: amt,
              source: 'Bokning',
            });
          });
        }
        const si = bd.supplier_invoices;
        if (Array.isArray(si)) {
          si.forEach((s: any) => {
            if (s.is_final_link && s.linked_cost_id) return;
            const amt = Number(s.invoice_data?.Total) || 0;
            actualPurchase += amt;
            purchaseRows.push({
              desc: s.invoice_data?.Description || `Lev.faktura ${s.invoice_data?.DocumentNumber || ''}`,
              supplier: s.invoice_data?.SupplierName || '-',
              date: s.invoice_data?.InvoiceDate || '',
              amount: amt,
              source: 'Lev.faktura',
            });
          });
        }
      });
    }

    let actualOther = 0;
    const otherRows: Array<{ desc: string; supplier: string; date: string; amount: number }> = [];
    purchases.forEach((p) => {
      const amt = Number(p.amount) || 0;
      otherRows.push({
        desc: p.description,
        supplier: p.supplier || '-',
        date: p.purchase_date || '',
        amount: amt,
      });
      actualOther += amt;
    });

    const actualHandling = budgetHandling;

    return {
      categories: {
        purchase: {
          budget: budgetPurchase,
          actual: actualPurchase,
          rows: purchaseRows,
          productLines: productLines.filter((l) => l.purchase > 0).map((l) => ({
            label: `${l.name} (×${l.qty})`, value: l.purchase,
          })),
        },
        handling: {
          budget: budgetHandling,
          actual: actualHandling,
          rows: [],
          productLines: productLines.filter((l) => l.handling > 0).map((l) => ({
            label: `${l.name} (×${l.qty})`, value: l.handling,
          })),
        },
        assembly: {
          budget: budgetAssembly,
          actual: actualAssembly,
          rows: timeRows,
          productLines: productLines.filter((l) => l.assembly > 0).map((l) => ({
            label: `${l.name} (×${l.qty})`, value: l.assembly,
          })),
          totalHours: totalReportedHours,
        },
        other: {
          budget: 0,
          actual: actualOther,
          rows: otherRows,
          productLines: [],
        },
      },
    };
  }, [bookingEconomyData, localProducts, timeReportsByBooking, purchases]);

  const totalBudget =
    data.categories.purchase.budget + data.categories.handling.budget +
    data.categories.assembly.budget + data.categories.other.budget;
  const totalActual =
    data.categories.purchase.actual + data.categories.handling.actual +
    data.categories.assembly.actual + data.categories.other.actual;
  const totalDiff = totalBudget - totalActual;

  const toggle = (k: CategoryKey) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  const renderCategoryRow = (key: CategoryKey) => {
    const meta = CATEGORY_META[key];
    const cat = data.categories[key] as any;
    const Icon = meta.icon;
    const diff = cat.budget - cat.actual;
    const isOpen = expanded[key];
    const hasDetails = (cat.rows?.length || 0) > 0 || (cat.productLines?.length || 0) > 0;

    return (
      <React.Fragment key={key}>
        <TableRow
          className={cn('cursor-pointer hover:bg-muted/50', isOpen && 'bg-muted/30')}
          onClick={() => hasDetails && toggle(key)}
        >
          <TableCell className="w-8">
            {hasDetails ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2 font-medium">
              <Icon className={cn('h-4 w-4', meta.color)} />
              {meta.label}
              {key === 'assembly' && cat.totalHours > 0 && (
                <Badge variant="secondary" className="text-xs">{cat.totalHours.toFixed(1)}h rapporterat</Badge>
              )}
            </div>
          </TableCell>
          <TableCell className="text-right tabular-nums">{fmt(cat.budget)}</TableCell>
          <TableCell className="text-right tabular-nums font-medium">{fmt(cat.actual)}</TableCell>
          <TableCell className={cn(
            'text-right tabular-nums font-semibold',
            diff < 0 ? 'text-red-600' : diff > 0 ? 'text-green-600' : 'text-muted-foreground'
          )}>
            {fmt(diff)}
          </TableCell>
        </TableRow>

        {isOpen && hasDetails && (
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableCell colSpan={5} className="p-0">
              <div className="p-4 space-y-3">
                {cat.productLines?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Budget från bokade produkter</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {cat.productLines.map((l: any, i: number) => (
                        <div key={i} className="flex justify-between border-b border-border/30 py-1">
                          <span className="truncate">{l.label}</span>
                          <span className="tabular-nums">{fmt(l.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {key === 'assembly' && cat.rows.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Rapporterad tid (faktiskt)</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Personal</TableHead>
                          <TableHead className="text-right">Timmar</TableHead>
                          <TableHead className="text-right">Kostnad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cat.rows.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{r.date ? format(new Date(r.date), 'yyyy-MM-dd', { locale: sv }) : '-'}</TableCell>
                            <TableCell>{r.staff}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.hours.toFixed(1)}h</TableCell>
                            <TableCell className="text-right tabular-nums">{fmt(r.cost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {(key === 'purchase' || key === 'other') && cat.rows.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Faktiska kostnader</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Datum</TableHead>
                          <TableHead>Beskrivning</TableHead>
                          <TableHead>Leverantör</TableHead>
                          {key === 'purchase' && <TableHead>Källa</TableHead>}
                          <TableHead className="text-right">Belopp</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cat.rows.map((r: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{r.date ? format(new Date(r.date), 'yyyy-MM-dd', { locale: sv }) : '-'}</TableCell>
                            <TableCell>{r.desc}</TableCell>
                            <TableCell>{r.supplier}</TableCell>
                            {key === 'purchase' && <TableCell><Badge variant="outline" className="text-xs">{r.source}</Badge></TableCell>}
                            <TableCell className="text-right tabular-nums">{fmt(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {key === 'handling' && (
                  <p className="text-xs text-muted-foreground italic">
                    Lagerkostnad följer budget från bokade produkter (ingen separat faktisk-källa).
                  </p>
                )}
              </div>
            </TableCell>
          </TableRow>
        )}
      </React.Fragment>
    );
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Budget vs Faktiskt — alla kostnader</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Faktiskt</TableHead>
              <TableHead className="text-right">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(['purchase', 'handling', 'assembly', 'other'] as CategoryKey[]).map(renderCategoryRow)}
            <TableRow className="border-t-2 font-bold bg-muted/40">
              <TableCell></TableCell>
              <TableCell>TOTALT</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(totalBudget)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(totalActual)}</TableCell>
              <TableCell className={cn(
                'text-right tabular-nums',
                totalDiff < 0 ? 'text-red-600' : totalDiff > 0 ? 'text-green-600' : 'text-muted-foreground'
              )}>
                {fmt(totalDiff)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
