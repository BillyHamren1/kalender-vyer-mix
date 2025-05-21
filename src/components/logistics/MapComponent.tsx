
import React, { useRef, useEffect, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Booking } from '@/types/booking';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [0, 0], // Default to world view
      zoom: 1
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    map.current.on('load', () => {
      setMapInitialized(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, isLoadingToken]);

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
        zoom: 15,
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
    <div className="h-full w-full rounded-lg overflow-hidden">
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
};

export default MapComponent;
