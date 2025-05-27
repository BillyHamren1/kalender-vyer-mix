
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Ruler, Satellite, Map } from 'lucide-react';

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
  const [isSatelliteView, setIsSatelliteView] = useState(true);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementPoints, setMeasurementPoints] = useState<number[][]>([]);
  const [totalDistance, setTotalDistance] = useState(0);

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
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // Start with satellite view
      center: [0, 0],
      zoom: 2,
      minZoom: 0,
      maxZoom: 22, // Very high zoom level for detailed measurements
      pitch: 0,
      bearing: 0
    });

    // Enhanced navigation controls
    map.current.addControl(new mapboxgl.NavigationControl({
      showCompass: true,
      showZoom: true,
      visualizePitch: true
    }), 'top-right');

    // Add fullscreen control
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    // Add scale control for distance reference
    map.current.addControl(new mapboxgl.ScaleControl({
      maxWidth: 200,
      unit: 'metric'
    }), 'bottom-left');
    
    map.current.on('load', () => {
      setMapInitialized(true);
      
      // Add sources and layers for measurement
      map.current!.addSource('measurement-points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      map.current!.addSource('measurement-line', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });
      
      // Add layer for measurement line
      map.current!.addLayer({
        id: 'measurement-line',
        type: 'line',
        source: 'measurement-line',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff0000',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });
      
      // Add layer for measurement points
      map.current!.addLayer({
        id: 'measurement-points',
        type: 'circle',
        source: 'measurement-points',
        paint: {
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

  // Calculate distance between two points using Haversine formula
  const calculateDistance = (point1: number[], point2: number[]) => {
    const R = 6371000; // Earth's radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const deltaLat = (point2[1] - point1[1]) * Math.PI / 180;
    const deltaLng = (point2[0] - point1[0]) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Handle measurement tool
  const toggleMeasurement = () => {
    if (!map.current) return;
    
    if (isMeasuring) {
      // Stop measuring
      setIsMeasuring(false);
      setMeasurementPoints([]);
      setTotalDistance(0);
      
      // Clear measurement data
      (map.current.getSource('measurement-points') as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: []
      });
      
      (map.current.getSource('measurement-line') as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: []
      });
      
      map.current.off('click', handleMeasurementClick);
      map.current.getCanvas().style.cursor = '';
      toast.info('Measurement stopped');
    } else {
      // Start measuring
      setIsMeasuring(true);
      setMeasurementPoints([]);
      setTotalDistance(0);
      map.current.on('click', handleMeasurementClick);
      map.current.getCanvas().style.cursor = 'crosshair';
      toast.info('Click on the map to start measuring distances');
    }
  };

  const handleMeasurementClick = (e: mapboxgl.MapMouseEvent) => {
    if (!map.current) return;
    
    const newPoint = [e.lngLat.lng, e.lngLat.lat];
    const newPoints = [...measurementPoints, newPoint];
    setMeasurementPoints(newPoints);
    
    // Calculate total distance
    let distance = 0;
    for (let i = 1; i < newPoints.length; i++) {
      distance += calculateDistance(newPoints[i - 1], newPoints[i]);
    }
    setTotalDistance(distance);
    
    // Update points on map
    (map.current.getSource('measurement-points') as mapboxgl.GeoJSONSource)?.setData({
      type: 'FeatureCollection',
      features: newPoints.map(point => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point
        },
        properties: {}
      }))
    });
    
    // Update line on map
    if (newPoints.length > 1) {
      (map.current.getSource('measurement-line') as mapboxgl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: newPoints
          },
          properties: {}
        }]
      });
    }
    
    // Show distance popup
    if (distance > 0) {
      const distanceText = distance > 1000 
        ? `${(distance / 1000).toFixed(2)} km`
        : `${distance.toFixed(2)} m`;
      
      new mapboxgl.Popup({ closeOnClick: false })
        .setLngLat(e.lngLat)
        .setHTML(`<div class="text-sm font-medium">Distance: ${distanceText}</div>`)
        .addTo(map.current);
    }
  };

  const toggleMapStyle = () => {
    if (!map.current) return;
    
    const newStyle = isSatelliteView 
      ? 'mapbox://styles/mapbox/streets-v12'
      : 'mapbox://styles/mapbox/satellite-streets-v12';
    
    map.current.setStyle(newStyle);
    setIsSatelliteView(!isSatelliteView);
  };

  // Add or update markers when bookings change
  useEffect(() => {
    if (!map.current || !mapInitialized || !bookings.length) return;

    // Clear existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    // Clear existing popups
    Object.values(popups.current).forEach(popup => popup.remove());
    popups.current = {};

    // Bounds to fit all markers
    const bounds = new mapboxgl.LngLatBounds();
    
    // Add new markers
    bookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;
      
      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div>
          <h3 class="font-bold">${booking.client}</h3>
          <p>Booking #${booking.id}</p>
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
        padding: 50,
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

  const formatDistance = (distance: number) => {
    return distance > 1000 
      ? `${(distance / 1000).toFixed(2)} km`
      : `${distance.toFixed(2)} m`;
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden relative">
      {/* Map Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <Button
          onClick={toggleMapStyle}
          variant="outline"
          size="sm"
          className="bg-white/90 backdrop-blur-sm"
        >
          {isSatelliteView ? <Map className="h-4 w-4 mr-2" /> : <Satellite className="h-4 w-4 mr-2" />}
          {isSatelliteView ? 'Street View' : 'Satellite'}
        </Button>
        
        <Button
          onClick={toggleMeasurement}
          variant={isMeasuring ? "default" : "outline"}
          size="sm"
          className="bg-white/90 backdrop-blur-sm"
        >
          <Ruler className="h-4 w-4 mr-2" />
          {isMeasuring ? 'Stop Measuring' : 'Measure Distance'}
        </Button>
        
        {isMeasuring && totalDistance > 0 && (
          <div className="bg-white/90 backdrop-blur-sm p-2 rounded text-sm font-medium">
            Total: {formatDistance(totalDistance)}
          </div>
        )}
      </div>
      
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default MapComponent;
