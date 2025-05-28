
import React from 'react';
import { Package } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { BookingProduct } from '@/types/booking';

interface ProductsListProps {
  products: BookingProduct[];
}

export const ProductsList = ({ products }: ProductsListProps) => {
  console.log('ProductsList received products:', products);
  
  if (!products || products.length === 0) {
    console.log('No products to display');
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <span>Products ({products.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {products.map(product => {
            console.log('Rendering product:', product);
            return (
              <li key={product.id} className="py-3">
                <div className="flex justify-between">
                  <span className="font-medium">{product.name}</span>
                  <span className="text-gray-600">Qty: {product.quantity}</span>
                </div>
                {product.notes && (
                  <p className="text-sm text-gray-500 mt-1">{product.notes}</p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};
