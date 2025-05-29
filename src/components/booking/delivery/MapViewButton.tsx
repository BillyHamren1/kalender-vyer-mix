
import React, { useEffect, useRef } from 'react';
import { Map, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface MapViewButtonProps {
  latitude?: number;
  longitude?: number;
  bookingId?: string;
  bookingNumber?: string;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
}

export const MapViewButton: React.FC<MapViewButtonProps> = ({
  latitude,
  longitude,
  bookingId,
  bookingNumber,
  isMapOpen,
  onMapOpenChange
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Create iframe URL for the map
  const getMapIframeUrl = () => {
    const params = new URLSearchParams({
      hideControls: 'true'
    });
    
    if (latitude && longitude) {
      params.append('lat', latitude.toString());
      params.append('lng', longitude.toString());
    }
    
    // Add booking ID to automatically select the booking in the map
    if (bookingId) {
      params.append('bookingId', bookingId);
    }
    
    return `/logistics-map?${params.toString()}`;
  };

  // Handle map resize when dialog opens
  useEffect(() => {
    if (isMapOpen && iframeRef.current) {
      // Small delay to ensure dialog animation is complete
      const timer = setTimeout(() => {
        if (iframeRef.current?.contentWindow) {
          // Send resize message to iframe
          iframeRef.current.contentWindow.postMessage(
            { type: 'RESIZE_MAP' }, 
            window.location.origin
          );
        }
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isMapOpen]);

  // Only show if coordinates exist
  if (!latitude || !longitude) {
    return null;
  }

  return (
    <Dialog open={isMapOpen} onOpenChange={onMapOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs bg-teal-500 hover:bg-teal-600 text-white border-teal-500 hover:border-teal-600"
        >
          <Map className="h-3 w-3 mr-1" />
          View Map
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] h-[95vh] max-w-none p-0 flex flex-col">
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {bookingNumber || 'No booking number'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 p-4 pt-2 min-h-0">
          <iframe
            ref={iframeRef}
            src={getMapIframeUrl()}
            className="w-full h-full border-0 rounded-lg"
            title="Delivery Location Map"
            onLoad={() => {
              // Trigger resize after iframe loads
              setTimeout(() => {
                if (iframeRef.current?.contentWindow) {
                  iframeRef.current.contentWindow.postMessage(
                    { type: 'RESIZE_MAP' }, 
                    window.location.origin
                  );
                }
              }, 100);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
