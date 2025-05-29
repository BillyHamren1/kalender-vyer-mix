
import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import StatusChangeForm from '@/components/booking/StatusChangeForm';

interface BookingDetailHeaderProps {
  bookingNumber?: string;
  client?: string;
  status?: string;
  bookingId: string;
  isSaving: boolean;
  onBack: () => void;
  onStatusChange: (status: string) => void;
}

export const BookingDetailHeader: React.FC<BookingDetailHeaderProps> = ({
  bookingNumber,
  client,
  status,
  bookingId,
  isSaving,
  onBack,
  onStatusChange
}) => {
  return (
    <div className="border-b bg-white px-4 py-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {bookingNumber || 'No booking number'}
            </h1>
            <div className="flex items-center gap-2 mt-0">
              <p className="text-sm font-bold text-gray-900">{client}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <StatusChangeForm
              currentStatus={status}
              bookingId={bookingId}
              onStatusChange={onStatusChange}
              disabled={isSaving}
            />
          )}
        </div>
      </div>
    </div>
  );
};
