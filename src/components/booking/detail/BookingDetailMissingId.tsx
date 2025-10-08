
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface BookingDetailMissingIdProps {
  onBack: () => void;
}

export const BookingDetailMissingId: React.FC<BookingDetailMissingIdProps> = ({
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
            <h1 className="text-lg font-semibold text-red-500">No Booking ID</h1>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-gray-700">No booking ID was provided in the URL.</p>
        <p className="mt-2 text-sm text-gray-500">Expected URL format: /booking/[booking-id]</p>
      </div>
    </div>
  );
};
