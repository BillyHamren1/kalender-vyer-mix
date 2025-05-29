
import React, { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { Booking } from '@/types/booking';

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

  // Add or update markers when bookings change
  useEffect(() => {
    if (!map.current || !mapInitialized) return;

    // Remove existing markers
    markers.current.forEach(marker => marker.remove());
    markers.current = [];

    if (!bookings.length) return;

    const bounds = new mapboxgl.LngLatBounds();
    
    bookings.forEach(booking => {
      if (!booking.deliveryLatitude || !booking.deliveryLongitude) return;
      
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
      el.style.transition = 'all 0.2s ease';
      
      // Add hover effect
      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.1)';
      });
      
      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });
      
      // Add click handler directly to marker element
      el.addEventListener('click', () => {
        onBookingSelect(booking);
      });
      
      const marker = new mapboxgl.Marker(el)
        .setLngLat([booking.deliveryLongitude, booking.deliveryLatitude])
        .addTo(map.current!);
      
      markers.current.push(marker);
      bounds.extend([booking.deliveryLongitude, booking.deliveryLatitude]);
    });

    // Fit bounds only if no specific center coordinates are provided
    if (!bounds.isEmpty() && !centerLat && !centerLng) {
      map.current.fitBounds(bounds, {
        padding: 100,
        maxZoom: 15,
        duration: 1000
      });
    }
  }, [bookings, selectedBooking, mapInitialized, centerLat, centerLng, onBookingSelect]);

  // Fly to selected booking location
  useEffect(() => {
    if (!map.current || !selectedBooking || !mapInitialized) return;
    
    if (selectedBooking.deliveryLatitude && selectedBooking.deliveryLongitude) {
      map.current.flyTo({
        center: [selectedBooking.deliveryLongitude, selectedBooking.deliveryLatitude],
        zoom: 12, // Use the same zoom level as the initial zoom
        duration: 1000
      });
    }
  }, [selectedBooking, mapInitialized]);

  return null; // This component only manages markers, doesn't render JSX
};
