import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface AddressMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  coords: { lat: number; lng: number } | null;
}

/**
 * Liten karta som visar en pin på given koordinat och adress.
 * Faller tillbaka till "Öppna i Google Maps" om token saknas.
 */
export const AddressMapDialog: React.FC<AddressMapDialogProps> = ({ open, onOpenChange, address, coords }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (token || tokenError) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        if (!cancelled && data?.token) {
          mapboxgl.accessToken = data.token;
          setToken(data.token);
        } else if (!cancelled) {
          setTokenError(true);
        }
      } catch {
        if (!cancelled) setTokenError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, token, tokenError]);

  useEffect(() => {
    if (!open || !token || !coords || !mapContainer.current) return;
    if (mapRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [coords.lng, coords.lat],
      zoom: 15,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    new mapboxgl.Marker({ color: 'hsl(var(--primary))' })
      .setLngLat([coords.lng, coords.lat])
      .addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [open, token, coords]);

  // Reset map when closing so it re-inits next open
  useEffect(() => {
    if (!open && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }
  }, [open]);

  const gmapsUrl = coords
    ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            {address}
          </DialogTitle>
        </DialogHeader>

        {coords && !tokenError ? (
          <div ref={mapContainer} className="h-[400px] w-full rounded-lg overflow-hidden border" />
        ) : (
          <div className="h-[200px] w-full rounded-lg border border-dashed flex items-center justify-center text-sm text-muted-foreground">
            {coords ? 'Karta kunde inte laddas' : 'Inga koordinater för denna punkt'}
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={gmapsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Öppna i Google Maps
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
