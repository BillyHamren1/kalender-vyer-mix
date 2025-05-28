
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Ruler, Mountain, RotateCcw } from 'lucide-react';

interface MapComponentProps {
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ 
  bookings, 
  selectedBooking,
  onBookingSelect 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapInitialized, setMapInitialized] = useState(false);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const popups = useRef<{[key: string]: mapboxgl.Popup}>({});
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(true);
  const [is3DEnabled, setIs3DEnabled] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const measurePoints = useRef<number[][]>([]);
  const measureSource = useRef<mapboxgl.GeoJSONSource | null>(null);

  // Fetch Mapbox token from edge function
  useEffect(() => {
    const fetchMapboxToken = async () => {
      try {
        setIsLoadingToken(true);
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        
        if (error) {
          console.error('Error fetching Mapbox token:', error);
          toast.error('Failed to load map: Could not get access token');
          return;
        }
        
        setMapboxToken(data.token);
        mapboxgl.accessToken = data.token;
      } catch (error) {
        console.error('Error in token fetch:', error);
        toast.error('Failed to load map');
      } finally {
        setIsLoadingToken(false);
      }
    };

    fetchMapboxToken();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken || isLoadingToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // High-resolution satellite with streets
      center: [18, 60], // Centered on Europe/Scandinavia
      zoom: 4,
      maxZoom: 22, // Maximum zoom for highest resolution
      minZoom: 1,
      pitch: 0, // Start flat
      bearing: 0,
      antialias: true, // Better rendering quality
      projection: 'globe' // Globe projection for better visualization
    });

    // Add enhanced navigation controls
    map.current.addControl(new mapboxgl.NavigationControl({
      visualizePitch: true,
      showZoom: true,
      showCompass: true
    }), 'top-right');

    // Add scale control
    map.current.addControl(new mapboxgl.ScaleControl({
      maxWidth: 80,
      unit: 'metric'
    }), 'bottom-left');

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      setMapInitialized(true);
      
      // Add 3D terrain source
      map.current?.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });

      // Add measuring source
      map.current?.addSource('measure-points', {
        'type': 'geojson',
        'data': {
          'type': 'FeatureCollection',
          'features': []
        }
      });

      measureSource.current = map.current?.getSource('measure-points') as mapboxgl.GeoJSONSource;

      // Add measuring line layer
      map.current?.addLayer({
        'id': 'measure-lines',
        'type': 'line',
        'source': 'measure-points',
        'layout': {
          'line-cap': 'round',
          'line-join': 'round'
        },
        'paint': {
          'line-color': '#ff0000',
          'line-width': 3
        }
      });

      // Add measuring points layer
      map.current?.addLayer({
        'id': 'measure-points-layer',
        'type': 'circle',
        'source': 'measure-points',
        'paint': {
          'circle-radius': 6,
          'circle-color': '#ff0000',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken]);

  // Toggle 3D terrain
  const toggle3D = () => {
    if (!map.current || !mapInitialized) return;

    if (!is3DEnabled) {
      // Enable 3D terrain
      map.current.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });
      map.current.easeTo({
        pitch: 60,
        bearing: 45,
        duration: 1000
      });
      setIs3DEnabled(true);
      toast.success('3D terrain enabled');
    } else {
      // Disable 3D terrain
      map.current.setTerrain(null);
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1000
      });
      setIs3DEnabled(false);
      toast.success('3D terrain disabled');
    }
  };

  // Calculate distance between two points
  const calculateDistance = (point1: number[], point2: number[]): number => {
    const [lon1, lat1] = point1;
    const [lon2, lat2] = point2;
    
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };

  // Format distance for display
  const formatDistance = (distance: number): string => {
    if (distance < 1000) {
      return `${Math.round(distance)} m`;
    } else {
      return `${(distance / 1000).toFixed(2)} km`;
    }
  };

  // Toggle measuring tool
  const toggleMeasuring = () => {
    if (!map.current || !mapInitialized) return;

    if (!isMeasuring) {
      setIsMeasuring(true);
      map.current.getCanvas().style.cursor = 'crosshair';
      toast.info('Click on the map to start measuring. Click again to add points.');
      
      // Add click handler for measuring
      map.current.on('click', handleMeasureClick);
    } else {
      setIsMeasuring(false);
      map.current.getCanvas().style.cursor = '';
      map.current.off('click', handleMeasureClick);
      
      // Clear measurements
      measurePoints.current = [];
      updateMeasureDisplay();
      toast.info('Measuring disabled');
    }
  };

  // Handle measure click
  const handleMeasureClick = (e: mapboxgl.MapMouseEvent) => {
    const coords = [e.lngLat.lng, e.lngLat.lat];
    measurePoints.current.push(coords);
    
    if (measurePoints.current.length > 1) {
      const totalDistance = measurePoints.current.reduce((total, point, index) => {
        if (index === 0) return 0;
        return total + calculateDistance(measurePoints.current[index - 1], point);
      }, 0);
      
      toast.success(`Distance: ${formatDistance(totalDistance)}`);
    }
    
    updateMeasureDisplay();
  };

  // Update measure display
  const updateMeasureDisplay = () => {
    if (!measureSource.current) return;

    const features = [];
    
    // Add points
    measurePoints.current.forEach((point, index) => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point
        },
        properties: {
          id: index
        }
      });
    });

    // Add line if more than one point
    if (measurePoints.current.length > 1) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: measurePoints.current
        },
        properties: {}
      });
    }

    measureSource.current.setData({
      type: 'FeatureCollection',
      features: features
    });
  };

  // Reset view
  const resetView = () => {
    if (!map.current || !mapInitialized) return;

    map.current.flyTo({
      center: [18, 60],
      zoom: 4,
      pitch: 0,
      bearing: 0,
      duration: 2000
    });

    // Clear measurements
    measurePoints.current = [];
    updateMeasureDisplay();
    setIsMeasuring(false);
    map.current.getCanvas().style.cursor = '';
    map.current.off('click', handleMeasureClick);
  };

  const getDisplayBookingNumber = (booking: Booking) => {
    if (booking.bookingNumber) {
      return `Booking #${booking.bookingNumber}`;
    }
    return `Booking #${booking.id.substring(0, 8)}...`;
  };

  // Add or update markers when bookings change
  useEffect(() => {
    if (!map.current || !mapInitialized) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    // Clear existing popups
    Object.values(popups.current).forEach(popup => popup.remove());
    popups.current = {};

    if (!bookings.length) return;

    // Bounds to fit all markers
    const bounds = new mapboxgl.LngLatBounds();
    
    // Add new markers
    bookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;
      
      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div>
          <h3 class="font-bold">${booking.client}</h3>
          <p>${getDisplayBookingNumber(booking)}</p>
          <p>${booking.deliveryAddress || 'No address'}</p>
          <button 
            class="px-2 py-1 mt-2 text-xs bg-blue-500 text-white rounded"
            onclick="document.dispatchEvent(new CustomEvent('selectBooking', {detail: '${booking.id}'}));"
          >
            View Details
          </button>
        </div>
      `);
      
      popups.current[booking.id] = popup;

      // Create marker element
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.width = '25px';
      el.style.height = '25px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = selectedBooking?.id === booking.id ? '#3b82f6' : '#ef4444';
      el.style.cursor = 'pointer';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 0 2px rgba(0, 0, 0, 0.1)';
      
      // Create marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([booking.deliveryLongitude, booking.deliveryLatitude])
        .setPopup(popup)
        .addTo(map.current!);
      
      markers.current.push(marker);
      
      // Extend bounds
      bounds.extend([booking.deliveryLongitude, booking.deliveryLatitude]);
    });

    // Fit bounds if there are markers
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, {
        padding: 100,
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [bookings, selectedBooking, mapInitialized]);

  // Handle event delegation for popup button clicks
  useEffect(() => {
    const handleSelectBooking = (e: Event) => {
      const bookingId = (e as CustomEvent).detail;
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        onBookingSelect(booking);
      }
    };

    document.addEventListener('selectBooking', handleSelectBooking);
    return () => {
      document.removeEventListener('selectBooking', handleSelectBooking);
    };
  }, [bookings, onBookingSelect]);

  // Fly to selected booking
  useEffect(() => {
    if (!map.current || !selectedBooking || !mapInitialized) return;
    
    if (selectedBooking.deliveryLatitude && selectedBooking.deliveryLongitude) {
      map.current.flyTo({
        center: [selectedBooking.deliveryLongitude, selectedBooking.deliveryLatitude],
        zoom: 18, // Higher zoom for better detail
        duration: 1000
      });
      
      // Open popup for selected booking
      const popup = popups.current[selectedBooking.id];
      if (popup) {
        popup.addTo(map.current);
      }
    }
  }, [selectedBooking, mapInitialized]);

  if (isLoadingToken) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <span className="ml-2">Loading map...</span>
      </div>
    );
  }

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div className="text-center p-6">
          <h3 className="text-lg font-medium text-gray-900">Mapbox API Key Required</h3>
          <p className="mt-2 text-sm text-gray-500">
            Please add the MAPBOX_PUBLIC_TOKEN secret to your Supabase project.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full rounded-lg overflow-hidden relative">
      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button
          onClick={toggle3D}
          size="sm"
          variant={is3DEnabled ? "default" : "outline"}
          className="bg-white/90 backdrop-blur-sm shadow-md"
        >
          <Mountain className="h-4 w-4 mr-1" />
          3D Terrain
        </Button>
        
        <Button
          onClick={toggleMeasuring}
          size="sm"
          variant={isMeasuring ? "default" : "outline"}
          className="bg-white/90 backdrop-blur-sm shadow-md"
        >
          <Ruler className="h-4 w-4 mr-1" />
          Measure
        </Button>
        
        <Button
          onClick={resetView}
          size="sm"
          variant="outline"
          className="bg-white/90 backdrop-blur-sm shadow-md"
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          Reset
        </Button>
      </div>

      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default MapComponent;
