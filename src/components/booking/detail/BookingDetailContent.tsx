
import React from 'react';
import { Button } from '@/components/ui/button';
import { Booking } from '@/types/booking';
import { ProductsList } from '@/components/booking/ProductsList';
import { EventInformationCard } from '@/components/booking/EventInformationCard';
import { DeliveryInformationCard } from '@/components/booking/DeliveryInformationCard';
import { LogisticsOptionsForm } from '@/components/booking/LogisticsOptionsForm';
import { AttachmentsList } from '@/components/booking/AttachmentsList';
import { InternalNotes } from '@/components/booking/InternalNotes';

interface BookingDetailContentProps {
  booking: Booking;
  bookingId: string;
  rigDates: string[];
  eventDates: string[];
  rigDownDates: string[];
  isSaving: boolean;
  autoSync: boolean;
  lastViewedDate?: Date;
  onAddDate: (type: string, date: string) => void;
  onRemoveDate: (type: string, date: string) => void;
  onDeliveryDetailsChange: (deliveryData: any) => Promise<void>;
  onLogisticsChange: (logisticsData: any) => Promise<void>;
  onReloadData: () => void;
}

export const BookingDetailContent: React.FC<BookingDetailContentProps> = ({
  booking,
  bookingId,
  rigDates,
  eventDates,
  rigDownDates,
  isSaving,
  autoSync,
  lastViewedDate,
  onAddDate,
  onRemoveDate,
  onDeliveryDetailsChange,
  onLogisticsChange,
  onReloadData
}) => {
  if (!booking) {
    return (
      <div className="p-3">
        <div className="text-center py-8">
          <p className="text-gray-500 text-sm">No booking data available.</p>
          <Button 
            onClick={onReloadData} 
            className="mt-2"
            variant="outline"
            size="sm"
          >
            Reload Booking Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-3">
      {/* Three equal cards in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
        {/* Products Card */}
        {booking.products && booking.products.length > 0 && (
          <div className="h-full">
            <ProductsList products={booking.products} />
          </div>
        )}
        
        {/* Event Information Card */}
        <div className="h-full">
          <EventInformationCard
            rigDates={rigDates}
            eventDates={eventDates}
            rigDownDates={rigDownDates}
            onAddDate={onAddDate}
            onRemoveDate={onRemoveDate}
            autoSync={autoSync}
          />
        </div>
        
        {/* Delivery Information Card */}
        <div className="h-full">
          <DeliveryInformationCard
            contactName={booking.contactName}
            contactPhone={booking.contactPhone}
            contactEmail={booking.contactEmail}
            initialAddress={booking.deliveryAddress || ''}
            initialCity={booking.deliveryCity || ''}
            initialPostalCode={booking.deliveryPostalCode || ''}
            deliveryLatitude={booking.deliveryLatitude}
            deliveryLongitude={booking.deliveryLongitude}
            bookingId={bookingId}
            isSaving={isSaving}
            onSave={onDeliveryDetailsChange}
          />
        </div>
      </div>

      {/* Full width sections */}
      <div className="space-y-2">
        {/* Logistics Options - now full width */}
        <LogisticsOptionsForm
          initialCarryMoreThan10m={booking.carryMoreThan10m || false}
          initialGroundNailsAllowed={booking.groundNailsAllowed || false}
          initialExactTimeNeeded={booking.exactTimeNeeded || false}
          initialExactTimeInfo={booking.exactTimeInfo || ''}
          isSaving={isSaving}
          onSave={onLogisticsChange}
        />

        {/* Display Attachments */}
        {booking.attachments && booking.attachments.length > 0 && (
          <AttachmentsList attachments={booking.attachments} />
        )}

        <InternalNotes notes={booking.internalNotes || ''} />

        {lastViewedDate && (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <p className="text-blue-700">
              You came from calendar view on: {lastViewedDate.toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
