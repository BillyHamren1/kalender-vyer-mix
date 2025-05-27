
import React from 'react';
import { Booking } from '@/types/booking';
import { Calendar, MapPin } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistance } from 'date-fns';

interface BookingListSidebarProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
}

const BookingListSidebar: React.FC<BookingListSidebarProps> = ({
  bookings,
  selectedBooking,
  onBookingSelect
}) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getNextEventDate = (booking: Booking) => {
    const today = new Date();
    const dates = [
      booking.rigDayDate ? new Date(booking.rigDayDate) : null,
      booking.eventDate ? new Date(booking.eventDate) : null,
      booking.rigDownDate ? new Date(booking.rigDownDate) : null
    ].filter(Boolean) as Date[];

    // Sort dates in ascending order
    dates.sort((a, b) => a.getTime() - b.getTime());
    
    // Find the first date that is today or in the future
    const nextDate = dates.find(date => date >= today);
    
    if (nextDate) {
      return formatDistance(nextDate, today, { addSuffix: true });
    }
    
    return 'Past event';
  };

  if (!bookings.length) {
    return (
      <div className="w-1/6 p-4 border-r">
        <div className="text-center p-6">
          <h3 className="text-lg font-medium text-gray-900">No Bookings</h3>
          <p className="mt-2 text-sm text-gray-500">
            No confirmed bookings with location data found
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-1/6 border-r">
      <ScrollArea className="h-full">
        <div className="p-4">
          <h3 className="text-lg font-medium mb-4">Bookings ({bookings.length})</h3>
          <div className="space-y-3">
            {bookings.map(booking => (
              <div 
                key={booking.id}
                className={`p-3 rounded-md cursor-pointer transition-colors ${
                  selectedBooking?.id === booking.id
                    ? 'bg-blue-100 border border-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                }`}
                onClick={() => onBookingSelect(booking)}
              >
                <h4 className="font-medium text-gray-900 truncate">{booking.client}</h4>
                <p className="text-sm text-gray-500 truncate">Booking #{booking.id}</p>
                
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-600">
                  <Calendar className="h-3 w-3" />
                  <span>{getNextEventDate(booking)}</span>
                </div>
                
                {booking.deliveryAddress && (
                  <div className="mt-1 flex items-start gap-1">
                    <MapPin className="h-3 w-3 text-gray-500 mt-0.5" />
                    <p className="text-xs text-gray-500 truncate">{booking.deliveryAddress}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default BookingListSidebar;
