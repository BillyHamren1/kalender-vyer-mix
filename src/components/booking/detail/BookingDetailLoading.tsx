
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface BookingDetailLoadingProps {
  onBack: () => void;
}

export const BookingDetailLoading: React.FC<BookingDetailLoadingProps> = ({
  onBack
}) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold">Loading booking details...</h1>
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  );
};
