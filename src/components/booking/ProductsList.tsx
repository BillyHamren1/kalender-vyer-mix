
import React, { useState } from 'react';
import { Package, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BookingProduct } from '@/types/booking';

interface ProductsListProps {
  products: BookingProduct[];
}

interface ProductGroup {
  parent: BookingProduct;
  accessories: BookingProduct[];
}

const isAccessory = (name: string): boolean => {
  return name.startsWith('└') || name.startsWith('L,') || name.startsWith('└,');
};

const groupProducts = (products: BookingProduct[]): ProductGroup[] => {
  const groups: ProductGroup[] = [];
  let currentParent: BookingProduct | null = null;
  let currentAccessories: BookingProduct[] = [];

  products.forEach((product) => {
    if (isAccessory(product.name)) {
      // This is an accessory, add to current group
      currentAccessories.push(product);
    } else {
      // This is a parent product
      // First, save the previous group if exists
      if (currentParent) {
        groups.push({ parent: currentParent, accessories: currentAccessories });
      }
      // Start new group
      currentParent = product;
      currentAccessories = [];
    }
  });

  // Don't forget the last group
  if (currentParent) {
    groups.push({ parent: currentParent, accessories: currentAccessories });
  }

  return groups;
};

const ProductItem = ({ product, isAccessory: isAcc }: { product: BookingProduct; isAccessory?: boolean }) => {
  const hasNotes = product.notes && 
                  typeof product.notes === 'string' && 
                  product.notes.trim().length > 0;

  return (
    <div className={`py-2 ${isAcc ? 'pl-4 text-muted-foreground' : ''}`}>
      <div className="flex justify-between">
        <span className={`text-sm ${isAcc ? '' : 'font-medium'}`}>{product.name}</span>
        <span className="text-xs text-muted-foreground">Qty: {product.quantity}</span>
      </div>
      {product.unitPrice && (
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

const ProductGroupItem = ({ group }: { group: ProductGroup }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasAccessories = group.accessories.length > 0;

  if (!hasAccessories) {
    return (
      <div className="border-b border-border last:border-b-0">
        <ProductItem product={group.parent} />
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
        {group.parent.unitPrice && (
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
            <ProductItem key={accessory.id} product={accessory} isAccessory />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const ProductsList = ({ products }: ProductsListProps) => {
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
              <ProductGroupItem key={group.parent.id} group={group} />
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
