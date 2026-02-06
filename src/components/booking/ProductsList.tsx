
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
 * Clean product names by removing prefix characters used for hierarchy indication
 */
const cleanProductName = (name: string): string => {
  return name
    .replace(/^[└↳]\s*,?\s*/, '')
    .replace(/^L,\s*/, '')
    .replace(/^⦿\s*/, '')
    .replace(/^\s+/, '')
    .trim();
};

/**
 * Check if a product is a child (accessory or package component) based on DB fields or name prefix
 * This handles both new imports (with parent_product_id/parent_package_id/is_package_component)
 * and legacy data (with name prefixes)
 */
const isChildProduct = (product: BookingProduct): boolean => {
  if (product.parentProductId) return true;
  if (product.parentPackageId) return true;
  if (product.isPackageComponent) return true;
  // Fallback to name-based detection for legacy data
  const name = product.name || '';
  return name.startsWith('└') || 
         name.startsWith('↳') || 
         name.startsWith('L,') || 
         name.startsWith('└,') ||
         name.startsWith('  ↳') ||
         name.startsWith('  └') ||
         name.startsWith('⦿');
};

/**
 * Group products by parent-child relationship
 * Uses parent_product_id and parent_package_id when available,
 * falls back to sequential name-based grouping for legacy data
 */
const groupProducts = (products: BookingProduct[]): ProductGroup[] => {
  const groups: ProductGroup[] = [];
  const childProducts = products.filter(p => isChildProduct(p));
  
  // Build child maps by both parent_product_id AND parent_package_id
  const childrenByParentId = new Map<string, BookingProduct[]>();
  
  for (const child of childProducts) {
    const parentId = child.parentProductId || child.parentPackageId;
    if (parentId) {
      const existing = childrenByParentId.get(parentId) || [];
      existing.push(child);
      childrenByParentId.set(parentId, existing);
    }
  }
  
  // Iterate sequentially to group products
  let currentParent: BookingProduct | null = null;
  let currentSequentialChildren: BookingProduct[] = [];
  
  for (const product of products) {
    if (!isChildProduct(product)) {
      // Save previous group
      if (currentParent) {
        const idChildren = childrenByParentId.get(currentParent.id) || [];
        const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(a => [a.id, a])).values()];
        groups.push({ parent: currentParent, accessories: merged });
      }
      currentParent = product;
      currentSequentialChildren = [];
    } else {
      // Only add to sequential group if it doesn't have an ID-based parent link
      if (!product.parentProductId && !product.parentPackageId) {
        currentSequentialChildren.push(product);
      }
    }
  }
  
  // Don't forget the last group
  if (currentParent) {
    const idChildren = childrenByParentId.get(currentParent.id) || [];
    const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(a => [a.id, a])).values()];
    groups.push({ parent: currentParent, accessories: merged });
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
        <span className={`text-sm ${isAcc ? '' : 'font-medium'}`}>{cleanProductName(product.name)}</span>
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
            <span className="text-sm font-medium">{cleanProductName(group.parent.name)}</span>
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
