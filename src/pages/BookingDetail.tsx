import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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
  
  
  // Use either id or bookingId parameter
  const actualBookingId = id || bookingId;
  
  // Use our custom hook for booking details
  const {
    booking,
    isLoading,
    error,
    isSaving,
    rigDates,
    eventDates,
    rigDownDates,
    loadBookingData,
    handleDeliveryDetailsChange,
    handleInternalNotesChange,
    setBooking,
    addDate,
    removeDate,
    isSavingInternalNotes
  } = useBookingDetail(actualBookingId);
  
  useEffect(() => {
    if (actualBookingId) {
      loadBookingData();
    }
  }, [actualBookingId]);
  
  const handleBack = () => {
    // Check if there's history to go back to, otherwise navigate to bookings list
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/bookings');
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
        rigDates={rigDates}
        eventDates={eventDates}
        rigDownDates={rigDownDates}
        isSaving={isSaving}
        onAddDate={handleAddDate}
        onRemoveDate={handleRemoveDate}
        onDeliveryDetailsChange={handleDeliveryDetailsChange}
        onInternalNotesChange={handleInternalNotesChange}
        isSavingInternalNotes={isSavingInternalNotes}
        onAttachmentAdded={(attachment) => {
          setBooking(prev => prev ? {
            ...prev,
            attachments: [...(prev.attachments || []), attachment]
          } : null);
        }}
        onAttachmentDeleted={(attachmentId) => {
          setBooking(prev => prev ? {
            ...prev,
            attachments: (prev.attachments || []).filter(a => a.id !== attachmentId)
          } : null);
        }}
        onAttachmentRenamed={(attachmentId, newName) => {
          setBooking(prev => prev ? {
            ...prev,
            attachments: (prev.attachments || []).map(a => 
              a.id === attachmentId ? { ...a, fileName: newName } : a
            )
          } : null);
        }}
      />
    </div>
  );
};

export default BookingDetail;
