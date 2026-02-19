import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import type { ProductCostData, ProductCostSummary } from '@/services/productCostService';

interface ProductCostsCardProps {
  productCosts: ProductCostSummary;
  onUpdateCost: (productId: string, costs: {
    labor_cost?: number;
    material_cost?: number;
    setup_hours?: number;
    external_cost?: number;
    cost_notes?: string | null;
  }) => Promise<void>;
  isLoading?: boolean;
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

export const ProductCostsCard = ({ productCosts }: ProductCostsCardProps) => {
  const groupedProducts = useMemo((): ProductGroup[] => {
    const parents = productCosts.products.filter(p => !p.parentProductId);
    return parents.map(parent => ({
      parent,
      children: productCosts.products.filter(p => p.parentProductId === parent.id),
    }));
  }, [productCosts.products]);

  // Empty set = all groups expanded by default; add ID to collapse
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

  const renderChildRow = (product: ProductCostData) => {
    const rev = product.totalRevenue;
    const cost = product.totalCost;
    const pct = rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0;
    return (
      <tr key={product.id} className="border-b border-border/20 bg-muted/10">
        <td className="py-1.5 pr-3 pl-6 text-xs text-muted-foreground">
          <span className="mr-1 opacity-50">└</span>
          {cleanName(product.name)}
        </td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{product.quantity}</td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{fmt(product.unitPrice)}</td>
        <td className="py-1.5 px-2 text-right text-xs">{fmt(rev)}</td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{fmt(product.assemblyCost)}</td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{fmt(product.handlingCost)}</td>
        <td className="py-1.5 px-2 text-right text-xs text-muted-foreground">{fmt(product.purchaseCost)}</td>
        <td className="py-1.5 px-2 text-right text-xs font-medium">{fmt(cost)}</td>
        <td className={`py-1.5 pl-2 text-right text-xs font-semibold ${getMarginColor(pct)}`}>
          {rev > 0 ? `${pct}%` : <span className="text-muted-foreground">–</span>}
        </td>
      </tr>
    );
  };

  const renderGroupRows = (group: ProductGroup) => {
    const hasChildren = group.children.length > 0;
    const isExpanded = !collapsedGroups.has(group.parent.id);
    const groupRev = group.parent.totalRevenue;
    const groupCost = group.parent.totalCost;
    const groupPct = groupRev > 0 ? Math.round(((groupRev - groupCost) / groupRev) * 100) : 0;
    const groupAssembly = group.parent.assemblyCost;
    const groupHandling = group.parent.handlingCost;
    const groupPurchase = group.parent.purchaseCost;

    const parentRow = (
      <tr
        key={group.parent.id}
        className={`border-b border-border/40 ${hasChildren ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/20'}`}
        onClick={hasChildren ? () => toggleGroup(group.parent.id) : undefined}
      >
        <td className="py-2 pr-3">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {hasChildren && (
              isExpanded
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {!hasChildren && <span className="w-3.5 inline-block" />}
            {cleanName(group.parent.name)}
          </span>
        </td>
        <td className="py-2 px-2 text-right text-sm">{group.parent.quantity}</td>
        <td className="py-2 px-2 text-right text-sm">{fmt(group.parent.unitPrice)}</td>
        <td className="py-2 px-2 text-right text-sm font-medium">{fmt(groupRev)}</td>
        <td className="py-2 px-2 text-right text-sm">{fmt(groupAssembly)}</td>
        <td className="py-2 px-2 text-right text-sm">{fmt(groupHandling)}</td>
        <td className="py-2 px-2 text-right text-sm">{fmt(groupPurchase)}</td>
        <td className="py-2 px-2 text-right text-sm font-medium">{fmt(groupCost)}</td>
        <td className={`py-2 pl-2 text-right text-sm font-semibold ${getMarginColor(groupPct)}`}>
          {groupRev > 0 ? `${groupPct}%` : <span className="text-muted-foreground">–</span>}
        </td>
      </tr>
    );

    return [
      parentRow,
      ...(hasChildren && isExpanded ? group.children.map(renderChildRow) : [])
    ];
  };

  const { totalRevenue, assemblyCostTotal, handlingCostTotal, purchaseCostTotal, totalProductCost, marginPct } = productCosts;
  const grossMargin = totalRevenue - totalProductCost;

  return (
    <Card>
      <CardHeader className="py-3 pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Produktkostnader
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-3">

        {/* KPI header — matches bild 2 */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-1 border-b pb-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Intäkter </span>
            <span className="font-bold">{fmt(totalRevenue)} kr</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Kostnader </span>
            <span className="font-bold">{fmt(totalProductCost)} kr</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Marginal </span>
            <span className="font-bold">{fmt(grossMargin)} kr</span>
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
                <td className="py-2.5 px-2 text-right">{fmt(totalRevenue)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(assemblyCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(handlingCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(purchaseCostTotal)}</td>
                <td className="py-2.5 px-2 text-right">{fmt(totalProductCost)}</td>
                <td className={`py-2.5 pl-2 text-right ${getMarginColor(marginPct)}`}>{marginPct}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
