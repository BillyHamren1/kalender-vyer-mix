
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
import { LogisticsOptionsForm } from '@/components/booking/LogisticsOptionsForm';
import { ScheduleCard } from '@/components/booking/ScheduleCard';
import { InternalNotes } from '@/components/booking/InternalNotes';
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
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Booking Details: #{actualBookingId}</h1>
              {booking && (
                <p className="text-sm text-gray-600">{booking.client}</p>
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              <ClientInformation client={booking.client} />
              
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Event Information</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500">Event Type</label>
                    <p className="text-sm">Corporate Event</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Event Dates</label>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Rig Up</div>
                        {rigDates.length > 0 && (
                          <div className="text-sm font-medium">{new Date(rigDates[0]).toLocaleDateString()}</div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Event</div>
                        {eventDates.length > 0 && (
                          <div className="text-sm font-medium">{new Date(eventDates[0]).toLocaleDateString()}</div>
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500">Rig Down</div>
                        {rigDownDates.length > 0 && (
                          <div className="text-sm font-medium">{new Date(rigDownDates[0]).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Column */}
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Billing Information</h3>
                <Button variant="outline" size="sm" className="mb-4">
                  Copy from client
                </Button>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500">Billing Name</label>
                    <input 
                      type="text" 
                      placeholder="Billing name"
                      className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Billing Address</label>
                    <input 
                      type="text" 
                      placeholder="Street address"
                      className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Billing Postal Code</label>
                      <input 
                        type="text" 
                        placeholder="Postal code"
                        className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Billing City</label>
                      <input 
                        type="text" 
                        placeholder="City"
                        className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Billing Email</label>
                      <input 
                        type="email" 
                        placeholder="Email address"
                        className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Billing Phone</label>
                      <input 
                        type="tel" 
                        placeholder="Phone number"
                        className="w-full mt-1 p-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              <DeliveryAddressForm
                initialAddress={booking.deliveryAddress || ''}
                initialCity={booking.deliveryCity || ''}
                initialPostalCode={booking.deliveryPostalCode || ''}
                deliveryLatitude={booking.deliveryLatitude}
                deliveryLongitude={booking.deliveryLongitude}
                isSaving={isSaving}
                onSave={handleDeliveryDetailsChange}
              />
            </div>
          </div>

          {/* Full width sections */}
          <div className="mt-6 space-y-6">
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

            <InternalNotes notes={booking.internalNotes || ''} />

            {lastViewedDate && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">
                  You came from calendar view on: {lastViewedDate.toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6">
          <p className="text-gray-700">No booking data available.</p>
          <Button 
            onClick={() => loadBookingData()} 
            className="mt-4"
            variant="outline"
          >
            Reload Booking Data
          </Button>
        </div>
      )}
    </div>
  );
};

export default BookingDetail;
