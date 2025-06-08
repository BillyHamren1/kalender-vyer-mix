
import React, { useEffect, useContext, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';
import { useBookingDetail } from '@/hooks/useBookingDetail';

// Import refactored components
import { BookingDetailHeader } from '@/components/booking/detail/BookingDetailHeader';
import { BookingDetailError } from '@/components/booking/detail/BookingDetailError';
import { BookingDetailLoading } from '@/components/booking/detail/BookingDetailLoading';
import { BookingDetailMissingId } from '@/components/booking/detail/BookingDetailMissingId';
import BookingDetailContent from '@/components/booking/detail/BookingDetailContent';

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
    handleInternalNotesChange,
    syncWithCalendar,
    setBooking,
    addDate,
    removeDate,
    isSavingInternalNotes
  } = useBookingDetail(actualBookingId);
  
  useEffect(() => {
    console.log('BookingDetail useEffect triggered with actualBookingId:', actualBookingId);
    if (actualBookingId) {
      loadBookingData();
    } else {
      console.error('No booking ID found in URL parameters');
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

  // Wrapper functions to match the expected signatures
  const handleAddDate = (date: Date, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => {
    addDate(date, eventType, autoSync);
  };

  const handleRemoveDate = (date: string, eventType: 'rig' | 'event' | 'rigDown', autoSync: boolean) => {
    removeDate(date, eventType, autoSync);
  };

  // Show error if no booking ID
  if (!actualBookingId) {
    return <BookingDetailMissingId onBack={handleBack} />;
  }

  if (isLoading) {
    return <BookingDetailLoading onBack={handleBack} />;
  }

  if (error) {
    return (
      <BookingDetailError
        error={error}
        bookingId={actualBookingId}
        onBack={handleBack}
        onRetry={loadBookingData}
      />
    );
  }

  if (!booking) {
    return <BookingDetailLoading onBack={handleBack} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <BookingDetailHeader
        bookingNumber={booking.bookingNumber}
        client={booking.client}
        status={booking.status}
        bookingId={actualBookingId}
        isSaving={isSaving}
        onBack={handleBack}
        onStatusChange={handleStatusChange}
      />

      {/* Content */}
      <BookingDetailContent
        booking={booking}
        bookingId={actualBookingId}
        rigDates={rigDates}
        eventDates={eventDates}
        rigDownDates={rigDownDates}
        isSaving={isSaving}
        autoSync={autoSync}
        lastViewedDate={lastViewedDate}
        onAddDate={handleAddDate}
        onRemoveDate={handleRemoveDate}
        onDeliveryDetailsChange={handleDeliveryDetailsChange}
        onLogisticsChange={handleLogisticsChange}
        onInternalNotesChange={handleInternalNotesChange}
        onReloadData={loadBookingData}
        isSavingInternalNotes={isSavingInternalNotes}
      />
    </div>
  );
};

export default BookingDetail;
