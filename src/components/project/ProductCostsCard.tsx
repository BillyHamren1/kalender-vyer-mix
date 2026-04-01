import { useMemo, useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, ChevronDown, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ProductCostData, ProductCostSummary } from '@/services/productCostService';
import type { ProductCostOverride } from '@/services/productCostOverrideService';
import type { SupplierInvoice } from '@/types/projectEconomy';

interface ProductCostsCardProps {
  productCosts: ProductCostSummary;
  isLoading?: boolean;
  onRefresh?: () => Promise<any>;
  supplierInvoices?: SupplierInvoice[];
  costOverrides?: ProductCostOverride[];
  onUpdateProductCost?: (data: { productId: string; costs: { assembly_cost?: number | null; handling_cost?: number | null; purchase_cost?: number | null } }) => void;
  onResetProductCost?: (productId: string) => void;
}

interface ProductGroup {
  parent: ProductCostData;
  children: ProductCostData[];
}

function cleanName(name: string): string {
  return (name ?? '').replace(/^[\s↳└⦿L,\-–]+/, '').trim();
}

const fmt = (v: number) =>
  v == null ? '–' : v === 0 ? '0' : v.toLocaleString('sv-SE');

const getMarginColor = (pct: number) =>
  pct >= 50 ? 'text-green-600' : pct >= 30 ? 'text-yellow-600' : 'text-red-500';

// ── Inline editable cell ──
interface EditableCellProps {
  value: number;
  isOverridden: boolean;
  onSave: (newValue: number) => void;
  className?: string;
}

const EditableCell = ({ value, isOverridden, onSave, className }: EditableCellProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, value]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(draft.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-16 text-right text-xs border border-primary/40 rounded px-1 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        'cursor-pointer hover:bg-primary/10 rounded px-1 py-0.5 -mx-1 transition-colors',
        isOverridden && 'bg-primary/5 font-medium text-primary',
        className
      )}
      title={isOverridden ? 'Lokalt ändrad – klicka för att redigera' : 'Klicka för att redigera'}
    >
      {fmt(value)}
    </span>
  );
};

