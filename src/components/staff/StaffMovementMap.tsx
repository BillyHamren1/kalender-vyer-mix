import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { Loader2, MapPin } from 'lucide-react';

interface MovementPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  recorded_at: string;
}

interface StaffMovementMapProps {
  staffId: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** Optional time-window filter (ISO timestamps). */
  fromIso?: string | null;
  toIso?: string | null;
  className?: string;
}

/**
 * Admin map showing a single staff member's GPS trail for a specific day.
 * Reads from staff_location_history via the mobile-app-api.
 *
 * Retention: history is removed ~7 days after the related time report is
 * approved, so very old reports may show "no data".
 */
export const StaffMovementMap = ({ staffId, date, fromIso, toIso, className }: StaffMovementMapProps) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [allPoints, setAllPoints] = useState<MovementPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load points
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    mobileApi
      .getMovementForDay(staffId, date)
      .then((res) => {
        if (cancelled) return;
        setAllPoints(res.points || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Kunde inte ladda rörelsehistorik');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [staffId, date]);

  // Optional time-window filter — invalid bounds are ignored (don't blank the map)
  const points = useMemo(() => {
    const fromMs = fromIso ? new Date(fromIso).getTime() : NaN;
    const toMs = toIso ? new Date(toIso).getTime() : NaN;
    const hasFrom = Number.isFinite(fromMs);
    const hasTo = Number.isFinite(toMs);
    if (!hasFrom && !hasTo) return allPoints;
    return allPoints.filter(p => {
      const t = new Date(p.recorded_at).getTime();
      if (hasFrom && t < fromMs) return false;
      if (hasTo && t > toMs) return false;
      return true;
    });
  }, [allPoints, fromIso, toIso]);

  // Init map + draw polyline
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!mapContainer.current || points.length === 0) return;

      try {
        const { data } = await supabase.functions.invoke('mapbox-token');
        if (cancelled || !data?.token) return;
        if (!mapContainer.current) return;
        mapboxgl.accessToken = data.token;

        if (map.current) {
          map.current.remove();
          map.current = null;
        }

        const coords: [number, number][] = points.map((p) => [p.lng, p.lat]);
        const center = coords[Math.floor(coords.length / 2)];

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center,
          zoom: 13,
          attributionControl: false,
        });
        map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        map.current.on('load', () => {
          if (!map.current || cancelled) return;

          map.current.addSource('trail', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: coords },
            },
          });
          map.current.addLayer({
            id: 'trail-line',
            type: 'line',
            source: 'trail',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': 'hsl(217, 91%, 60%)',
              'line-width': 4,
              'line-opacity': 0.8,
            },
          });

          // Show ALL raw pings — no downsampling. Admins need full evidence
          // of movement (or lack of it). Clustering is kept very tight so
          // individual pings stay visible even when the person is stationary.
          const sampledPings: MovementPoint[] = points;
          map.current.addSource('pings', {
            type: 'geojson',
            cluster: true,
            clusterRadius: 8,
            clusterMaxZoom: 22,
            data: {
              type: 'FeatureCollection',
              features: sampledPings.map((p) => ({
                type: 'Feature',
                properties: {
                  time: new Date(p.recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
                },
                geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
              })),
            },
          });
          // Clusters (overlapping pings)
          map.current.addLayer({
            id: 'ping-clusters',
            type: 'circle',
            source: 'pings',
            filter: ['has', 'point_count'],
            paint: {
              'circle-radius': ['step', ['get', 'point_count'], 12, 5, 16, 20, 20],
              'circle-color': 'hsl(48, 96%, 53%)',
              'circle-stroke-color': 'hsl(0, 0%, 20%)',
              'circle-stroke-width': 1.5,
              'circle-opacity': 0.95,
            },
          });
          map.current.addLayer({
            id: 'ping-cluster-count',
            type: 'symbol',
            source: 'pings',
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
              'text-allow-overlap': true,
            },
            paint: {
              'text-color': 'hsl(0, 0%, 15%)',
            },
          });
          // Single (unclustered) pings
          map.current.addLayer({
            id: 'ping-dots',
            type: 'circle',
            source: 'pings',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 4,
              'circle-color': 'hsl(48, 96%, 53%)',
              'circle-stroke-color': 'hsl(0, 0%, 20%)',
              'circle-stroke-width': 1,
              'circle-opacity': 0.95,
            },
          });
          map.current.addLayer({
            id: 'ping-labels',
            type: 'symbol',
            source: 'pings',
            filter: ['!', ['has', 'point_count']],
            layout: {
              'text-field': ['get', 'time'],
              'text-size': 11,
              'text-offset': [0, -1.1],
              'text-anchor': 'bottom',
              'text-allow-overlap': false,
              'text-ignore-placement': false,
              'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            },
            paint: {
              'text-color': 'hsl(0, 0%, 15%)',
              'text-halo-color': 'hsl(0, 0%, 100%)',
              'text-halo-width': 1.5,
            },
          });
          // Click cluster to zoom in
          map.current.on('click', 'ping-clusters', (e) => {
            const f = e.features?.[0];
            const clusterId = (f?.properties as any)?.cluster_id;
            const src = map.current?.getSource('pings') as mapboxgl.GeoJSONSource | undefined;
            if (!src || clusterId == null || !f) return;
            src.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err || !map.current) return;
              const [lng, lat] = (f.geometry as any).coordinates;
              map.current.easeTo({ center: [lng, lat], zoom: Math.max(zoom ?? 15, 17) });
            });
          });
          map.current.on('click', 'ping-dots', (e) => {
            const f = e.features?.[0];
            if (!f || !map.current) return;
            const [lng, lat] = (f.geometry as any).coordinates;
            new mapboxgl.Popup({ offset: 8 })
              .setLngLat([lng, lat])
              .setHTML(`<strong>Ping</strong><br/>${(f.properties as any).time}`)
              .addTo(map.current);
          });
          map.current.on('mouseenter', 'ping-dots', () => {
            if (map.current) map.current.getCanvas().style.cursor = 'pointer';
          });
          map.current.on('mouseleave', 'ping-dots', () => {
            if (map.current) map.current.getCanvas().style.cursor = '';
          });

          // Start marker (green)
          new mapboxgl.Marker({ color: 'hsl(142, 71%, 45%)' })
            .setLngLat(coords[0])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>Start</strong><br/>${new Date(points[0].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
              )
            )
            .addTo(map.current);

          // End marker (red)
          const last = points[points.length - 1];
          new mapboxgl.Marker({ color: 'hsl(0, 84%, 60%)' })
            .setLngLat(coords[coords.length - 1])
            .setPopup(
              new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<strong>Senaste position</strong><br/>${new Date(last.recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`
              )
            )
            .addTo(map.current);

          // Fit bounds
          const bounds = coords.reduce(
            (b, c) => b.extend(c as [number, number]),
            new mapboxgl.LngLatBounds(coords[0], coords[0])
          );
          map.current.fitBounds(bounds, { padding: 60, maxZoom: 16 });
        });
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Karta kunde inte initieras');
      }
    };

    init();

    return () => {
      cancelled = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [points]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted rounded-lg ${className || 'h-[400px]'}`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted rounded-lg p-6 ${className || 'h-[400px]'}`}>
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted rounded-lg p-6 gap-2 ${className || 'h-[400px]'}`}>
        <MapPin className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Ingen rörelsehistorik för denna dag.
          <br />
          <span className="text-xs">(Kan ha rensats efter att tidrapporten godkänts)</span>
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapContainer} className={`rounded-lg overflow-hidden ${className || 'h-[400px]'}`} />
      <div className="absolute top-2 left-2 bg-background/95 backdrop-blur px-3 py-1.5 rounded-md text-xs font-medium shadow-md">
        {points.length} positioner • {new Date(points[0].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
        {' – '}
        {new Date(points[points.length - 1].recorded_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
};
