
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CalendarEvent } from './ResourceData';
import { Package, MapPin, FileText } from 'lucide-react';

interface EventHoverCardProps {
  children: React.ReactNode;
  event: CalendarEvent;
}

const EventHoverCard: React.FC<EventHoverCardProps> = ({ children, event }) => {
  // Debug logging to see what data we're receiving
  console.log('EventHoverCard - Event data:', event);
  console.log('EventHoverCard - Extended props:', event.extendedProps);
  
  const products = event.extendedProps?.products || [];
  const deliveryAddress = event.extendedProps?.deliveryAddress;
  const internalNotes = event.extendedProps?.internalNotes;
  const bookingNumber = event.extendedProps?.bookingNumber || event.extendedProps?.bookingId;
  const deliveryCity = event.extendedProps?.deliveryCity;
  const deliveryPostalCode = event.extendedProps?.deliveryPostalCode;
  
  // Debug specific fields
  console.log('EventHoverCard - Products:', products);
  console.log('EventHoverCard - Internal notes:', internalNotes);
  console.log('EventHoverCard - Delivery address:', deliveryAddress);
  
  // Build full address string
  const fullAddress = [deliveryAddress, deliveryCity, deliveryPostalCode]
    .filter(Boolean)
    .join(', ');

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-4 bg-white border shadow-lg z-[9999]" side="top" align="center">
        <div className="space-y-3">
          {/* Event Title and Booking Number */}
          <div className="border-b pb-2">
            <h4 className="font-semibold text-sm text-gray-900">{event.title}</h4>
            {bookingNumber && (
              <p className="text-xs text-gray-500">#{bookingNumber}</p>
            )}
          </div>

          {/* Products Section */}
          {products && products.length > 0 && (
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Package className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Products ({products.length})</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {products.map((product: any, index: number) => (
                  <div key={product.id || index} className="text-xs bg-gray-50 p-2 rounded">
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
          {fullAddress && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <MapPin className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Delivery Address</span>
              </div>
              <p className="text-xs text-gray-600 break-words">{fullAddress}</p>
            </div>
          )}

          {/* Internal Notes */}
          {internalNotes && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <FileText className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Internal Notes</span>
              </div>
              <p className="text-xs text-gray-600 break-words">{internalNotes}</p>
            </div>
          )}

          {/* Additional logistics info */}
          {(event.extendedProps?.carryMoreThan10m || event.extendedProps?.groundNailsAllowed || event.extendedProps?.exactTimeNeeded) && (
            <div>
              <div className="flex items-center gap-1 mb-1">
                <span className="text-sm font-medium text-gray-700">Special Requirements</span>
              </div>
              <div className="text-xs text-gray-600 space-y-1">
                {event.extendedProps?.carryMoreThan10m && (
                  <div>• Carry more than 10m required</div>
                )}
                {event.extendedProps?.groundNailsAllowed && (
                  <div>• Ground nails allowed</div>
                )}
                {event.extendedProps?.exactTimeNeeded && (
                  <div>• Exact time needed: {event.extendedProps?.exactTimeInfo || 'Yes'}</div>
                )}
              </div>
            </div>
          )}

          {/* Debug info - remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="border-t pt-2 text-xs text-gray-400">
              <details>
                <summary>Debug Info</summary>
                <pre className="mt-1 text-xs overflow-auto max-h-20">
                  {JSON.stringify(event.extendedProps, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Show message when no additional details */}
          {(!products || products.length === 0) && !internalNotes && !fullAddress && (
            <p className="text-xs text-gray-500 italic">No additional details available</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default EventHoverCard;
