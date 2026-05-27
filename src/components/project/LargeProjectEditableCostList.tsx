import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronRight, Plus, Trash2, ShoppingCart, Package, Wrench, Receipt, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import type { CostLine, CostCategory } from '@/services/largeProjectCostLines';
import type { BatchEconomyData } from '@/services/planningApiService';
import type { StaffTimeReport } from '@/types/projectEconomy';

const fmt = (v: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(v);

const META: Record<CostCategory, { label: string; icon: React.ComponentType<any>; color: string; hint: string }> = {
  purchase: { label: 'Inköp', icon: ShoppingCart, color: 'text-blue-600',
    hint: 'Inköp för projektet. Importera rapporterade inköp eller lägg till manuellt.' },
  handling: { label: 'Lagerkostnad', icon: Package, color: 'text-amber-600',
    hint: 'Manuell post – fyll i den lagerkostnad du vill räkna med för projektet.' },
  assembly: { label: 'Montagekostnad', icon: Wrench, color: 'text-purple-600',
    hint: 'Rapporterad arbetstid räknas av automatiskt nedan. Lägg till manuella poster för annan montagekostnad.' },
  other:    { label: 'Övriga kostnader', icon: Receipt, color: 'text-slate-600',
    hint: 'Övriga manuella kostnader för projektet.' },
};

interface LocalProduct {
  id: string;
  name: string;
  quantity: number;
  assembly_cost: number | null;
  handling_cost: number | null;
  purchase_cost: number | null;
}

interface Props {
  largeProjectId: string;
  lines: CostLine[];
  bookingEconomyData: Record<string, BatchEconomyData> | null;
  timeReportsByBooking: Record<string, StaffTimeReport[]>;
  localProducts: LocalProduct[];
  addLine: (input: { category: CostCategory; description?: string; amount?: number; budget_amount?: number; supplier?: string | null; cost_date?: string | null }) => void;
  updateLine: (input: { id: string; updates: Partial<CostLine> }) => void;
  removeLine: (id: string) => void;
}

/** Inline-editable cell */
function EditableCell({
  value, onSave, type = 'text', placeholder, className, align = 'left',
}: {
  value: string | number | null;
  onSave: (v: string) => void;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';
}) {
  const [v, setV] = useState(value == null ? '' : String(value));
  useEffect(() => { setV(value == null ? '' : String(value)); }, [value]);

  const commit = () => {
    if (String(value ?? '') !== v) onSave(v);
  };

  return (
    <Input
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={cn(
        'h-8 border-transparent bg-transparent hover:border-border focus:border-input focus:bg-background px-2',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
    />
  );
}

export function LargeProjectEditableCostList({
  largeProjectId, lines, bookingEconomyData, timeReportsByBooking, localProducts,
  addLine, updateLine, removeLine,
}: Props) {
  const [expanded, setExpanded] = useState<Record<CostCategory, boolean>>({
    purchase: true, handling: true, assembly: true, other: true,
  });

  // Group manual lines by category
  const byCategory = useMemo(() => {
    const r: Record<CostCategory, CostLine[]> = { purchase: [], handling: [], assembly: [], other: [] };
    lines.forEach((l) => { r[l.category]?.push(l); });
    return r;
  }, [lines]);

  // Reported time (drives Assembly actual)
  // Filtrerar bort odaterade rader — en cost line utan datum kan inte tillhöra
  // en specifik dag och får inte räknas in i Faktiskt-summan (Etapp 3 / dagvy).
  const timeRows = useMemo(() => {
    const rows: Array<{ id: string; staff: string; date: string; hours: number; cost: number }> = [];
    Object.values(timeReportsByBooking).forEach((reps) => {
      reps.forEach((r: any) => {
        const date = r.work_date || r.date || '';
        if (!date) return; // ⛔ odaterad rad — exkluderas
        const hours = (Number(r.total_hours) || 0) + (Number(r.overtime_hours) || 0);
        rows.push({
          id: r.id || `${r.staff_id}-${date}`,
          staff: r.staff_name || r.staff_id || 'Okänd',
          date,
          hours,
          cost: Number(r.total_cost) || 0,
        });
      });
    });
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [timeReportsByBooking]);

  const reportedTimeTotal = timeRows.reduce((s, r) => s + r.cost, 0);
  const reportedHoursTotal = timeRows.reduce((s, r) => s + r.hours, 0);

  // Importable suggestions for "Inköp" — purchases and supplier invoices not yet imported
  const importablePurchases = useMemo(() => {
    if (!bookingEconomyData) return [];
    const existingDescs = new Set(byCategory.purchase.map((l) => `${l.description}|${l.amount}|${l.cost_date || ''}`));
    const items: Array<{ key: string; description: string; supplier: string | null; date: string | null; amount: number }> = [];
    Object.values(bookingEconomyData).forEach((bd: any) => {
      (bd.purchases || []).forEach((p: any) => {
        const item = {
          key: `p-${p.id || p.description}`,
          description: p.description || 'Inköp',
          supplier: p.supplier || null,
          date: p.purchase_date || null,
          amount: Number(p.amount) || 0,
        };
        const k = `${item.description}|${item.amount}|${item.date || ''}`;
        if (!existingDescs.has(k)) items.push(item);
      });
      (bd.supplier_invoices || []).forEach((s: any) => {
        if (s.is_final_link && s.linked_cost_id) return;
        const amount = Number(s.invoice_data?.Total) || 0;
        const item = {
          key: `si-${s.id}`,
          description: s.invoice_data?.Description || `Lev.faktura ${s.invoice_data?.DocumentNumber || ''}`.trim(),
          supplier: s.invoice_data?.SupplierName || null,
          date: s.invoice_data?.InvoiceDate || null,
          amount,
        };
        const k = `${item.description}|${item.amount}|${item.date || ''}`;
        if (!existingDescs.has(k)) items.push(item);
      });
    });
    return items;
  }, [bookingEconomyData, byCategory.purchase]);

  // Per-line budget total (sum of budget_amount on manual lines, per category)
  const lineBudgets = useMemo(() => {
    const b: Record<CostCategory, number> = { purchase: 0, handling: 0, assembly: 0, other: 0 };
    (Object.keys(byCategory) as CostCategory[]).forEach((k) => {
      b[k] = byCategory[k].reduce((s, l) => s + (Number(l.budget_amount) || 0), 0);
    });
    return b;
  }, [byCategory]);

  // Product-derived budget per category (assembly/handling/purchase × qty)
  const productBudgets = useMemo(() => {
    const b: Record<CostCategory, number> = { purchase: 0, handling: 0, assembly: 0, other: 0 };
    localProducts.forEach((p) => {
      const qty = Number(p.quantity) || 1;
      b.purchase += (Number(p.purchase_cost) || 0) * qty;
      b.handling += (Number(p.handling_cost) || 0) * qty;
      b.assembly += (Number(p.assembly_cost) || 0) * qty;
    });
    return b;
  }, [localProducts]);

  // Final budget = product-derived + per-line budget overrides
  const budgets: Record<CostCategory, number> = {
    purchase: productBudgets.purchase + lineBudgets.purchase,
    handling: productBudgets.handling + lineBudgets.handling,
    assembly: productBudgets.assembly + lineBudgets.assembly,
    other: productBudgets.other + lineBudgets.other,
  };

  // Actual totals (manual lines + reported time for assembly)
  const actuals = useMemo(() => {
    const t: Record<CostCategory, number> = { purchase: 0, handling: 0, assembly: 0, other: 0 };
    (Object.keys(byCategory) as CostCategory[]).forEach((k) => {
      t[k] = byCategory[k].reduce((s, l) => s + (Number(l.amount) || 0), 0);
    });
    t.assembly += reportedTimeTotal;
    return t;
  }, [byCategory, reportedTimeTotal]);

  const grandBudget = budgets.purchase + budgets.handling + budgets.assembly + budgets.other;
  const grandActual = actuals.purchase + actuals.handling + actuals.assembly + actuals.other;
  const grandDiff = grandBudget - grandActual;

  const toggle = (k: CostCategory) => setExpanded((s) => ({ ...s, [k]: !s[k] }));

  const renderCategory = (cat: CostCategory) => {
    const meta = META[cat];
    const Icon = meta.icon;
    const items = byCategory[cat];
    const isOpen = expanded[cat];
    const showImportPanel = cat === 'purchase' && importablePurchases.length > 0;

    return (
      <React.Fragment key={cat}>
        {/* Header row */}
        <TableRow className="bg-muted/40 hover:bg-muted/40 cursor-pointer" onClick={() => toggle(cat)}>
          <TableCell className="w-8">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </TableCell>
          <TableCell colSpan={4}>
            <div className="flex items-center gap-2 font-semibold">
              <Icon className={cn('h-4 w-4', meta.color)} />
              {meta.label}
              <span className="text-xs font-normal text-muted-foreground">
                ({items.length} rader{cat === 'assembly' && reportedHoursTotal > 0 ? ` + ${reportedHoursTotal.toFixed(1)}h rapporterat` : ''})
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
                title={`Lägg till rad i ${meta.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isOpen) setExpanded((s) => ({ ...s, [cat]: true }));
                  addLine({ category: cat, description: '', amount: 0, cost_date: new Date().toISOString().slice(0, 10) });
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </TableCell>
          <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(budgets[cat])}</TableCell>
          <TableCell className="text-right tabular-nums font-bold">{fmt(actuals[cat])}</TableCell>
          <TableCell className={cn(
            'text-right tabular-nums font-semibold',
            (budgets[cat] - actuals[cat]) < 0 ? 'text-red-600' : (budgets[cat] - actuals[cat]) > 0 ? 'text-green-600' : 'text-muted-foreground'
          )}>
            {fmt(budgets[cat] - actuals[cat])}
          </TableCell>
          <TableCell />
        </TableRow>

        {isOpen && (
          <>
            {/* Manual rows */}
            {items.map((l) => {
              const lineBudget = Number(l.budget_amount) || 0;
              const lineActual = Number(l.amount) || 0;
              const lineDiff = lineBudget - lineActual;
              return (
                <TableRow key={l.id} className="hover:bg-muted/20">
                  <TableCell />
                  <TableCell>
                    <EditableCell
                      value={l.cost_date}
                      type="date"
                      onSave={(v) => updateLine({ id: l.id, updates: { cost_date: v || null } })}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={l.description}
                      placeholder="Beskrivning"
                      onSave={(v) => updateLine({ id: l.id, updates: { description: v } })}
                    />
                  </TableCell>
                  <TableCell>
                    <EditableCell
                      value={l.supplier}
                      placeholder="Leverantör"
                      onSave={(v) => updateLine({ id: l.id, updates: { supplier: v || null } })}
                    />
                  </TableCell>
                  <TableCell />
                  <TableCell className="w-28">
                    <EditableCell
                      value={lineBudget || null}
                      type="number"
                      align="right"
                      placeholder="0"
                      onSave={(v) => updateLine({ id: l.id, updates: { budget_amount: parseFloat(v) || 0 } })}
                    />
                  </TableCell>
                  <TableCell className="w-28">
                    <EditableCell
                      value={lineActual || null}
                      type="number"
                      align="right"
                      placeholder="0"
                      onSave={(v) => updateLine({ id: l.id, updates: { amount: parseFloat(v) || 0 } })}
                    />
                  </TableCell>
                  <TableCell className={cn(
                    'text-right tabular-nums text-sm',
                    lineDiff < 0 ? 'text-red-600' : lineDiff > 0 ? 'text-green-600' : 'text-muted-foreground'
                  )}>
                    {lineBudget || lineActual ? fmt(lineDiff) : ''}
                  </TableCell>
                  <TableCell className="w-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLine(l.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Reported time (read-only, only under assembly) */}
            {cat === 'assembly' && timeRows.length > 0 && (
              <>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableCell />
                  <TableCell colSpan={8} className="py-1.5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Rapporterad arbetstid (automatisk)
                  </TableCell>
                </TableRow>
                {timeRows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/10 text-sm text-muted-foreground">
                    <TableCell />
                    <TableCell>{r.date ? format(new Date(r.date), 'yyyy-MM-dd', { locale: sv }) : '-'}</TableCell>
                    <TableCell>{r.staff}</TableCell>
                    <TableCell>—</TableCell>
                    <TableCell className="text-right tabular-nums">{r.hours.toFixed(1)}h</TableCell>
                    <TableCell />
                    <TableCell className="text-right tabular-nums">{fmt(r.cost)}</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                ))}
              </>
            )}

            {/* Import panel + hint (the per-category "+" lives in the header row) */}
            <TableRow className="hover:bg-transparent">
              <TableCell />
              <TableCell colSpan={8} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {showImportPanel && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Importera från bokningar:
                      </span>
                      {importablePurchases.slice(0, 6).map((p) => (
                        <Button
                          key={p.key}
                          variant="secondary"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => addLine({
                            category: 'purchase',
                            description: p.description,
                            amount: p.amount,
                            supplier: p.supplier,
                            cost_date: p.date,
                          })}
                        >
                          + {p.description.slice(0, 24)} {fmt(p.amount)}
                        </Button>
                      ))}
                      {importablePurchases.length > 6 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => importablePurchases.forEach((p) => addLine({
                            category: 'purchase',
                            description: p.description,
                            amount: p.amount,
                            supplier: p.supplier,
                            cost_date: p.date,
                          }))}
                        >
                          Importera alla ({importablePurchases.length})
                        </Button>
                      )}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground italic ml-auto">{meta.hint}</span>
                </div>
              </TableCell>
            </TableRow>
          </>
        )}
      </React.Fragment>
    );
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Projektkostnader</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-32">Datum</TableHead>
              <TableHead>Beskrivning</TableHead>
              <TableHead className="w-40">Leverantör</TableHead>
              <TableHead className="w-20 text-right">Tim</TableHead>
              <TableHead className="w-28 text-right">Budget</TableHead>
              <TableHead className="w-28 text-right">Faktiskt</TableHead>
              <TableHead className="w-24 text-right">Diff</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(['purchase', 'handling', 'assembly', 'other'] as CostCategory[]).map(renderCategory)}
            <TableRow className="border-t-2 bg-muted/40 font-bold">
              <TableCell />
              <TableCell colSpan={4}>TOTALT</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(grandBudget)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(grandActual)}</TableCell>
              <TableCell className={cn(
                'text-right tabular-nums',
                grandDiff < 0 ? 'text-red-600' : grandDiff > 0 ? 'text-green-600' : 'text-muted-foreground'
              )}>
                {fmt(grandDiff)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
