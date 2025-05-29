
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, MapPin, User, Calendar, ExternalLink } from 'lucide-react';
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
  if (!booking) return null;

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(booking);
    } else {
      // Default behavior - navigate to booking detail page
      window.open(`/booking/${booking.id}`, '_blank');
    }
  };

  return (
    <div className="absolute top-4 right-4 z-20 w-80">
      <Card className="shadow-lg bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              Booking Details
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client Information */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="font-medium text-gray-900">{booking.client}</span>
            </div>
            <div className="text-sm text-gray-600">
              <strong>Booking:</strong> {getDisplayBookingNumber(booking)}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
              <div className="text-sm text-gray-600">
                {booking.deliveryAddress || 'No address specified'}
              </div>
            </div>
          </div>

          {/* Event Date */}
          {booking.eventDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-600">
                Event: {new Date(booking.eventDate).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
              {booking.status}
            </Badge>
          </div>

          {/* Coordinates (for debugging) */}
          {booking.deliveryLatitude && booking.deliveryLongitude && (
            <div className="text-xs text-gray-400 border-t pt-2">
              Coordinates: {booking.deliveryLatitude.toFixed(6)}, {booking.deliveryLongitude.toFixed(6)}
            </div>
          )}

          {/* View Details Button */}
          <Button 
            onClick={handleViewDetails}
            className="w-full"
            size="sm"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Full Details
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
