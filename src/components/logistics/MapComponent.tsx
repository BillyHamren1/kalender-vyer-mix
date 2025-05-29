
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MapControls } from './MapControls';
import { MapMarkers } from './MapMarkers';
import { SnapshotPreviewModal } from './SnapshotPreviewModal';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  centerLat?: number;
  centerLng?: number;
  onSnapshotSaved?: (attachment: any) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({
  bookings,
  selectedBooking,
  onBookingSelect,
  centerLat,
  centerLng,
  onSnapshotSaved
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [snapshotImageUrl, setSnapshotImageUrl] = useState<string>('');
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [isCapturingSnapshot, setIsCapturingSnapshot] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initializeMap = async () => {
      try {
        // Get Mapbox token from Supabase function
        const { data: tokenData, error: tokenError } = await supabase.functions.invoke('mapbox-token');
        
        if (tokenError || !tokenData?.token) {
          console.error('Failed to get Mapbox token:', tokenError);
          toast.error('Failed to load map: Missing Mapbox token');
          return;
        }

        // Set the access token
        mapboxgl.accessToken = tokenData.token;

        // Initialize the map
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [18.0686, 59.3293], // Stockholm coordinates as default
          zoom: 10,
          attributionControl: false
        });

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Wait for map to load
        map.current.on('load', () => {
          console.log('Map loaded successfully');
          setMapInitialized(true);
        });

        map.current.on('error', (e) => {
          console.error('Map error:', e);
          toast.error('Map failed to load');
        });

      } catch (error) {
        console.error('Map initialization error:', error);
        toast.error('Failed to initialize map');
      }
    };

    initializeMap();

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, []);

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      setShowSnapshotModal(true); // Open modal immediately
      toast.info('Capturing map snapshot...');
      
      const canvas = map.current.getCanvas();
      const dataURL = canvas.toDataURL('image/png');

      const { data, error } = await supabase.functions.invoke('save-map-snapshot', {
        body: {
          image: dataURL,
          bookingId: selectedBooking.id,
          bookingNumber: selectedBooking.bookingNumber,
        }
      });

      if (error || !data?.url) {
        console.error('Upload failed:', error);
        toast.error('Failed to save map snapshot');
        setShowSnapshotModal(false);
        return;
      }

      setSnapshotImageUrl(data.url);
      toast.success('Snapshot captured');

      if (onSnapshotSaved && data.attachment) {
        onSnapshotSaved(data.attachment);
      }

    } catch (error) {
      console.error('Snapshot error:', error);
      toast.error('Snapshot failed');
      setShowSnapshotModal(false);
    } finally {
      setIsCapturingSnapshot(false);
    }
  };

  // If map is not initialized, show loading
  if (!mapInitialized) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative w-full h-full">
        <div ref={mapContainer} className="w-full h-full" />
        
        <MapMarkers
          map={map}
          bookings={bookings}
          selectedBooking={selectedBooking}
          onBookingSelect={onBookingSelect}
          mapInitialized={mapInitialized}
          centerLat={centerLat}
          centerLng={centerLng}
        />
      </div>

      <SnapshotPreviewModal
        isOpen={showSnapshotModal}
        onClose={() => {
          setShowSnapshotModal(false);
          setSnapshotImageUrl('');
        }}
        imageData={snapshotImageUrl}
        onSave={() => {}}
        bookingNumber={selectedBooking?.bookingNumber}
        isLoading={isCapturingSnapshot && !snapshotImageUrl}
      />
    </>
  );
};

export default MapComponent;