export const ProductCostsCard = ({
  productCosts,
  onRefresh,
  supplierInvoices = [],
  costOverrides = [],
  onUpdateProductCost,
  onResetProductCost,
}: ProductCostsCardProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overrideSet = useMemo(() => new Set(costOverrides.map(o => o.product_id)), [costOverrides]);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      toast.success('Produktkostnader uppdaterade');
    } catch {
      toast.error('Kunde inte uppdatera');
    } finally {
      setIsRefreshing(false);
    }
  };

  const groupedProducts = useMemo((): ProductGroup[] => {
    const parents = productCosts.products.filter(p => !p.parent_product_id);
    return parents.map(parent => ({
      parent,
      children: productCosts.products.filter(p => p.parent_product_id === parent.id),
    }));
  }, [productCosts.products]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (productCosts.products.length === 0) {
    return (
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Produktkostnader
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-muted-foreground text-sm">Inga produkter kopplade.</p>
        </CardContent>
      </Card>
    );
  }

  const calcTotalCost = (p: ProductCostData) =>
    (p.assembly_cost + p.handling_cost + p.purchase_cost) * p.quantity;

  const getLinkedInvoiceInfo = (productId: string) => {
    const linked = supplierInvoices.filter(
      si => si.linked_cost_type === 'product' && si.linked_cost_id === productId
    );
    if (linked.length === 0) return null;
    const invoicedTotal = linked.reduce((s, si) => s + (Number(si.invoice_data?.Total) || 0), 0);
    const isFinal = linked.some(si => si.is_final_link);
    return { invoicedTotal, isFinal };
  };

  const handleCostUpdate = (productId: string, field: 'assembly_cost' | 'handling_cost' | 'purchase_cost', newValue: number) => {
    if (!onUpdateProductCost) return;
    onUpdateProductCost({ productId, costs: { [field]: newValue } });
  };

  const renderCostCells = (product: ProductCostData, sizeClass: string) => {
    const isOverridden = overrideSet.has(product.id);
    const canEdit = !!onUpdateProductCost;

    if (canEdit) {
      return (
        <>
          <td className={`py-1.5 px-2 text-right ${sizeClass}`}>
            <EditableCell
              value={product.assembly_cost}
              isOverridden={isOverridden}
              onSave={v => handleCostUpdate(product.id, 'assembly_cost', v)}
            />
          </td>
          <td className={`py-1.5 px-2 text-right ${sizeClass}`}>
            <EditableCell
              value={product.handling_cost}
              isOverridden={isOverridden}
              onSave={v => handleCostUpdate(product.id, 'handling_cost', v)}
            />
          </td>
          <td className={`py-1.5 px-2 text-right ${sizeClass}`}>
            <EditableCell
              value={product.purchase_cost}
              isOverridden={isOverridden}
              onSave={v => handleCostUpdate(product.id, 'purchase_cost', v)}
            />
          </td>
        </>
      );
    }

    return (
      <>
        <td className={`py-1.5 px-2 text-right ${sizeClass} text-muted-foreground`}>{fmt(product.assembly_cost)}</td>
        <td className={`py-1.5 px-2 text-right ${sizeClass} text-muted-foreground`}>{fmt(product.handling_cost)}</td>
        <td className={`py-1.5 px-2 text-right ${sizeClass} text-muted-foreground`}>{fmt(product.purchase_cost)}</td>
      </>
    );
  };

  const renderChildRow = (product: ProductCostData) => {
    const rev = product.total;
    const cost = calcTotalCost(product);
    const pct = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0;
    const purchaseBudget = product.purchase_cost * product.quantity;
    const invoiceInfo = getLinkedInvoiceInfo(product.id);
    const isOverridden = overrideSet.has(product.id);

    return (
      <tr key={product.id} className="border-b border-border/20 bg-muted/10">
        <td className="py-1.5 pr-3 pl-6 text-xs text-muted-foreground">
          <span className="mr-1 opacity-50">└</span>
          {cleanName(product.product_name)}
          {isOverridden && onResetProductCost && (
            <button
              onClick={() => onResetProductCost(product.id)}
              className="ml-1 text-muted-foreground/60 hover:text-primary inline-flex items-center"
              title="Återställ till originalvärde"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{product.quantity}</td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{fmt(product.unit_price)}</td>
        <td className="py-1.5 px-2 text-right text-xs">
          <div className="flex flex-col items-end">
            <span>{fmt(rev)}</span>
            {product.discount > 0 && (
              <span className="text-[10px] text-muted-foreground">(-{product.discount}%)</span>
            )}
          </div>
        </td>
        {renderCostCells(product, 'text-xs')}
        <td className="py-1.5 px-2 text-right text-xs font-medium">{fmt(cost)}</td>
        <td className={`py-1.5 px-2 text-right text-xs font-semibold ${getMarginColor(pct)}`}>
          {rev > 0 ? `${pct}%` : <span className="text-muted-foreground">–</span>}
        </td>
        <td className="py-1.5 pl-2 text-right text-xs">
          {invoiceInfo ? (
            <div className="flex flex-col items-end">
              <span className="font-medium">{fmt(invoiceInfo.invoicedTotal)} kr</span>
              {(() => {
                const diff = purchaseBudget - invoiceInfo.invoicedTotal;
                return (
                  <span className={diff >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)} kr
                  </span>
                );
              })()}
              {invoiceInfo.isFinal && <span className="text-[10px] text-green-600">✓</span>}
            </div>
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </td>
      </tr>
    );
  };

  const renderGroupRows = (group: ProductGroup) => {
    const hasChildren = group.children.length > 0;
    const isExpanded = !collapsedGroups.has(group.parent.id);
    const groupRev = group.parent.total;
    const groupCost = calcTotalCost(group.parent);
    const groupPct = groupRev > 0 ? Math.round(((groupRev - groupCost) / groupRev) * 100) : 0;
    const purchaseBudget = group.parent.purchase_cost * group.parent.quantity;
    const invoiceInfo = getLinkedInvoiceInfo(group.parent.id);
    const isOverridden = overrideSet.has(group.parent.id);

    const parentRow = (
      <tr
        key={group.parent.id}
        className={`border-b border-border/40 ${hasChildren ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/20'}`}
      >
        <td
          className="py-2 pr-3"
          onClick={hasChildren ? () => toggleGroup(group.parent.id) : undefined}
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {hasChildren && (
              isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {!hasChildren && <span className="w-3.5 inline-block" />}
            {cleanName(group.parent.product_name)}
            {isOverridden && onResetProductCost && (
              <button
                onClick={(e) => { e.stopPropagation(); onResetProductCost(group.parent.id); }}
                className="ml-1 text-muted-foreground/60 hover:text-primary inline-flex items-center"
                title="Återställ till originalvärde"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </span>
        </td>
        <td className="py-2 px-2 text-right text-sm">{group.parent.quantity}</td>
        <td className="py-2 px-2 text-right text-sm">{fmt(group.parent.unit_price)}</td>
        <td className="py-2 px-2 text-right text-sm font-medium">
          <div className="flex flex-col items-end">
            <span>{fmt(groupRev)}</span>
            {group.parent.discount > 0 && (
              <span className="text-[10px] text-muted-foreground">(-{group.parent.discount}%)</span>
            )}
          </div>
        </td>
        {renderCostCells(group.parent, 'text-sm')}
        <td className="py-2 px-2 text-right text-sm font-medium">{fmt(groupCost)}</td>
        <td className={`py-2 px-2 text-right text-sm font-semibold ${getMarginColor(groupPct)}`}>
          {groupRev > 0 ? `${groupPct}%` : <span className="text-muted-foreground">–</span>}
        </td>
        <td className="py-2 pl-2 text-right text-sm">
          {invoiceInfo ? (
            <div className="flex flex-col items-end">
              <span className="font-medium">{fmt(invoiceInfo.invoicedTotal)} kr</span>
              {(() => {
                const diff = purchaseBudget - invoiceInfo.invoicedTotal;
                return (
                  <span className={`text-xs ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {diff >= 0 ? '+' : ''}{fmt(diff)} kr
                  </span>
                );
              })()}
              {invoiceInfo.isFinal && <span className="text-[10px] text-green-600">✓ Slutgiltig</span>}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">–</span>
          )}
        </td>
      </tr>
    );

    return [
      parentRow,
      ...(hasChildren && isExpanded ? group.children.map(renderChildRow) : [])
    ];
  };

  const { revenue, costs, margin } = productCosts.summary;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;

  const assemblyCostTotal = productCosts.products.reduce((s, p) => s + p.assembly_cost * p.quantity, 0);
  const handlingCostTotal = productCosts.products.reduce((s, p) => s + p.handling_cost * p.quantity, 0);
  const purchaseCostTotal = productCosts.products.reduce((s, p) => s + p.purchase_cost * p.quantity, 0);

  return (
    <Card>
      <CardHeader className="py-3 pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Produktkostnader
            {costOverrides.length > 0 && (
              <span className="text-xs font-normal text-primary ml-1">
                ({costOverrides.length} lokala ändringar)
              </span>
            )}
          </CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing} className="h-8 w-8">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">

        {/* KPI header */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-b pb-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Intäkter </span>
            <span className="font-bold">{fmt(revenue)} kr</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Kostnader </span>
            <span className="font-bold">{fmt(costs)} kr</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Marginal </span>
            <span className="font-bold">{fmt(margin)} kr</span>
          </div>
          <div className="text-sm ml-auto">
            <span className="text-muted-foreground">Marginal % </span>
            <span className={`font-bold ${getMarginColor(marginPct)}`}>{marginPct}%</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Produkt</th>
                <th className="text-right py-2 px-2 font-medium">Antal</th>
                <th className="text-right py-2 px-2 font-medium">Pris/st</th>
                <th className="text-right py-2 px-2 font-medium">Totalt</th>
                <th className="text-right py-2 px-2 font-medium">Montage/st</th>
                <th className="text-right py-2 px-2 font-medium">Lagerkostnad</th>
                <th className="text-right py-2 px-2 font-medium">Inköp/st</th>
                <th className="text-right py-2 px-2 font-medium">Kostn. totalt</th>
                <th className="text-right py-2 pl-2 font-medium">Marginal</th>
                <th className="text-right py-2 pl-2 font-medium">Lev.faktura</th>
              </tr>
            </thead>
            <tbody>
              {groupedProducts.flatMap(group => renderGroupRows(group))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 text-sm font-semibold">
                <td className="py-2.5 pr-3">Totalt</td>
                <td className="py-2.5 px-2" />
                <td className="py-2.5 px-2" />
                <td className="py-2.5 px-2 text-right">{fmt(revenue)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(assemblyCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(handlingCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(purchaseCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(costs)}</td>
                <td className={`py-2.5 pl-2 text-right ${getMarginColor(marginPct)}`}>{marginPct}%</td>
                <td className="py-2.5 pl-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
