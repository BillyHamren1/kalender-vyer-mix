
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CalendarEvent } from './ResourceData';
import { Package, MapPin, FileText, AlertTriangle } from 'lucide-react';

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
      <HoverCardContent 
        className="w-96 max-w-96 p-4 bg-white border shadow-xl z-[10000] max-h-[500px] overflow-y-auto" 
        side="top" 
        align="start"
        sideOffset={10}
        alignOffset={0}
        avoidCollisions={true}
        collisionPadding={20}
      >
        <div className="space-y-4">
          {/* Event Title and Booking Number */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-base text-gray-900 leading-tight">{event.title}</h4>
            {bookingNumber && (
              <p className="text-sm text-gray-500 mt-1">Booking #{bookingNumber}</p>
            )}
          </div>

          {/* Products Section */}
          {products && products.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-gray-800">Products ({products.length})</span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {products.map((product: any, index: number) => (
                  <div key={product.id || index} className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-900 text-sm leading-tight">{product.name}</span>
                      <span className="text-blue-700 font-semibold text-sm ml-2">×{product.quantity}</span>
                    </div>
                    {product.notes && (
                      <p className="text-gray-700 text-xs mt-2 leading-relaxed">{product.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {fullAddress && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-green-600" />
                <span className="text-sm font-semibold text-gray-800">Delivery Address</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed bg-green-50 p-2 rounded border border-green-100">{fullAddress}</p>
            </div>
          )}

          {/* Special Requirements */}
          {(event.extendedProps?.carryMoreThan10m || event.extendedProps?.groundNailsAllowed || event.extendedProps?.exactTimeNeeded) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-gray-800">Special Requirements</span>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                <div className="text-sm text-gray-700 space-y-1">
                  {event.extendedProps?.carryMoreThan10m && (
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                      Carry more than 10m required
                    </div>
                  )}
                  {event.extendedProps?.groundNailsAllowed && (
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                      Ground nails allowed
                    </div>
                  )}
                  {event.extendedProps?.exactTimeNeeded && (
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-orange-400 rounded-full mr-2"></span>
                      Exact time needed: {event.extendedProps?.exactTimeInfo || 'Yes'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Internal Notes */}
          {internalNotes && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-800">Internal Notes</span>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{internalNotes}</p>
              </div>
            </div>
          )}

          {/* Debug info - remove in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="border-t pt-3 text-xs text-gray-400">
              <details>
                <summary className="cursor-pointer hover:text-gray-600">Debug Info</summary>
                <pre className="mt-2 text-xs overflow-auto max-h-32 bg-gray-100 p-2 rounded">
                  {JSON.stringify(event.extendedProps, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Show message when no additional details */}
          {(!products || products.length === 0) && !internalNotes && !fullAddress && 
           !event.extendedProps?.carryMoreThan10m && !event.extendedProps?.groundNailsAllowed && !event.extendedProps?.exactTimeNeeded && (
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 text-center">
              <p className="text-sm text-gray-500 italic">No additional details available</p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default EventHoverCard;
