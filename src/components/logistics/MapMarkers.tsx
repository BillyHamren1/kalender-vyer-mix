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

  // Function to create classic pin SVG
  const createPinElement = (isSelected: boolean) => {
    const color = isSelected ? '#3b82f6' : '#ef4444';
    const shadowColor = isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    
    const el = document.createElement('div');
    el.className = 'marker-pin';
    el.style.width = '24px';
    el.style.height = '36px';
    el.style.cursor = 'pointer';
    el.style.transition = 'all 0.2s ease';
    el.style.filter = `drop-shadow(0 4px 8px ${shadowColor})`;
    
    el.innerHTML = `
      <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Pin stem -->
        <rect x="11" y="18" width="2" height="18" fill="${color}" />
        <!-- Pin head (circle) -->
        <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2" />
        <!-- Inner white circle -->
        <circle cx="12" cy="12" r="4" fill="white" />
      </svg>
    `;
    
    // Add hover effect
    el.addEventListener('mouseenter', () => {
      el.style.transform = 'scale(1.1) translateY(-2px)';
      el.style.filter = `drop-shadow(0 6px 12px ${shadowColor})`;
    });
    
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'scale(1) translateY(0)';
      el.style.filter = `drop-shadow(0 4px 8px ${shadowColor})`;
    });
    
    return el;
  };

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
      
      // Create modern pin element
      const el = createPinElement(selectedBooking?.id === booking.id);
      
      // Add click handler directly to marker element
      el.addEventListener('click', () => {
        onBookingSelect(booking);
      });
      
      const marker = new mapboxgl.Marker(el, { anchor: 'bottom' })
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
