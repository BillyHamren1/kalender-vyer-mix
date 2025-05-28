
import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarContext } from '@/App';
import { useBookingDetail } from '@/hooks/useBookingDetail';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Import refactored components
import { ClientInformation } from '@/components/booking/ClientInformation';
import { DeliveryAddressForm } from '@/components/booking/DeliveryAddressForm';
import { DeliveryContactCard } from '@/components/booking/DeliveryContactCard';
import { EventInformationCard } from '@/components/booking/EventInformationCard';
import { LogisticsOptionsForm } from '@/components/booking/LogisticsOptionsForm';
import { ScheduleCard } from '@/components/booking/ScheduleCard';
import { InternalNotes } from '@/components/booking/InternalNotes';
import { ProductsList } from '@/components/booking/ProductsList';
import { AttachmentsList } from '@/components/booking/AttachmentsList';
import StatusChangeForm from '@/components/booking/StatusChangeForm';

const BookingDetail = () => {
  const { id, bookingId } = useParams<{ id?: string; bookingId?: string }>();
  const navigate = useNavigate();
  const { lastViewedDate, lastPath } = useContext(CalendarContext);
  // Set autoSync to true by default
  const [autoSync, setAutoSync] = useState(true);
  
  // Use either id or bookingId parameter
  const actualBookingId = id || bookingId;
  
  console.log('BookingDetail component mounted with params:', { id, bookingId, actualBookingId });
  
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
  } = useBookingDetail(actualBookingId);
  
  useEffect(() => {
    console.log('BookingDetail useEffect triggered with actualBookingId:', actualBookingId);
    if (actualBookingId) {
      loadBookingData();
    } else {
      console.error('No booking ID found in URL parameters');
      toast.error('No booking ID provided in URL');
    }
  }, [actualBookingId]);

  // Debug logging for booking data
  useEffect(() => {
    console.log('Booking data changed:', booking);
    console.log('Booking products:', booking?.products);
  }, [booking]);
  
  const handleBack = () => {
    if (lastPath) {
      navigate(lastPath);
    } else {
      navigate('/resource-view');
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (booking) {
      setBooking({
        ...booking,
        status: newStatus
      });
      
      // Reload booking data to ensure we have the latest information
      loadBookingData();
    }
  };

  // Show error if no booking ID
  if (!actualBookingId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold text-red-500">No Booking ID</h1>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-gray-700">No booking ID was provided in the URL.</p>
          <p className="mt-2 text-sm text-gray-500">Expected URL format: /booking/[booking-id]</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold">Loading booking details...</h1>
            </div>
          </div>
        </div>
        <div className="p-6">
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
      <div className="min-h-screen bg-gray-50">
        <div className="border-b bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold text-red-500">Error Loading Booking</h1>
            </div>
          </div>
        </div>
        <div className="p-6">
          <p className="text-gray-700">{error}</p>
          <p className="mt-4">Booking ID: {actualBookingId}</p>
          <Button 
            onClick={() => loadBookingData()} 
            className="mt-4"
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Booking Details</h1>
              {booking && (
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-sm text-gray-600">
                    #{booking.bookingNumber || 'No booking number'}
                  </p>
                  <span className="text-gray-400">•</span>
                  <p className="text-sm font-medium text-gray-700">{booking.client}</p>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {booking && (
              <StatusChangeForm
                currentStatus={booking.status}
                bookingId={actualBookingId || ''}
                onStatusChange={handleStatusChange}
                disabled={isSaving}
              />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {booking ? (
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="space-y-3">
              <ClientInformation client={booking.client} />
              
              {/* Display Products */}
              {booking.products && booking.products.length > 0 && (
                <ProductsList products={booking.products} />
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-3">
              {/* Event Information - moved above Delivery Address */}
              <EventInformationCard
                rigDates={rigDates}
                eventDates={eventDates}
                rigDownDates={rigDownDates}
              />
              
              <DeliveryAddressForm
                initialAddress={booking.deliveryAddress || ''}
                initialCity={booking.deliveryCity || ''}
                initialPostalCode={booking.deliveryPostalCode || ''}
                deliveryLatitude={booking.deliveryLatitude}
                deliveryLongitude={booking.deliveryLongitude}
                isSaving={isSaving}
                onSave={handleDeliveryDetailsChange}
              />
              
              {/* Delivery Contact */}
              <DeliveryContactCard />
            </div>
          </div>

          {/* Full width sections */}
          <div className="mt-6 space-y-3">
            <LogisticsOptionsForm
              initialCarryMoreThan10m={booking.carryMoreThan10m || false}
              initialGroundNailsAllowed={booking.groundNailsAllowed || false}
              initialExactTimeNeeded={booking.exactTimeNeeded || false}
              initialExactTimeInfo={booking.exactTimeInfo || ''}
              isSaving={isSaving}
              onSave={handleLogisticsChange}
            />

            <ScheduleCard
              bookingId={actualBookingId || ''}
              rigDates={rigDates}
              eventDates={eventDates}
              rigDownDates={rigDownDates}
              autoSync={autoSync}
              onAutoSyncChange={setAutoSync}
              onAddDate={addDate}
              onRemoveDate={removeDate}
            />

            {/* Display Attachments */}
            {booking.attachments && booking.attachments.length > 0 && (
              <AttachmentsList attachments={booking.attachments} />
            )}

            <InternalNotes notes={booking.internalNotes || ''} />

            {lastViewedDate && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">
                  You came from calendar view on: {lastViewedDate.toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6">
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No booking data available.</p>
            <Button 
              onClick={() => loadBookingData()} 
              className="mt-4"
              variant="outline"
            >
              Reload Booking Data
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingDetail;
