
import React from 'react';
import { Map, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface MapViewButtonProps {
  latitude?: number;
  longitude?: number;
  bookingId?: string;
  isMapOpen: boolean;
  onMapOpenChange: (open: boolean) => void;
}

export const MapViewButton: React.FC<MapViewButtonProps> = ({
  latitude,
  longitude,
  bookingId,
  isMapOpen,
  onMapOpenChange
}) => {
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
          className="h-6 px-2 text-xs"
        >
          <Map className="h-3 w-3 mr-1" />
          View Map
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] h-[95vh] max-w-none p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Delivery Location Map
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 h-full p-4 pt-2">
          <iframe
            src={getMapIframeUrl()}
            className="w-full h-full border-0 rounded-lg"
            title="Delivery Location Map"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
