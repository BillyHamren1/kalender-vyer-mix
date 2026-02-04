import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Save, X, Package } from 'lucide-react';
import { toast } from 'sonner';
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

export const ProductCostsCard = ({ productCosts, onUpdateCost, isLoading }: ProductCostsCardProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    labor_cost: number;
    material_cost: number;
    setup_hours: number;
    external_cost: number;
  }>({ labor_cost: 0, material_cost: 0, setup_hours: 0, external_cost: 0 });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
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

  if (productCosts.products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Produktkostnader
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Inga produkter kopplade till denna bokning.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Produktkostnader (Budgetunderlag)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Arbetskostnad</p>
            <p className="text-lg font-semibold">{formatCurrency(productCosts.laborCostTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Material</p>
            <p className="text-lg font-semibold">{formatCurrency(productCosts.materialCostTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Externa</p>
            <p className="text-lg font-semibold">{formatCurrency(productCosts.externalCostTotal)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Totalt</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(productCosts.totalProductCost)}</p>
          </div>
        </div>

        {/* Product table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Produkt</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead className="text-right">Arbete</TableHead>
                <TableHead className="text-right">Material</TableHead>
                <TableHead className="text-right">Externa</TableHead>
                <TableHead className="text-right">Totalt</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productCosts.products.map(product => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium truncate max-w-[200px]" title={product.name}>
                    {product.name}
                  </TableCell>
                  <TableCell className="text-right">{product.quantity}</TableCell>
                  
                  {editingId === product.id ? (
                    <>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={editValues.labor_cost}
                          onChange={(e) => setEditValues(prev => ({ ...prev, labor_cost: Number(e.target.value) }))}
                          className="w-24 text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={editValues.material_cost}
                          onChange={(e) => setEditValues(prev => ({ ...prev, material_cost: Number(e.target.value) }))}
                          className="w-24 text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={editValues.external_cost}
                          onChange={(e) => setEditValues(prev => ({ ...prev, external_cost: Number(e.target.value) }))}
                          className="w-24 text-right h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(editValues.labor_cost + editValues.material_cost + editValues.external_cost)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-right">{formatCurrency(product.laborCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.materialCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.externalCost)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(product.totalCost)}</TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleStartEdit(product)}
                          disabled={isLoading}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
