
import React, { useState } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BookingProduct } from '@/types/booking';

interface ProductsListProps {
  products: BookingProduct[];
  showPricing?: boolean; // New prop to control pricing visibility
}

interface ProductGroup {
  parent: BookingProduct;
  accessories: BookingProduct[];
}

/**
 * Check if a product is an accessory based on parent_product_id or name prefix
 * This handles both new imports (with parent_product_id) and legacy data (with name prefixes)
 */
const isAccessory = (product: BookingProduct): boolean => {
  // If parent_product_id exists, it's definitely an accessory
  if (product.parentProductId) {
    return true;
  }
  // Fallback to name-based detection for legacy data
  const name = product.name || '';
  return name.startsWith('└') || 
         name.startsWith('↳') || 
         name.startsWith('L,') || 
         name.startsWith('└,') ||
         name.startsWith('  ↳') ||
         name.startsWith('  └');
};

/**
 * Group products by parent-child relationship
 * Uses parent_product_id when available, falls back to sequential name-based grouping
 */
const groupProducts = (products: BookingProduct[]): ProductGroup[] => {
  const groups: ProductGroup[] = [];
  
  // First, try to group by parent_product_id
  const parentProducts = products.filter(p => !isAccessory(p));
  const accessoryProducts = products.filter(p => isAccessory(p));
  
  // Create a map of parent ID to accessories
  const accessoriesByParentId = new Map<string, BookingProduct[]>();
  
  for (const accessory of accessoryProducts) {
    if (accessory.parentProductId) {
      const existing = accessoriesByParentId.get(accessory.parentProductId) || [];
      existing.push(accessory);
      accessoriesByParentId.set(accessory.parentProductId, existing);
    }
  }
  
  // Group products - first handle those with proper parent_product_id relationships
  let currentParent: BookingProduct | null = null;
  let currentAccessories: BookingProduct[] = [];
  
  for (const product of products) {
    if (!isAccessory(product)) {
      // This is a parent product
      // Save the previous group if exists
      if (currentParent) {
        // Merge accessories from parent_product_id and sequential grouping
        const idBasedAccessories = accessoriesByParentId.get(currentParent.id) || [];
        const mergedAccessories = [...new Map([...idBasedAccessories, ...currentAccessories].map(a => [a.id, a])).values()];
        groups.push({ parent: currentParent, accessories: mergedAccessories });
      }
      // Start new group
      currentParent = product;
      currentAccessories = [];
    } else {
      // This is an accessory
      // Only add to sequential group if it doesn't have a parent_product_id
      // (those with parent_product_id are handled via the map)
      if (!product.parentProductId) {
        currentAccessories.push(product);
      }
    }
  }
  
  // Don't forget the last group
  if (currentParent) {
    const idBasedAccessories = accessoriesByParentId.get(currentParent.id) || [];
    const mergedAccessories = [...new Map([...idBasedAccessories, ...currentAccessories].map(a => [a.id, a])).values()];
    groups.push({ parent: currentParent, accessories: mergedAccessories });
  }
  
  return groups;
};

const ProductItem = ({ product, isAccessory: isAcc, showPricing = true }: { product: BookingProduct; isAccessory?: boolean; showPricing?: boolean }) => {
  const hasNotes = product.notes && 
                  typeof product.notes === 'string' && 
                  product.notes.trim().length > 0;

  return (
    <div className={`py-2 ${isAcc ? 'pl-4 text-muted-foreground' : ''}`}>
      <div className="flex justify-between">
        <span className={`text-sm ${isAcc ? '' : 'font-medium'}`}>{product.name}</span>
        <span className="text-xs text-muted-foreground">Qty: {product.quantity}</span>
      </div>
      {showPricing && product.unitPrice && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {product.unitPrice.toLocaleString('sv-SE')} kr/st
          {product.totalPrice && (
            <span className="font-medium text-foreground ml-2">
              = {product.totalPrice.toLocaleString('sv-SE')} kr
            </span>
          )}
        </p>
      )}
      {hasNotes && (
        <p className="text-xs text-muted-foreground mt-0.5">{product.notes}</p>
      )}
    </div>
  );
};

const ProductGroupItem = ({ group, showPricing = true }: { group: ProductGroup; showPricing?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAccessories = group.accessories.length > 0;

  if (!hasAccessories) {
    return (
      <div className="border-b border-border last:border-b-0">
        <ProductItem product={group.parent} showPricing={showPricing} />
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-border last:border-b-0">
      <CollapsibleTrigger className="w-full text-left hover:bg-muted/50 rounded transition-colors">
        <div className="py-2 flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 flex justify-between items-center">
            <span className="text-sm font-medium">{group.parent.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                +{group.accessories.length}
              </span>
              <span className="text-xs text-muted-foreground">Qty: {group.parent.quantity}</span>
            </div>
          </div>
        </div>
        {showPricing && group.parent.unitPrice && (
          <p className="text-xs text-muted-foreground mt-0.5 pl-6 pb-1">
            {group.parent.unitPrice.toLocaleString('sv-SE')} kr/st
            {group.parent.totalPrice && (
              <span className="font-medium text-foreground ml-2">
                = {group.parent.totalPrice.toLocaleString('sv-SE')} kr
              </span>
            )}
          </p>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-2 border-l-2 border-muted ml-2 mb-2">
          {group.accessories.map((accessory) => (
            <ProductItem key={accessory.id} product={accessory} isAccessory showPricing={showPricing} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const ProductsList = ({ products, showPricing = true }: ProductsListProps) => {
  const hasProducts = products && products.length > 0;
  const groups = hasProducts ? groupProducts(products) : [];

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Package className="h-4 w-4" />
          <span>Products ({hasProducts ? products.length : 0})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {hasProducts ? (
          <div>
            {groups.map((group) => (
              <ProductGroupItem key={group.parent.id} group={group} showPricing={showPricing} />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">No products added yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
