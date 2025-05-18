
import React from 'react';
import { MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface MapViewProps {
  address?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

const MapView: React.FC<MapViewProps> = ({ 
  address, 
  city, 
  postalCode, 
  latitude, 
  longitude 
}) => {
  const hasCoordinates = latitude !== undefined && longitude !== undefined;
  const hasAddress = address || city || postalCode;
  
  // Only show map button if we have coordinates or address information
  if (!hasCoordinates && !hasAddress) {
    return null;
  }

  // Construct address string for embedding in map URL
  const addressForMap = hasCoordinates 
    ? `${latitude},${longitude}` 
    : encodeURIComponent([address, city, postalCode].filter(Boolean).join(', '));
  
  // Google Maps iframe URL based on coordinates or address
  const mapUrl = `https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${addressForMap}&zoom=14`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          View Location Map
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] sm:max-h-[600px] h-[500px]">
        <div className="w-full h-full">
          <iframe
            title="Delivery Location"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            src={mapUrl}
          ></iframe>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MapView;
