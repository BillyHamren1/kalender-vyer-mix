
import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { useBookingDetail } from '@/hooks/useBookingDetail';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Import refactored components
import { ClientInformation } from '@/components/booking/ClientInformation';
import { DeliveryAddressForm } from '@/components/booking/DeliveryAddressForm';
import { LogisticsOptionsForm } from '@/components/booking/LogisticsOptionsForm';
import { ScheduleCard } from '@/components/booking/ScheduleCard';
import { ProductsList } from '@/components/booking/ProductsList';
import { AttachmentsList } from '@/components/booking/AttachmentsList';
import { InternalNotes } from '@/components/booking/InternalNotes';

const BookingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  const [autoSync, setAutoSync] = useState(false);
  
  // Use our custom hook for booking details
  const {
    booking,
    isLoading,
    error,
    isSaving,
    isSyncingToCalendar,
    rigDates,
    eventDates,
    rigDownDates,
    loadBookingData,
    handleDateChange,
    handleLogisticsChange,
    handleDeliveryDetailsChange,
    syncWithCalendar,
    setBooking,
    addDate,
    removeDate
  } = useBookingDetail(id);
  
  useEffect(() => {
    loadBookingData();
  }, [id]);
  
  const handleBack = () => {
    if (lastPath) {
      navigate(lastPath);
    } else {
      navigate('/resource-view');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Loading booking details...</h1>
            <button 
              onClick={handleBack}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Back to Calendar
            </button>
          </div>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-red-500">Error Loading Booking</h1>
            <button 
              onClick={handleBack}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Back to Calendar
            </button>
          </div>
          <p className="text-gray-700">{error}</p>
          <p className="mt-4">Booking ID: {id}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <h1 className="text-2xl font-bold">Booking Details: #{id}</h1>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={syncWithCalendar}
              disabled={isSyncingToCalendar || !booking}
              className="whitespace-nowrap"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSyncingToCalendar ? 'Saving...' : 'Save to Calendar'}
            </Button>
            <Button 
              onClick={handleBack}
              className="whitespace-nowrap"
            >
              Back to Calendar
            </Button>
          </div>
        </div>
        
        {booking ? (
          <div className="space-y-6">
            {/* Client Information */}
            <ClientInformation client={booking.client} />

            {/* Delivery Address */}
            <DeliveryAddressForm
              initialAddress={booking.deliveryAddress || ''}
              initialCity={booking.deliveryCity || ''}
              initialPostalCode={booking.deliveryPostalCode || ''}
              deliveryLatitude={booking.deliveryLatitude}
              deliveryLongitude={booking.deliveryLongitude}
              isSaving={isSaving}
              onSave={handleDeliveryDetailsChange}
            />

            {/* Logistics Options */}
            <LogisticsOptionsForm
              initialCarryMoreThan10m={booking.carryMoreThan10m || false}
              initialGroundNailsAllowed={booking.groundNailsAllowed || false}
              initialExactTimeNeeded={booking.exactTimeNeeded || false}
              initialExactTimeInfo={booking.exactTimeInfo || ''}
              isSaving={isSaving}
              onSave={handleLogisticsChange}
            />

            {/* Schedule */}
            <ScheduleCard
              rigDates={rigDates}
              eventDates={eventDates}
              rigDownDates={rigDownDates}
              autoSync={autoSync}
              onAutoSyncChange={setAutoSync}
              onAddDate={addDate}
              onRemoveDate={removeDate}
            />

            {/* Internal Notes */}
            <InternalNotes notes={booking.internalNotes || ''} />

            {/* Products list */}
            {booking.products && booking.products.length > 0 && (
              <ProductsList products={booking.products} />
            )}

            {/* Attachments list */}
            {booking.attachments && booking.attachments.length > 0 && (
              <AttachmentsList attachments={booking.attachments} />
            )}

            {lastViewedDate && (
              <p className="text-sm text-blue-500 mt-6">
                You came from calendar view on: {lastViewedDate.toLocaleDateString()}
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-700">No booking data available.</p>
        )}
      </div>
    </div>
  );
};

export default BookingDetail;
