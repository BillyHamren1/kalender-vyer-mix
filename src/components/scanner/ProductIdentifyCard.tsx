import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Package, MapPin, Tag, CalendarDays } from 'lucide-react';

interface ProductIdentifyResult {
  found: boolean;
  name?: string;
  sku?: string;
  status?: string;
  currentBooking?: string;
  client?: string;
  location?: string;
  error?: string;
}

interface ProductIdentifyCardProps {
  result: ProductIdentifyResult;
  onClose: () => void;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-green-100 text-green-800' },
  allocated: { label: 'Allocated', className: 'bg-blue-100 text-blue-800' },
  reserved: { label: 'Reserved', className: 'bg-amber-100 text-amber-800' },
  damaged: { label: 'Damaged', className: 'bg-red-100 text-red-800' },
  local_match: { label: 'Local match', className: 'bg-muted text-muted-foreground' },
};

export const ProductIdentifyCard: React.FC<ProductIdentifyCardProps> = ({ result, onClose }) => {
  const statusInfo = statusLabels[result.status || ''] || {
    label: result.status || 'Unknown',
    className: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md animate-in slide-in-from-bottom-4 duration-200">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-base">Product info</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2 -mt-1" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {result.name && (
            <p className="font-medium text-sm mb-2">{result.name}</p>
          )}

          <div className="space-y-1.5 text-sm">
            {result.sku && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Tag className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-mono text-xs">{result.sku}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
            </div>

            {result.currentBooking && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Booking: {result.currentBooking}{result.client ? ` (${result.client})` : ''}</span>
              </div>
            )}

            {result.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span>{result.location}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
