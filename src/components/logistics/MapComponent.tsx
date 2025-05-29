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
  const [loadingStatus, setLoadingStatus] = useState<string>('Initializing...');

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initializeMap = async () => {
      try {
        console.log('🗺️ Starting map initialization...');
        setLoadingStatus('Fetching Mapbox token...');
        
        // Add timeout to token fetch
        const tokenPromise = supabase.functions.invoke('mapbox-token');
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Token fetch timeout')), 10000)
        );
        
        console.log('📡 Fetching Mapbox token with timeout...');
        
        const { data: tokenData, error: tokenError } = await Promise.race([
          tokenPromise,
          timeoutPromise
        ]) as any;
        
        console.log('📨 Token response received:', { tokenData, tokenError });
        
        if (tokenError) {
          console.error('❌ Token error:', tokenError);
          throw new Error(`Token fetch failed: ${tokenError.message}`);
        }
        
        if (!tokenData?.token) {
          console.error('❌ No token in response:', tokenData);
          throw new Error('No Mapbox token received from server');
        }
        
        console.log('✅ Mapbox token received, initializing map...');
        setLoadingStatus('Initializing map...');

        // Set the access token
        mapboxgl.accessToken = tokenData.token;

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

        // Set up event handlers
        map.current.on('load', () => {
          console.log('✅ Map loaded successfully');
          setMapInitialized(true);
          setLoadingStatus('');
        });

        map.current.on('error', (e) => {
          console.error('❌ Map error:', e);
          const errorMsg = e.error?.message || 'Unknown map error';
          setLoadingError(`Map error: ${errorMsg}`);
          toast.error('Map failed to load');
        });

        // Add a timeout for map loading
        setTimeout(() => {
          if (!mapInitialized) {
            console.error('❌ Map loading timeout');
            setLoadingError('Map loading timeout - please try refreshing the page');
          }
        }, 15000);

      } catch (error) {
        console.error('❌ Map initialization error:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setLoadingError(`Initialization error: ${errorMsg}`);
        toast.error('Failed to initialize map');
      }
    };

    // Start initialization immediately
    initializeMap();

    return () => {
      if (map.current) {
        console.log('🧹 Cleaning up map...');
        map.current.remove();
        map.current = null;
        setMapInitialized(false);
      }
    };
  }, [centerLat, centerLng, mapInitialized]);

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
              <p className="text-gray-600 text-sm mb-3">{loadingError}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-gray-600">Loading map...</p>
              <p className="text-gray-400 text-xs mt-1">{loadingStatus}</p>
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
