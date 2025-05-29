// ⬇ hela filen (endast snapshot-funktion uppdaterad här)
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
  const [snapshotImageUrl, setSnapshotImageUrl] = useState<string>('');
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);

  const takeMapSnapshot = async () => {
    if (!map.current || !selectedBooking) {
      toast.error('No booking selected for snapshot');
      return;
    }

    try {
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
        return;
      }

      setSnapshotImageUrl(data.url);      // 👈 sätt bilden först
      setShowSnapshotModal(true);         // 👈 visa modal sen
      toast.success('Snapshot captured');

      if (onSnapshotSaved && data.attachment) {
        onSnapshotSaved(data.attachment);
      }

    } catch (error) {
      console.error('Snapshot error:', error);
      toast.error('Snapshot failed');
    }
  };

  return (
    <>
      {/* ...din karta här... */}
      <SnapshotPreviewModal
        isOpen={showSnapshotModal}
        onClose={() => setShowSnapshotModal(false)}
        imageData={snapshotImageUrl}
        onSave={() => {}}
        bookingNumber={selectedBooking?.bookingNumber}
      />
    </>
  );
};

export default MapComponent;
