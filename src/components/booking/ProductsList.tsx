import { cleanProductName, groupProducts, type ProductGroup } from '../../../supabase/functions/_shared/operations-product-presentation';

import React, { useState } from 'react';
import { Package, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BookingProduct } from '@/types/booking';

interface ProductsListProps {
  products: BookingProduct[];
  showPricing?: boolean; // New prop to control pricing visibility
  embedded?: boolean;
  /** Paketmedlemmar per huvudrads-id; dolda som standard, tillbehören visas alltid. */
  packageMembers?: Record<string, BookingProduct[]>;
  /** Paketinnehållet öppnat från början. Standard: stängt. */
  defaultOpenMembers?: boolean;
}

const ProductItem = ({
  product,
  isAccessory: isAcc,
  isPackageMember = false,
  showPricing = true,
}: {
  product: BookingProduct;
  isAccessory?: boolean;
  isPackageMember?: boolean;
  showPricing?: boolean;
}) => {
  const hasNotes = product.notes &&
                  typeof product.notes === 'string' &&
                  product.notes.trim().length > 0;

  const indent = isPackageMember ? 'pl-8' : isAcc ? 'pl-4' : '';

  return (
    <div className={`py-2 ${indent} ${isAcc || isPackageMember ? 'text-muted-foreground' : ''}`}>
      <div className="flex justify-between">
        <span className={`text-sm flex items-center gap-1.5 ${isAcc || isPackageMember ? '' : 'font-medium'}`}>
          {isPackageMember && <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {isAcc && !isPackageMember && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {cleanProductName(product.name)}
        </span>
        <span className="text-xs text-muted-foreground">Antal: {product.quantity}</span>
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

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="pl-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
);

const ProductGroupItem = ({
  group,
  showPricing = true,
  members = [],
  defaultOpenMembers = false,
}: {
  group: ProductGroup;
  showPricing?: boolean;
  members?: BookingProduct[];
  defaultOpenMembers?: boolean;
}) => {
  const [membersOpen, setMembersOpen] = useState(defaultOpenMembers);
  const hasAccessories = group.accessories.length > 0;
  const hasMembers = members.length > 0;

  if (!hasAccessories && !hasMembers) {
    return (
      <div className="border-b border-border last:border-b-0">
        <ProductItem product={group.parent} showPricing={showPricing} />
      </div>
    );
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="py-2 flex items-center gap-2">
        <div className="flex-1 flex justify-between items-center">
          <span className="text-sm font-medium">{cleanProductName(group.parent.name)}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
              +{group.accessories.length + members.length}
            </span>
            <span className="text-xs text-muted-foreground">Antal: {group.parent.quantity}</span>
          </div>
        </div>
      </div>
      {showPricing && group.parent.unitPrice && (
        <p className="text-xs text-muted-foreground mt-0.5 pb-1">
          {group.parent.unitPrice.toLocaleString('sv-SE')} kr/st
          {group.parent.totalPrice && (
            <span className="font-medium text-foreground ml-2">
              = {group.parent.totalPrice.toLocaleString('sv-SE')} kr
            </span>
          )}
        </p>
      )}

      {hasMembers && (
        <Collapsible
          open={membersOpen}
          onOpenChange={setMembersOpen}
          className="pl-2 border-l-2 border-muted ml-2"
        >
          <CollapsibleTrigger
            data-testid="package-members-toggle"
            aria-label={`Visa paketinnehåll (${members.length} delar)`}
            className="w-full text-left hover:bg-muted/50 rounded transition-colors"
          >
            <div className="py-1.5 flex items-center gap-1.5">
              {membersOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Paketinnehåll
              </span>
              <span className="text-[11px] text-muted-foreground">({members.length})</span>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {membersOpen && (
              <div data-testid="package-members">
                {members.map((m) => (
                  <ProductItem key={m.id} product={m} isPackageMember showPricing={false} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {hasAccessories && (
        <div data-testid="package-accessories" className="pl-2 border-l-2 border-muted ml-2 mb-2">
          {hasMembers && <SectionLabel>Tillbehör</SectionLabel>}
          {group.accessories.map((accessory) => (
            <ProductItem key={accessory.id} product={accessory} isAccessory showPricing={showPricing} />
          ))}
        </div>
      )}
    </div>
  );
};

export const ProductsList = ({
  products,
  showPricing = true,
  embedded = false,
  packageMembers,
  defaultOpenMembers = false,
}: ProductsListProps) => {
  const hasProducts = products && products.length > 0;
  const groups = hasProducts ? groupProducts(products) : [];

  const content = (
    <>
        {hasProducts ? (
          <div>
            {groups.map((group) => (
              <ProductGroupItem
                key={group.parent.id}
                group={group}
                showPricing={showPricing}
                members={packageMembers?.[group.parent.id] ?? []}
                defaultOpenMembers={defaultOpenMembers}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            <p className="text-sm">Inga produkter tillagda</p>
          </div>
        )}
    </>
  );

  if (embedded) return content;

  return (
    <Card className="shadow-sm">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Package className="h-4 w-4" />
          <span>Produkter ({hasProducts ? products.length : 0})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {content}
      </CardContent>
    </Card>
  );
};
