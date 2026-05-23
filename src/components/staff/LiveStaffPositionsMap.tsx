/**
 * LiveStaffPositionsMap — visar senaste kända position för all aktiv personal.
 *
 * Källa: `staff_location_history` (råalager för GPS). Hämtar senaste pingen per
 * staff_id från de senaste 24h, och kombinerar med staff_members för namn.
 * Auto-refresh var 20:e sekund + realtime-listener på nya pings.
 *
 * Detta är en ren "var är alla NU"-vy, separat från dagsspecifika kartor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { fetchStaffMembers } from '@/services/staffService';

interface LivePosition {
  staff_id: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  recorded_at: string;
  battery_percent: number | null;
  ageMinutes: number;
}

const STALE_AFTER_MIN = 15;
const OFFLINE_AFTER_MIN = 60;
const REFRESH_MS = 20_000;
const LOOKBACK_HOURS = 24;

function statusColor(ageMinutes: number): string {
  if (ageMinutes <= STALE_AFTER_MIN) return '#22c55e';
  if (ageMinutes <= OFFLINE_AFTER_MIN) return '#eab308';
  return '#9ca3af';
}

export default function LiveStaffPositionsMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const tokenRef = useRef<string | null>(null);

  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);

  const loadPositions = useCallback(async () => {
    try {
      const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();
      const [staff, history] = await Promise.all([
        fetchStaffMembers(),
        supabase
          .from('staff_location_history')
          .select('staff_id, lat, lng, accuracy, recorded_at, battery_percent')
          .gte('recorded_at', sinceIso)
          .order('recorded_at', { ascending: false })
          .limit(5000),
      ]);
      if (history.error) throw history.error;

      // Senaste ping per staff_id
      const latestByStaff = new Map<string, NonNullable<typeof history.data>[number]>();
      for (const row of history.data ?? []) {
        if (!latestByStaff.has(row.staff_id)) latestByStaff.set(row.staff_id, row);
      }

      const nameById = new Map(staff.map((s) => [s.id, s.name]));
      const now = Date.now();
      const list: LivePosition[] = [];
      for (const [staffId, row] of latestByStaff.entries()) {
        const name = nameById.get(staffId);
        if (!name) continue; // visa endast aktiva staff
        const ageMs = now - new Date(row.recorded_at).getTime();
        list.push({
          staff_id: staffId,
          name,
          lat: Number(row.lat),
          lng: Number(row.lng),
          accuracy: row.accuracy != null ? Number(row.accuracy) : null,
          recorded_at: row.recorded_at,
          battery_percent: row.battery_percent ?? null,
          ageMinutes: Math.floor(ageMs / 60_000),
        });
      }
      list.sort((a, b) => a.ageMinutes - b.ageMinutes);
      setPositions(list);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Kunde inte ladda positioner');
    } finally {
      setLoading(false);
    }
  }, []);

  const [styleLoaded, setStyleLoaded] = useState(false);

  // Init map
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      if (!mapContainer.current || mapRef.current) return;
      try {
        const { data } = await supabase.functions.invoke('mapbox-token');
        if (cancelled || !data?.token || !mapContainer.current) return;
        tokenRef.current = data.token;
        mapboxgl.accessToken = data.token;
        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/satellite-streets-v12',
          center: [18.0686, 59.3293], // Stockholm
          zoom: 9,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.on('load', () => {
          requestAnimationFrame(() => map.resize());
          setStyleLoaded(true);
        });
        // Håll canvas i synk med container-storlek (fix för "grå/vit karta" i tabs)
        ro = new ResizeObserver(() => {
          try { map.resize(); } catch { /* removed */ }
        });
        ro.observe(mapContainer.current);
      } catch (e) {
        console.error('[LiveStaffPositionsMap] map init failed', e);
      }
    })();
    return () => {
      cancelled = true;
      ro?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setStyleLoaded(false);
    };
  }, []);

  // Initial + interval refresh
  useEffect(() => {
    loadPositions();
    const id = setInterval(loadPositions, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadPositions]);

  // Realtime: invalidate on new pings
  useEffect(() => {
    const ch = supabase
      .channel('live-staff-positions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_location_history' },
        () => loadPositions(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loadPositions]);

  // Render markers (vänta tills style laddat)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const seen = new Set<string>();
    for (const p of positions) {
      seen.add(p.staff_id);
      const color = statusColor(p.ageMinutes);
      let marker = markersRef.current.get(p.staff_id);
      if (!marker) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 28px; height: 28px; border-radius: 9999px;
          border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
          background: ${color}; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: white;
        `;
        el.textContent = p.name.charAt(0).toUpperCase();
        el.title = p.name;
        el.onclick = () => setSelectedStaffId(p.staff_id);
        marker = new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.set(p.staff_id, marker);
      } else {
        marker.setLngLat([p.lng, p.lat]);
        const el = marker.getElement();
        el.style.background = color;
        el.title = p.name;
      }
    }
    for (const [id, m] of markersRef.current.entries()) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    // Auto-fit första gången vi har positioner
    if (positions.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      positions.forEach((p) => bounds.extend([p.lng, p.lat]));
      if (map.getZoom() < 10) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 600 });
      }
    }
  }, [positions, styleLoaded]);

  // Pan to selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStaffId) return;
    const p = positions.find((x) => x.staff_id === selectedStaffId);
    if (!p) return;
    map.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 800 });
  }, [selectedStaffId, positions]);

  const stats = useMemo(() => {
    let online = 0, stale = 0, offline = 0;
    for (const p of positions) {
      if (p.ageMinutes <= STALE_AFTER_MIN) online++;
      else if (p.ageMinutes <= OFFLINE_AFTER_MIN) stale++;
      else offline++;
    }
    return { online, stale, offline, total: positions.length };
  }, [positions]);

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full">
      {/* Vänster: lista */}
      <div className="md:w-80 shrink-0 planning-card overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[hsl(270_20%_90%)] bg-[hsl(270_35%_98%)]">
          <div className="flex items-center justify-between mb-2">
            <span className="planning-section-title">Live-positioner</span>
            <button
              onClick={() => loadPositions()}
              className="text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              title="Uppdatera nu"
            >
              <RefreshCw className="h-3 w-3" /> Uppdatera
            </button>
          </div>
          <div className="flex gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Live {stats.online}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Gammal {stats.stale}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gray-400" /> Offline {stats.offline}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Senast uppdaterad {formatDistanceToNow(lastRefresh, { addSuffix: true, locale: sv })}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && positions.length === 0 && (
            <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Laddar…
            </div>
          )}
          {error && (
            <div className="p-4 text-xs text-red-600">{error}</div>
          )}
          {!loading && positions.length === 0 && !error && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Ingen personal har skickat GPS de senaste {LOOKBACK_HOURS}h.
            </div>
          )}
          <ul className="divide-y divide-[hsl(270_18%_94%)]">
            {positions.map((p) => {
              const isSelected = p.staff_id === selectedStaffId;
              const live = p.ageMinutes <= STALE_AFTER_MIN;
              return (
                <li key={p.staff_id}>
                  <button
                    onClick={() => setSelectedStaffId(p.staff_id)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-[hsl(270_35%_98%)] transition ${
                      isSelected ? 'bg-[hsl(270_50%_96%)]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{p.name}</span>
                      {live ? (
                        <Wifi className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <WifiOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      <span>{formatDistanceToNow(new Date(p.recorded_at), { addSuffix: true, locale: sv })}</span>
                      {p.battery_percent != null && <span>· 🔋 {p.battery_percent}%</span>}
                      {p.accuracy != null && <span>· ±{Math.round(p.accuracy)}m</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Karta */}
      <div className="flex-1 min-w-0 planning-card relative h-[70vh] min-h-[460px] overflow-hidden p-0">
        <div ref={mapContainer} className="absolute inset-0" />
      </div>
    </div>
  );
}
