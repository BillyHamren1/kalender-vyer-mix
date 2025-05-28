
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CalendarEvent } from './ResourceData';
import { Package, MapPin, FileText } from 'lucide-react';

interface EventHoverCardProps {
  children: React.ReactNode;
  event: CalendarEvent;
}

const EventHoverCard: React.FC<EventHoverCardProps> = ({ children, event }) => {
  const products = event.extendedProps?.products || [];
  const deliveryAddress = event.extendedProps?.deliveryAddress;
  const internalNotes = event.extendedProps?.internalNotes;
  const bookingNumber = event.extendedProps?.bookingNumber || event.extendedProps?.bookingId;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4 bg-white border shadow-lg z-50">
        <div className="space-y-3">
          {/* Event Title and Booking Number */}
          <div className="border-b pb-2">
            <h4 className="font-semibold text-sm text-gray-900">{event.title}</h4>
            {bookingNumber && (
              <p className="text-xs text-gray-500">#{bookingNumber}</p>
            )}
          </div>

          {/* Products Section */}
          {products.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Package className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Products</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {products.map((product: any, index: number) => (
                  <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-gray-800">{product.name}</span>
                      <span className="text-gray-600 ml-2">×{product.quantity}</span>
                    </div>
                    {product.notes && (
                      <p className="text-gray-600 mt-1 text-xs">{product.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {deliveryAddress && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <MapPin className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Delivery Address</span>
              </div>
              <p className="text-xs text-gray-600 break-words">{deliveryAddress}</p>
            </div>
          )}

          {/* Internal Notes */}
          {internalNotes && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <FileText className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Notes</span>
              </div>
              <p className="text-xs text-gray-600 break-words">{internalNotes}</p>
            </div>
          )}

          {/* No products message */}
          {products.length === 0 && !deliveryAddress && !internalNotes && (
            <p className="text-xs text-gray-500 italic">No additional details available</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default EventHoverCard;
