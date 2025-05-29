import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { Booking } from '@/types/booking';
import { getDisplayBookingNumber } from './MapUtils';

interface MapMarkersProps {
  map: React.MutableRefObject<mapboxgl.Map | null>;
  bookings: Booking[];
  selectedBooking: Booking | null;
  onBookingSelect: (booking: Booking) => void;
  mapInitialized: boolean;
  centerLat?: number;
  centerLng?: number;
}

export const MapMarkers: React.FC<MapMarkersProps> = ({
  map,
  bookings,
  selectedBooking,
  onBookingSelect,
  mapInitialized,
  centerLat,
  centerLng
}) => {
  const markers = useRef<mapboxgl.Marker[]>([]);
  const popups = useRef<{[key: string]: mapboxgl.Popup}>({});

  // Add or update markers when bookings change
  useEffect(() => {
    if (!map.current || !mapInitialized) return;

    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    
    Object.values(popups.current).forEach(popup => popup.remove());
    popups.current = {};

    if (!bookings.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    
    bookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;
      
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

      const el = document.createElement('div');
      el.className = 'marker';
      el.style.width = '25px';
      el.style.height = '25px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = selectedBooking?.id === booking.id ? '#3b82f6' : '#ef4444';
      el.style.cursor = 'pointer';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 0 2px rgba(0, 0, 0, 0.1)';
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat([booking.deliveryLongitude, booking.deliveryLatitude])
        .setPopup(popup)
        .addTo(map.current!);
      
      markers.current.push(marker);
      bounds.extend([booking.deliveryLongitude, booking.deliveryLatitude]);
    });

    if (!bounds.isEmpty() && !centerLat && !centerLng) {
      map.current.fitBounds(bounds, {
        padding: 100,
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [bookings, selectedBooking, mapInitialized, centerLat, centerLng]);

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

  useEffect(() => {
    if (!map.current || !selectedBooking || !mapInitialized) return;
    
    if (selectedBooking.deliveryLatitude && selectedBooking.deliveryLongitude) {
      map.current.flyTo({
        center: [selectedBooking.deliveryLongitude, selectedBooking.deliveryLatitude],
        zoom: 15, // Changed to 15 for proper 20m detail
        duration: 1000
      });
      
      const popup = popups.current[selectedBooking.id];
      if (popup) {
        popup.addTo(map.current);
      }
    }
  }, [selectedBooking, mapInitialized]);

  return null; // This component only manages markers, doesn't render JSX
};
