
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
  const [loadingError, setLoadingError] = useState<string>('');

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initializeMap = async () => {
      try {
        console.log('🗺️ Starting map initialization...');
        
        // Try to get Mapbox token from environment or use a fallback
        let mapboxToken = '';
        
        try {
          console.log('📡 Fetching Mapbox token from Supabase...');
          const { data: tokenData, error: tokenError } = await supabase.functions.invoke('mapbox-token');
          
          console.log('📨 Token response:', { tokenData, tokenError });
          
          if (tokenError) {
            console.error('❌ Token error:', tokenError);
            throw new Error(`Token fetch failed: ${tokenError.message}`);
          }
          
          if (!tokenData?.token) {
            console.error('❌ No token in response:', tokenData);
            throw new Error('No Mapbox token received from server');
          }
          
          mapboxToken = tokenData.token;
          console.log('✅ Mapbox token received successfully');
          
        } catch (tokenError) {
          console.error('❌ Failed to fetch token from Supabase:', tokenError);
          setLoadingError(`Failed to get Mapbox token: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
          toast.error('Failed to load map: Token error');
          return;
        }

        console.log('🔧 Setting Mapbox access token...');
        mapboxgl.accessToken = mapboxToken;

        console.log('🌍 Creating map instance...');
        // Initialize the map
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [centerLng || 18.0686, centerLat || 59.3293],
          zoom: centerLat && centerLng ? 12 : 10,
          attributionControl: false
        });

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Wait for map to load
        map.current.on('load', () => {
          console.log('✅ Map loaded successfully');
          setMapInitialized(true);
        });

        map.current.on('error', (e) => {
          console.error('❌ Map error:', e);
          setLoadingError(`Map error: ${e.error?.message || 'Unknown map error'}`);
          toast.error('Map failed to load');
        });

      } catch (error) {
        console.error('❌ Map initialization error:', error);
        setLoadingError(`Initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        toast.error('Failed to initialize map');
      }
    };

    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      initializeMap();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (map.current) {
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, [centerLat, centerLng]);

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
      setIsCapturingSnapshot(true);
      setShowSnapshotModal(true);
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

  // Show loading or error state
  if (!mapInitialized) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center max-w-md">
          {loadingError ? (
            <>
              <div className="text-red-500 mb-2 text-2xl">⚠️</div>
              <p className="text-red-600 font-medium mb-2">Map Loading Failed</p>
              <p className="text-gray-600 text-sm">{loadingError}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-gray-600">Loading map...</p>
              <p className="text-gray-400 text-xs mt-1">Fetching Mapbox token...</p>
            </>
          )}
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
