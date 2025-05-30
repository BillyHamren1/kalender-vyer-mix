
import React from 'react';
import { Package } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { BookingProduct } from '@/types/booking';

interface ProductsListProps {
  products: BookingProduct[];
}

export const ProductsList = ({ products }: ProductsListProps) => {
  console.log('ProductsList received products:', products);
  
  const hasProducts = products && products.length > 0;

  return (
    <Card className="shadow-sm h-full flex flex-col">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Package className="h-4 w-4" />
          <span>Products ({hasProducts ? products.length : 0})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 flex-1">
        {hasProducts ? (
          <ul className="divide-y divide-gray-100">
            {products.map(product => {
              console.log('Rendering product:', product);
              
              // Handle notes more robustly - check if it's a string or actually undefined/null
              const hasNotes = product.notes && 
                              typeof product.notes === 'string' && 
                              product.notes.trim().length > 0;
              
              return (
                <li key={product.id} className="py-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{product.name}</span>
                    <span className="text-xs text-gray-600">Qty: {product.quantity}</span>
                  </div>
                  {hasNotes && (
                    <p className="text-xs text-gray-500 mt-0.5">{product.notes}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p className="text-sm text-center">No products added yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
