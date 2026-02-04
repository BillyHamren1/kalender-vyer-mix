import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Save, X, Package, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

const isAccessory = (name: string): boolean => {
  return name.startsWith('└') || 
         name.startsWith('↳') || 
         name.startsWith('L,') || 
         name.startsWith('└,') ||
         name.startsWith('  ↳') ||
         name.startsWith('  └') ||
         name.startsWith('⦿');
};

const cleanName = (name: string): string => {
  return name.replace(/^[↳└⦿\s,L]+/, '').trim();
};

export const ProductCostsCard = ({ productCosts, onUpdateCost, isLoading }: ProductCostsCardProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<{
    labor_cost: number;
    material_cost: number;
    setup_hours: number;
    external_cost: number;
  }>({ labor_cost: 0, material_cost: 0, setup_hours: 0, external_cost: 0 });

  // Group products by parent/child relationship
  const groupedProducts = useMemo((): ProductGroup[] => {
    const groups: ProductGroup[] = [];
    let currentGroup: ProductGroup | null = null;

    for (const product of productCosts.products) {
      if (!isAccessory(product.name)) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { parent: product, children: [] };
      } else if (currentGroup) {
        currentGroup.children.push(product);
      }
    }
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [productCosts.products]);

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString('sv-SE')} kr`;
  };

  const handleStartEdit = (product: ProductCostData) => {
    setEditingId(product.id);
    setEditValues({
      labor_cost: product.laborCost,
      material_cost: product.materialCost,
      setup_hours: product.setupHours,
      external_cost: product.externalCost
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({ labor_cost: 0, material_cost: 0, setup_hours: 0, external_cost: 0 });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await onUpdateCost(editingId, editValues);
      toast.success('Kostnad uppdaterad');
      setEditingId(null);
    } catch {
      toast.error('Kunde inte uppdatera kostnad');
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const calculateGroupTotal = (group: ProductGroup): number => {
    const parentTotal = group.parent.totalCost;
    const childrenTotal = group.children.reduce((sum, c) => sum + c.totalCost, 0);
    return parentTotal + childrenTotal;
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

  const renderProductRow = (product: ProductCostData, isChild: boolean = false) => {
    const isEditing = editingId === product.id;
    
    if (isEditing) {
      return (
        <div key={product.id} className={`flex items-center gap-2 py-1 ${isChild ? 'pl-4 text-xs' : 'text-sm'}`}>
          <span className="flex-1 truncate text-muted-foreground">{cleanName(product.name)}</span>
          <Input
            type="number"
            value={editValues.labor_cost}
            onChange={(e) => setEditValues(prev => ({ ...prev, labor_cost: Number(e.target.value) }))}
            className="w-16 h-6 text-xs text-right"
            placeholder="Arb"
          />
          <Input
            type="number"
            value={editValues.material_cost}
            onChange={(e) => setEditValues(prev => ({ ...prev, material_cost: Number(e.target.value) }))}
            className="w-16 h-6 text-xs text-right"
            placeholder="Mat"
          />
          <Input
            type="number"
            value={editValues.external_cost}
            onChange={(e) => setEditValues(prev => ({ ...prev, external_cost: Number(e.target.value) }))}
            className="w-16 h-6 text-xs text-right"
            placeholder="Ext"
          />
          <span className="w-16 text-right text-xs font-medium">
            {formatCurrency(editValues.labor_cost + editValues.material_cost + editValues.external_cost)}
          </span>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleSave}>
            <Save className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleCancelEdit}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <div key={product.id} className={`flex items-center gap-2 py-0.5 ${isChild ? 'pl-4 text-xs text-muted-foreground' : 'text-xs'}`}>
        <span className="w-6 text-right text-muted-foreground">{product.quantity}×</span>
        <span className="flex-1 truncate" title={product.name}>{cleanName(product.name)}</span>
        <span className="w-14 text-right text-muted-foreground">{formatCurrency(product.laborCost)}</span>
        <span className="w-14 text-right text-muted-foreground">{formatCurrency(product.materialCost)}</span>
        <span className="w-14 text-right text-muted-foreground">{formatCurrency(product.externalCost)}</span>
        <span className="w-14 text-right font-medium">{formatCurrency(product.totalCost)}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 opacity-50 hover:opacity-100"
          onClick={() => handleStartEdit(product)}
          disabled={isLoading}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          Produktkostnader
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Summary row */}
        <div className="grid grid-cols-4 gap-2 p-2 bg-muted/50 rounded text-center text-xs">
          <div>
            <span className="text-muted-foreground">Arbete</span>
            <p className="font-semibold">{formatCurrency(productCosts.laborCostTotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Material</span>
            <p className="font-semibold">{formatCurrency(productCosts.materialCostTotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Externa</span>
            <p className="font-semibold">{formatCurrency(productCosts.externalCostTotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Totalt</span>
            <p className="font-bold text-primary">{formatCurrency(productCosts.totalProductCost)}</p>
          </div>
        </div>

        {/* Header row */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground border-b pb-1">
          <span className="w-6"></span>
          <span className="flex-1">Produkt</span>
          <span className="w-14 text-right">Arbete</span>
          <span className="w-14 text-right">Material</span>
          <span className="w-14 text-right">Externa</span>
          <span className="w-14 text-right">Totalt</span>
          <span className="w-5"></span>
        </div>

        {/* Grouped products */}
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {groupedProducts.map(group => {
            const hasChildren = group.children.length > 0;
            const isExpanded = expandedGroups.has(group.parent.id);
            const groupTotal = calculateGroupTotal(group);

            if (!hasChildren) {
              return renderProductRow(group.parent, false);
            }

            return (
              <Collapsible 
                key={group.parent.id} 
                open={isExpanded} 
                onOpenChange={() => toggleGroup(group.parent.id)}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center gap-2 py-1 hover:bg-muted/50 rounded text-xs">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="w-5 text-right text-muted-foreground">{group.parent.quantity}×</span>
                    <span className="flex-1 text-left font-medium truncate">{cleanName(group.parent.name)}</span>
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                      +{group.children.length}
                    </span>
                    <span className="w-14 text-right font-semibold">{formatCurrency(groupTotal)}</span>
                    <span className="w-5"></span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="ml-3 border-l border-muted pl-2 space-y-0">
                    {/* Parent product details */}
                    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
                      <span className="w-6"></span>
                      <span className="flex-1 italic">Huvudprodukt</span>
                      <span className="w-14 text-right">{formatCurrency(group.parent.laborCost)}</span>
                      <span className="w-14 text-right">{formatCurrency(group.parent.materialCost)}</span>
                      <span className="w-14 text-right">{formatCurrency(group.parent.externalCost)}</span>
                      <span className="w-14 text-right">{formatCurrency(group.parent.totalCost)}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 opacity-50 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); handleStartEdit(group.parent); }}
                        disabled={isLoading}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Children */}
                    {group.children.map(child => renderProductRow(child, true))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
