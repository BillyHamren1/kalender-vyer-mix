
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MapPin, User, Calendar, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Booking } from '@/types/booking';
import { getDisplayBookingNumber } from './MapUtils';

interface BookingDetailPanelProps {
  booking: Booking | null;
  onClose: () => void;
  onViewDetails?: (booking: Booking) => void;
}

export const BookingDetailPanel: React.FC<BookingDetailPanelProps> = ({
  booking,
  onClose,
  onViewDetails
}) => {
  const navigate = useNavigate();
  
  if (!booking) return null;

  const handleBackToBooking = () => {
    if (onViewDetails) {
      onViewDetails(booking);
    } else {
      // Navigate to the booking detail page
      navigate(`/booking/${booking.id}`);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-20 w-64 mt-80">
      <Card className="shadow-lg bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-500" />
              Booking Details
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Client Information */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <User className="h-3 w-3 text-gray-500" />
              <span className="font-medium text-gray-900 text-sm">{booking.client}</span>
            </div>
            <div className="text-xs text-gray-600">
              <strong>Booking:</strong> {getDisplayBookingNumber(booking)}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <MapPin className="h-3 w-3 text-gray-500 mt-0.5" />
              <div className="text-xs text-gray-600">
                {booking.deliveryAddress || 'No address specified'}
              </div>
            </div>
          </div>

          {/* Event Date */}
          {booking.eventDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3 w-3 text-gray-500" />
              <span className="text-xs text-gray-600">
                Event: {new Date(booking.eventDate).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs">
              {booking.status}
            </Badge>
          </div>

          {/* Coordinates (for debugging) */}
          {booking.deliveryLatitude && booking.deliveryLongitude && (
            <div className="text-xs text-gray-400 border-t pt-2">
              Coordinates: {booking.deliveryLatitude.toFixed(6)}, {booking.deliveryLongitude.toFixed(6)}
            </div>
          )}

          {/* Back to Booking Button */}
          <Button 
            onClick={handleBackToBooking}
            className="w-full"
            size="sm"
          >
            <ArrowLeft className="h-3 w-3 mr-2" />
            Back to Booking
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
