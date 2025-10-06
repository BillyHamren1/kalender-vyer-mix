
import React from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { CalendarEvent } from './ResourceData';
import { Package, MapPin, FileText, AlertTriangle, User, Building } from 'lucide-react';

interface EventHoverCardProps {
  children: React.ReactNode;
  event: CalendarEvent;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
}

const EventHoverCard: React.FC<EventHoverCardProps> = ({ children, event, onClick = undefined, onDoubleClick = undefined, disabled = false }) => {
  // Debug logging to see what data we're receiving
  console.log('EventHoverCard - Event data:', event);
  console.log('EventHoverCard - Extended props:', event.extendedProps);
  
  const products = event.extendedProps?.products || [];
  const deliveryAddress = event.extendedProps?.deliveryAddress;
  const internalNotes = event.extendedProps?.internalNotes;
  const bookingNumber = event.extendedProps?.bookingNumber || event.extendedProps?.bookingId;
  const deliveryCity = event.extendedProps?.deliveryCity;
  const deliveryPostalCode = event.extendedProps?.deliveryPostalCode;
  
  // Get client and city information
  const client = event.extendedProps?.client || 'Unknown Client';
  const city = event.extendedProps?.deliveryCity || event.extendedProps?.city || 'Unknown City';
  
  // Debug specific fields
  console.log('EventHoverCard - Products:', products);
  console.log('EventHoverCard - Internal notes:', internalNotes);
  console.log('EventHoverCard - Delivery address:', deliveryAddress);
  console.log('EventHoverCard - Client:', client);
  console.log('EventHoverCard - City:', city);
  
  // Build full address string
  const fullAddress = [deliveryAddress, deliveryCity, deliveryPostalCode]
    .filter(Boolean)
    .join(', ');

  return (
    <HoverCard openDelay={0} closeDelay={100} open={disabled ? false : undefined}>
      <HoverCardTrigger asChild>
        {onClick || onDoubleClick ? (
          <div 
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            style={{ width: '100%', height: '100%' }}
          >
            {children}
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%' }}>
            {children}
          </div>
        )}
      </HoverCardTrigger>
      <HoverCardContent
        className="w-80 max-w-80 p-3 bg-white border shadow-lg max-h-96 overflow-y-auto" 
        side="top" 
        align="start"
        sideOffset={5}
        alignOffset={0}
        avoidCollisions={true}
        collisionPadding={20}
        style={{ zIndex: 9999 }}
      >
        <div className="space-y-3">
          {/* Event Title and Booking Number */}
          <div className="border-b pb-2">
            <h4 className="font-semibold text-sm text-gray-900 leading-tight">{event.title}</h4>
            {bookingNumber && (
              <p className="text-xs text-gray-500 mt-1">Booking #{bookingNumber}</p>
            )}
          </div>

          {/* Client and City Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="h-3 w-3 text-indigo-600" />
              <span className="text-xs font-semibold text-gray-800">Client & Location</span>
            </div>
            <div className="bg-indigo-50 p-2 rounded border border-indigo-100 space-y-1">
              <div className="flex items-center gap-2">
                <Building className="h-3 w-3 text-indigo-600" />
                <span className="text-xs text-gray-700 font-medium">{client}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-indigo-600" />
                <span className="text-xs text-gray-700">{city}</span>
              </div>
            </div>
          </div>

          {/* Products Section */}
          {products && products.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-3 w-3 text-blue-600" />
                <span className="text-xs font-semibold text-gray-800">Products ({products.length})</span>
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {products.map((product: any, index: number) => (
                  <div key={product.id || index} className="bg-blue-50 p-2 rounded border border-blue-100">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-900 text-xs leading-tight">{product.name}</span>
                      <span className="text-blue-700 font-semibold text-xs ml-2">×{product.quantity}</span>
                    </div>
                    {product.notes && (
                      <p className="text-gray-700 text-xs mt-1 leading-relaxed">{product.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Address */}
          {fullAddress && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="h-3 w-3 text-green-600" />
                <span className="text-xs font-semibold text-gray-800">Delivery Address</span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed bg-green-50 p-2 rounded border border-green-100">{fullAddress}</p>
            </div>
          )}

          {/* Special Requirements */}
          {(event.extendedProps?.carryMoreThan10m || event.extendedProps?.groundNailsAllowed || event.extendedProps?.exactTimeNeeded) && (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3 w-3 text-orange-600" />
                <span className="text-xs font-semibold text-gray-800">Special Requirements</span>
              </div>
              <div className="bg-orange-50 p-2 rounded border border-orange-100">
                <div className="text-xs text-gray-700 space-y-1">
                  {event.extendedProps?.carryMoreThan10m && (
                    <div className="flex items-center">
                      <span className="w-1 h-1 bg-orange-400 rounded-full mr-2"></span>
                      Carry more than 10m required
                    </div>
                  )}
                  {event.extendedProps?.groundNailsAllowed && (
                    <div className="flex items-center">
                      <span className="w-1 h-1 bg-orange-400 rounded-full mr-2"></span>
                      Ground nails allowed
                    </div>
                  )}
                  {event.extendedProps?.exactTimeNeeded && (
                    <div className="flex items-center">
                      <span className="w-1 h-1 bg-orange-400 rounded-full mr-2"></span>
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
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-3 w-3 text-purple-600" />
                <span className="text-xs font-semibold text-gray-800">Internal Notes</span>
              </div>
              <div className="bg-purple-50 p-2 rounded border border-purple-100">
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{internalNotes}</p>
              </div>
            </div>
          )}

          {/* Show message when no additional details */}
          {(!products || products.length === 0) && !internalNotes && !fullAddress && 
           !event.extendedProps?.carryMoreThan10m && !event.extendedProps?.groundNailsAllowed && !event.extendedProps?.exactTimeNeeded && (
            <div className="bg-gray-50 p-2 rounded border border-gray-200 text-center">
              <p className="text-xs text-gray-500 italic">No additional details available</p>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default EventHoverCard;
