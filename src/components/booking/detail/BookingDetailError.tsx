
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface BookingDetailErrorProps {
  error?: string;
  bookingId?: string;
  onBack: () => void;
  onRetry: () => void;
}

export const BookingDetailError: React.FC<BookingDetailErrorProps> = ({
  error,
  bookingId,
  onBack,
  onRetry
}) => {
  if (!error) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-lg font-semibold text-red-500">Error Loading Booking</h1>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-gray-700">{error}</p>
        {bookingId && <p className="mt-2">Booking ID: {bookingId}</p>}
        <Button 
          onClick={onRetry} 
          className="mt-3"
          variant="outline"
          size="sm"
        >
          Try Again
        </Button>
      </div>
    </div>
  );
};
