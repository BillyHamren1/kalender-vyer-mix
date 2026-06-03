import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Users, Briefcase, Navigation, MessageCircle, Camera, Maximize2, Minimize2, Map as MapIcon, Satellite, Clock, Wifi, Building2, Crosshair, LocateFixed, X as XIcon, ZoomIn } from 'lucide-react';
import { StaffLocation } from '@/services/planningDashboardService';
import { OpsMapJob } from '@/services/opsControlService';
import { useNavigate } from 'react-router-dom';
import { sendAdminMessage } from '@/services/staffDashboardService';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useTrafficCameras, TrafficCamera } from '@/hooks/useTrafficCameras';
import { fetchOrganizationLocations, OrganizationLocation } from '@/services/organizationLocationService';

interface Props {
  locations: StaffLocation[];
  mapJobs: OpsMapJob[];
  isLoading: boolean;
  focusCoords?: { lat: number; lng: number } | null;
  onOpenDM?: (staffId: string, staffName: string) => void;
  routePolyline?: GeoJSON.LineString | null;
}

type StaffStatus = 'on_site' | 'on_way' | 'planned' | 'idle' | 'stale' | 'offline';

const STALE_MS = 10 * 60 * 1000;

function getStaffStatus(loc: StaffLocation, mapJobs: OpsMapJob[]): StaffStatus {
  if (loc.isOffline) return 'offline';
  const lastSeenMs = loc.lastReportTime ? Date.now() - new Date(loc.lastReportTime).getTime() : Infinity;
  if (loc.isWorking) return 'on_site';
  if (lastSeenMs > STALE_MS) return 'stale';
  const job = mapJobs.find(j => j.bookingId === loc.bookingId);
  if (job?.isActive) return 'on_way';
  if (loc.bookingId) return 'planned';
  return 'idle';
}

const statusStyles: Record<StaffStatus, { color: string; label: string }> = {
  on_site: { color: '#22c55e', label: 'På plats' },
  on_way:  { color: '#eab308', label: 'På väg' },
  planned: { color: '#38bdf8', label: 'Planerad' },
  idle:    { color: '#9ca3af', label: 'Inaktiv' },
  stale:   { color: '#f97316', label: 'Saknar GPS' },
  offline: { color: '#6b7280', label: 'Offline' },
};

// Job phase classification — drives premium pin coloring
type JobPhase = 'build' | 'teardown' | 'event' | 'other';
const phaseStyles: Record<JobPhase, { fill: string; ring: string; label: string; icon: string }> = {
  // Lucide-style SVG paths (24x24 viewBox) — drawn in white inside the pin
  build:    { fill: '#15803d', ring: '#bbf7d0', label: 'Bygg / Rig',     icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
  teardown: { fill: '#b91c1c', ring: '#fecaca', label: 'Riv / Rigdown',  icon: '<path d="M3 3l18 18M14.5 6.5L18 10l-3.5 3.5M9.5 17.5L6 14l3.5-3.5"/>' },
  event:    { fill: '#b45309', ring: '#fde68a', label: 'Event',          icon: '<path d="M5 3v18l7-3 7 3V3z"/>' },
  other:    { fill: '#6d28d9', ring: '#ddd6fe', label: 'Övrigt',         icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>' },
};

function classifyJobPhase(eventType: string | null | undefined): JobPhase {
  const t = (eventType || '').toLowerCase();
  if (/(rig\s*down|rigdown|teardown|riv|nedrig|nedmont)/.test(t)) return 'teardown';
  if (/(rig|bygg|build|mont|uppst|setup|laddning|leverans)/.test(t)) return 'build';
  if (/(event|show|gig|live)/.test(t)) return 'event';
  return 'other';
}

function getFirstName(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '?';
}

const STAFF_SOURCE_ID = 'ops-staff-source';
const STAFF_HIGHLIGHT_LAYER_ID = 'ops-staff-highlight-layer';
const STAFF_MARKER_LAYER_ID = 'ops-staff-marker-layer';
const STAFF_LABEL_LAYER_ID = 'ops-staff-label-layer';
const STAFF_GPS_DOT_LAYER_ID = 'ops-staff-gps-dot-layer';

const MAP_STYLES = {
  streets: 'mapbox://styles/mapbox/navigation-day-v1',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const;


const OpsLiveMap = ({ locations, mapJobs, isLoading, focusCoords, onOpenDM, routePolyline }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const staffMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const jobMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const cameraMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);
  const orgLocMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedJob, setSelectedJob] = useState<OpsMapJob | null>(null);
  const [staffPanel, setStaffPanel] = useState<StaffLocation | null>(null);
  const [quickMsg, setQuickMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [showCameras, setShowCameras] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('satellite');
  const [styleRevision, setStyleRevision] = useState(0);
  const [orgLocations, setOrgLocations] = useState<OrganizationLocation[]>([]);
  const [showOrgLocations, setShowOrgLocations] = useState(true);
  const [showStaff, setShowStaff] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [followStaffId, setFollowStaffId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { cameras, isLoading: camerasLoading, fetchCameras } = useTrafficCameras();

  // Hover tooltip state for staff/clusters on the map
  const [hoverTip, setHoverTip] = useState<{
    x: number;
    y: number;
    members: Array<{ id: string; name: string; status: StaffStatus; teamName?: string | null; lastSeen?: string | null; isOffline?: boolean }>;
  } | null>(null);

  // Cluster picker (shown when user clicks a cluster but cannot zoom further)
  const [clusterPicker, setClusterPicker] = useState<{
    x: number;
    y: number;
    members: StaffLocation[];
  } | null>(null);

  // Init map
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error || !data?.token || cancelled) return;
        mapboxgl.accessToken = data.token;
        if (!mapContainer.current || map.current) return;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: MAP_STYLES.satellite,
          center: [15.5, 58.5],
          zoom: 5,
          // Use mercator (flat) projection — globe causes HTML markers to drift
          // visually at low zoom because they're screen-projected, not on the
          // curved surface. Mercator keeps markers locked to their lng/lat.
          projection: 'mercator',
          attributionControl: false,
        });
        {
          const m = map.current;
          if (m) {
            m.scrollZoom.enable();
            m.boxZoom.enable();
            m.dragRotate.enable();
            m.dragPan.enable();
            m.keyboard.enable();
            m.doubleClickZoom.enable();
            m.touchZoomRotate.enable();
          }
          console.debug('[OpsLiveMap] Map interactions enabled', {
            scrollZoom: true,
            dragPan: true,
            doubleClickZoom: true,
            touchZoomRotate: true,
          });
        }
        map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
        map.current.on('load', () => {
          if (!cancelled) {
            setMapReady(true);
            setStyleRevision(prev => prev + 1);
          }
        });
        map.current.on('style.load', () => {
          if (!cancelled) setStyleRevision(prev => prev + 1);
        });
      } catch { /* silent */ }
    };
    init();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  // Fetch organization locations
  useEffect(() => {
    fetchOrganizationLocations().then(setOrgLocations).catch(() => {});
  }, []);

  // Clear all markers
  const clearMarkers = useCallback(() => {
    staffMarkersRef.current.forEach(m => m.remove());
    staffMarkersRef.current = [];
    jobMarkersRef.current.forEach(m => m.remove());
    jobMarkersRef.current = [];
    popupsRef.current.forEach(p => p.remove());
    popupsRef.current = [];
  }, []);


  const clearCameraMarkers = useCallback(() => {
    cameraMarkersRef.current.forEach(m => m.remove());
    cameraMarkersRef.current = [];
  }, []);


  // Toggle cameras
  const handleToggleCameras = useCallback(async () => {
    if (showCameras) {
      setShowCameras(false);
      clearCameraMarkers();
    } else {
      setShowCameras(true);
      await fetchCameras();
    }
  }, [showCameras, fetchCameras, clearCameraMarkers]);

  // Render camera markers
  useEffect(() => {
    if (!mapReady || !map.current || !showCameras || cameras.length === 0) {
      if (!showCameras) clearCameraMarkers();
      return;
    }
    clearCameraMarkers();

    cameras.forEach(cam => {
      const el = document.createElement('div');
      el.style.cssText = `
        width: 22px; height: 22px; border-radius: 50%;
        background: #3b82f6; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      `;
      el.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>`;

      const popup = new mapboxgl.Popup({ offset: 15, maxWidth: '320px', closeButton: true })
        .setHTML(`
          <div style="font-family: system-ui, sans-serif;">
            <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">${cam.name}</div>
            ${cam.direction ? `<div style="font-size: 10px; color: #6b7280; margin-bottom: 4px;">${cam.direction}</div>` : ''}
            <img src="${cam.photoUrl}" alt="${cam.name}" style="width: 100%; border-radius: 6px; margin-top: 4px;" loading="lazy" onerror="this.style.display='none'" />
            ${cam.photoTime ? `<div style="font-size: 9px; color: #9ca3af; margin-top: 4px;">Uppdaterad: ${new Date(cam.photoTime).toLocaleString('sv-SE')}</div>` : ''}
          </div>
        `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([cam.lng, cam.lat])
        .setPopup(popup)
        .addTo(map.current!);
      cameraMarkersRef.current.push(marker);
    });
  }, [mapReady, showCameras, cameras, clearCameraMarkers]);

  // Render organization location markers
  useEffect(() => {
    if (!mapReady || !map.current) return;

    // Clear old markers
    orgLocMarkersRef.current.forEach(m => m.remove());
    orgLocMarkersRef.current = [];

    // Clean up geofence layers/sources (try removing up to 20)
    for (let k = 0; k < 20; k++) {
      const lid = `org-loc-circle-${k}`;
      const sid = `org-loc-source-${k}`;
      try {
        if (map.current.getLayer(lid)) map.current.removeLayer(lid);
        if (map.current.getSource(sid)) map.current.removeSource(sid);
      } catch { /* ignore */ }
    }

    if (!showOrgLocations || orgLocations.length === 0) return;

    console.log('[OpsLiveMap] Rendering org locations:', orgLocations.length, orgLocations);

    orgLocations.forEach((loc, i) => {
      if (!loc.latitude || !loc.longitude) return;

      // Create building marker
      const el = document.createElement('div');
      el.style.cssText = `
        width: 22px; height: 22px; border-radius: 5px;
        background: rgba(124,58,237,0.92); border: 1.5px solid rgba(255,255,255,0.95);
        box-shadow: 0 1px 4px rgba(0,0,0,0.35);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
      `;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>`;

      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false, maxWidth: '180px' })
        .setHTML(`
          <div style="font-size:12px;line-height:1.4">
            <strong>${loc.name}</strong>
            ${loc.address ? `<br/><span style="color:#666">${loc.address}</span>` : ''}
            <br/><span style="color:#7c3aed;font-size:10px;">${loc.geofence_mode === 'polygon' ? 'Exakt polygon' : `Radie: ${loc.radius_meters}m`}</span>
          </div>
        `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([loc.longitude, loc.latitude])
        .setPopup(popup)
        .addTo(map.current!);
      orgLocMarkersRef.current.push(marker);

      // Add geofence overlay — polygon if available, else circle approximation
      const sourceId = `org-loc-source-${i}`;
      const layerId = `org-loc-circle-${i}`;

      try {
        let geometry: GeoJSON.Polygon;
        if (loc.geofence_mode === 'polygon' && loc.geofence_polygon) {
          geometry = loc.geofence_polygon as GeoJSON.Polygon;
        } else {
          const center = [loc.longitude, loc.latitude];
          const radiusKm = loc.radius_meters / 1000;
          const points = 64;
          const coords: [number, number][] = [];
          for (let j = 0; j < points; j++) {
            const angle = (j / points) * 2 * Math.PI;
            const dx = radiusKm * Math.cos(angle);
            const dy = radiusKm * Math.sin(angle);
            const lat = center[1] + (dy / 111.32);
            const lng = center[0] + (dx / (111.32 * Math.cos(center[1] * Math.PI / 180)));
            coords.push([lng, lat]);
          }
          coords.push(coords[0]);
          geometry = { type: 'Polygon', coordinates: [coords] };
        }

        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry },
        });

        map.current!.addLayer({
          id: layerId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#7c3aed',
            'fill-opacity': 0.12,
            'fill-outline-color': '#7c3aed',
          },
        });
      } catch (e) {
        console.warn('[OpsLiveMap] Geofence layer error:', e);
      }
    });
  }, [mapReady, showOrgLocations, orgLocations, styleRevision]);

  // Render staff as WebGL layers so positions stay locked at any browser zoom level
  useEffect(() => {
    if (!mapReady || !map.current) return;

    const m = map.current;
    const assignedIds = new Set(selectedJob?.assignedStaff.map(staff => staff.id) || []);
    const staffWithCoords = showStaff ? locations.filter(loc => loc.latitude && loc.longitude) : [];

    // Build pixel-grid clusters so overlapping staff merge into one marker.
    // We snap each point to a grid cell sized in pixels at the current zoom.
    const zoom = m.getZoom();
    // Cell size shrinks slightly at higher zoom so people nearby separate when you zoom in.
    const CELL_PX = zoom >= 16 ? 22 : zoom >= 13 ? 30 : 38;

    type ClusterGroup = {
      key: string;
      lng: number;
      lat: number;
      members: StaffLocation[];
      statuses: StaffStatus[];
    };
    const groups = new Map<string, ClusterGroup>();

    staffWithCoords.forEach(loc => {
      const status = getStaffStatus(loc, mapJobs);
      const p = m.project([loc.longitude!, loc.latitude!]);
      const cx = Math.round(p.x / CELL_PX);
      const cy = Math.round(p.y / CELL_PX);
      const key = `${cx}:${cy}`;
      const existing = groups.get(key);
      if (existing) {
        existing.members.push(loc);
        existing.statuses.push(status);
      } else {
        groups.set(key, {
          key,
          lng: loc.longitude!,
          lat: loc.latitude!,
          members: [loc],
          statuses: [status],
        });
      }
    });

    // Status priority: on_site > on_way > idle (for cluster color when mixed → use highest priority)
    const statusPriority: Record<StaffStatus, number> = { on_site: 6, on_way: 5, stale: 4, planned: 3, idle: 2, offline: 1 };

    const staffGeoJson = {
      type: 'FeatureCollection',
      features: Array.from(groups.values()).map(g => {
        const isCluster = g.members.length > 1;
        const allSameStatus = g.statuses.every(s => s === g.statuses[0]);
        const dominantStatus = g.statuses.reduce((a, b) =>
          statusPriority[a] >= statusPriority[b] ? a : b
        );
        const color = allSameStatus
          ? statusStyles[g.statuses[0]].color
          : statusStyles[dominantStatus].color;

        // Highlight if any member is in selected job
        const isHighlighted = g.members.some(loc => assignedIds.has(loc.id));
        // Recent GPS if any member has it
        const hasRecentGps = g.members.some(loc => Boolean(loc.isGps && !loc.isOffline));
        // Offline only if ALL members are offline
        const allOffline = g.members.every(loc => loc.isOffline);

        const memberIds = g.members.map(loc => loc.id).join(',');
        const label = isCluster
          ? String(g.members.length)
          : getFirstName(g.members[0].name);

        return {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [g.lng, g.lat],
          },
          properties: {
            id: g.members[0].id,
            memberIds,
            clusterSize: g.members.length,
            isCluster: isCluster ? 1 : 0,
            initial: label,
            color,
            mixedStatus: !allSameStatus ? 1 : 0,
            isHighlighted: isHighlighted ? 1 : 0,
            hasRecentGps: hasRecentGps ? 1 : 0,
            isOffline: allOffline ? 1 : 0,
          },
        };
      }),
    } as GeoJSON.FeatureCollection<GeoJSON.Point>;

    console.debug('[OpsLiveMap] render staff', {
      count: staffWithCoords.length,
      groups: groups.size,
      total: locations.length,
    });

    let cancelled = false;
    let cleanupHandlers: (() => void) | null = null;

    const applyLayers = () => {
      if (cancelled || !map.current) return;
      const mm = map.current;
      if (!mm.isStyleLoaded()) {
        mm.once('idle', applyLayers);
        return;
      }

      const source = mm.getSource(STAFF_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(staffGeoJson);
      } else {
        mm.addSource(STAFF_SOURCE_ID, { type: 'geojson', data: staffGeoJson });
      }

      let beforeId: string | undefined;
      try {
        const layers = mm.getStyle()?.layers || [];
        const firstSymbol = layers.find(l => l.type === 'symbol');
        beforeId = firstSymbol?.id;
      } catch { /* ignore */ }

      if (!mm.getLayer(STAFF_HIGHLIGHT_LAYER_ID)) {
        mm.addLayer({
          id: STAFF_HIGHLIGHT_LAYER_ID,
          type: 'circle',
          source: STAFF_SOURCE_ID,
          filter: ['==', ['get', 'isHighlighted'], 1],
          paint: {
            'circle-radius': 18,
            'circle-color': 'hsl(184, 55%, 38%)',
            'circle-opacity': 0.18,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.75,
          },
        }, beforeId);
      }

      // Soft status glow under single staff (premium feel on satellite)
      const STAFF_GLOW_LAYER_ID = 'ops-staff-glow-layer';
      if (!mm.getLayer(STAFF_GLOW_LAYER_ID)) {
        mm.addLayer({
          id: STAFF_GLOW_LAYER_ID,
          type: 'circle',
          source: STAFF_SOURCE_ID,
          filter: ['==', ['get', 'isCluster'], 0],
          paint: {
            'circle-radius': 16,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.18,
            'circle-blur': 0.6,
          },
        }, beforeId);
      }

      if (!mm.getLayer(STAFF_MARKER_LAYER_ID)) {
        mm.addLayer({
          id: STAFF_MARKER_LAYER_ID,
          type: 'circle',
          source: STAFF_SOURCE_ID,
          paint: {
            // Compact premium pins. Clusters scale subtly with count.
            'circle-radius': [
              'case',
              ['==', ['get', 'isCluster'], 1],
              ['interpolate', ['linear'], ['get', 'clusterSize'], 2, 13, 5, 16, 10, 19],
              11,
            ],
            // Cluster = dark slate badge, single = status color
            'circle-color': [
              'case',
              ['==', ['get', 'isCluster'], 1], '#0f172a',
              ['get', 'color'],
            ],
            'circle-opacity': ['case', ['==', ['get', 'isOffline'], 1], 0.55, 1],
            // Cluster ring = status color, single = white
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'isCluster'], 1], ['get', 'color'],
              '#ffffff',
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'isCluster'], 1], 2.5,
              2,
            ],
            'circle-stroke-opacity': 1,
          },
        }, beforeId);
      }

      if (!mm.getLayer(STAFF_LABEL_LAYER_ID)) {
        // Cluster: count centered on dark badge
        mm.addLayer({
          id: STAFF_LABEL_LAYER_ID,
          type: 'symbol',
          source: STAFF_SOURCE_ID,
          filter: ['==', ['get', 'isCluster'], 1],
          layout: {
            'text-field': ['get', 'initial'],
            'text-size': 12,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(0,0,0,0.0)',
            'text-halo-width': 0,
          },
        });
      }

      // Singel: förnamn som pill UNDER pin, endast vid hög zoom
      const STAFF_NAME_PILL_LAYER_ID = 'ops-staff-name-pill-layer';
      if (!mm.getLayer(STAFF_NAME_PILL_LAYER_ID)) {
        mm.addLayer({
          id: STAFF_NAME_PILL_LAYER_ID,
          type: 'symbol',
          source: STAFF_SOURCE_ID,
          filter: ['==', ['get', 'isCluster'], 0],
          minzoom: 10,
          layout: {
            'text-field': ['get', 'initial'],
            'text-size': 10.5,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-anchor': 'top',
            'text-offset': [0, 1.1],
            'text-padding': 3,
            'text-allow-overlap': false,
            'text-optional': true,
            'text-letter-spacing': 0.02,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': 'rgba(15,23,42,0.95)',
            'text-halo-width': 2.2,
            'text-halo-blur': 0.3,
          },
        });
      }

      if (!mm.getLayer(STAFF_GPS_DOT_LAYER_ID)) {
        mm.addLayer({
          id: STAFF_GPS_DOT_LAYER_ID,
          type: 'circle',
          source: STAFF_SOURCE_ID,
          filter: ['all',
            ['==', ['get', 'hasRecentGps'], 1],
            ['==', ['get', 'isCluster'], 0],
          ],
          paint: {
            'circle-radius': 3,
            'circle-color': '#22c55e',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.2,
            'circle-translate': [8, -8],
            'circle-opacity': 1,
          },
        });
      }


      const findMembers = (memberIdsStr: string) => {
        const ids = memberIdsStr.split(',');
        return ids
          .map(id => locations.find(l => l.id === id))
          .filter((l): l is StaffLocation => Boolean(l));
      };

      const handleStaffClick = (event: mapboxgl.MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const memberIdsStr = (feature.properties?.memberIds as string) || '';
        const members = findMembers(memberIdsStr);
        if (members.length === 0) return;

        if (members.length === 1) {
          setStaffPanel(members[0]);
          setSelectedJob(null);
          setClusterPicker(null);
          return;
        }

        // Cluster click: zoom in if not already deep
        const z = mm.getZoom();
        if (z < 16) {
          mm.flyTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom: Math.min(z + 2, 17),
            duration: 600,
          });
          setClusterPicker(null);
        } else {
          // Show picker
          setClusterPicker({
            x: event.point.x,
            y: event.point.y,
            members,
          });
        }
      };

      const handleMouseMove = (event: mapboxgl.MapLayerMouseEvent) => {
        mm.getCanvas().style.cursor = 'pointer';
        const feature = event.features?.[0];
        if (!feature) return;
        const memberIdsStr = (feature.properties?.memberIds as string) || '';
        const members = findMembers(memberIdsStr).map(loc => ({
          id: loc.id,
          name: loc.name,
          status: getStaffStatus(loc, mapJobs),
          teamName: loc.teamName,
          lastSeen: loc.lastReportTime,
          isOffline: loc.isOffline,
        }));
        if (members.length === 0) return;
        setHoverTip({ x: event.point.x, y: event.point.y, members });
      };

      const handleMouseLeave = () => {
        mm.getCanvas().style.cursor = '';
        setHoverTip(null);
      };

      mm.on('click', STAFF_MARKER_LAYER_ID, handleStaffClick);
      mm.on('click', STAFF_LABEL_LAYER_ID, handleStaffClick);
      mm.on('mousemove', STAFF_MARKER_LAYER_ID, handleMouseMove);
      mm.on('mousemove', STAFF_LABEL_LAYER_ID, handleMouseMove);
      mm.on('mouseleave', STAFF_MARKER_LAYER_ID, handleMouseLeave);
      mm.on('mouseleave', STAFF_LABEL_LAYER_ID, handleMouseLeave);

      cleanupHandlers = () => {
        if (!map.current) return;
        map.current.off('click', STAFF_MARKER_LAYER_ID, handleStaffClick);
        map.current.off('click', STAFF_LABEL_LAYER_ID, handleStaffClick);
        map.current.off('mousemove', STAFF_MARKER_LAYER_ID, handleMouseMove);
        map.current.off('mousemove', STAFF_LABEL_LAYER_ID, handleMouseMove);
        map.current.off('mouseleave', STAFF_MARKER_LAYER_ID, handleMouseLeave);
        map.current.off('mouseleave', STAFF_LABEL_LAYER_ID, handleMouseLeave);
      };
    };

    applyLayers();

    // Re-cluster on zoom changes so cluster cells stay visually consistent.
    const handleZoomEnd = () => {
      setStyleRevision(prev => prev + 1);
    };
    m.on('zoomend', handleZoomEnd);

    return () => {
      cancelled = true;
      cleanupHandlers?.();
      if (map.current) map.current.off('zoomend', handleZoomEnd);
    };
  }, [mapReady, locations, mapJobs, selectedJob, styleRevision, showStaff]);

  // Render markers
  useEffect(() => {
    if (!mapReady || !map.current) return;
    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    // Job location markers (diamond shape)
    if (showJobs) mapJobs.forEach(job => {
      if (!job.latitude || !job.longitude) return;
      hasPoints = true;
      bounds.extend([job.longitude, job.latitude]);

      const staffOnJob = locations.filter(l => l.bookingId === job.bookingId && l.isWorking).length;

      const el = document.createElement('div');
      el.style.cssText = 'width: 36px; height: 36px; cursor: pointer; z-index: 8; position: relative; display:flex; align-items:center; justify-content:center;';
      const phase = classifyJobPhase(job.eventType);
      const ph = phaseStyles[phase];
      const glow = job.isActive
        ? `<div style="position:absolute;inset:-6px;border-radius:9999px;background:${ph.fill};opacity:0.18;filter:blur(8px);animation:opspulse 2.4s ease-in-out infinite;"></div>`
        : '';
      const staffBadge = staffOnJob > 0
        ? `<div style="position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:9999px;background:#0f172a;color:#fff;font:700 9px/16px system-ui;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);">${staffOnJob}</div>`
        : '';
      el.innerHTML = `
        ${glow}
        <div style="position:relative;width:28px;height:28px;border-radius:8px;background:${ph.fill};border:2px solid ${ph.ring};box-shadow:0 2px 6px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ph.icon}</svg>
        </div>
        ${staffBadge}
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedJob(job);
        setStaffPanel(null);
        if (map.current) {
          map.current.flyTo({ center: [job.longitude!, job.latitude!], zoom: 14, duration: 800 });
        }
      });

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([job.longitude, job.latitude])
        .addTo(map.current!);
      jobMarkersRef.current.push(marker);
    });

    const staffWithCoords = locations.filter(l => l.latitude && l.longitude);
    staffWithCoords.forEach(loc => {
      hasPoints = true;
      bounds.extend([loc.longitude!, loc.latitude!]);
    });

    // Fit bounds
    if (hasPoints) {
      const coords = [
        ...staffWithCoords.map(l => [l.longitude!, l.latitude!] as [number, number]),
        ...mapJobs.filter(j => j.latitude && j.longitude).map(j => [j.longitude!, j.latitude!] as [number, number]),
      ];
      if (coords.length === 1) {
        map.current.flyTo({ center: coords[0], zoom: 12 });
      } else if (coords.length > 1) {
        map.current.fitBounds(bounds, { padding: 50, maxZoom: 13 });
      }
    }
  }, [mapReady, locations, mapJobs, clearMarkers, styleRevision, showJobs]);

  // Follow mode — keep map centered on followed staff
  useEffect(() => {
    if (!followStaffId || !mapReady || !map.current) return;
    const loc = locations.find(l => l.id === followStaffId);
    if (!loc?.latitude || !loc?.longitude) return;
    map.current.easeTo({
      center: [loc.longitude, loc.latitude],
      duration: 600,
      zoom: Math.max(map.current.getZoom(), 14),
    });
  }, [followStaffId, locations, mapReady]);

  const followedStaff = followStaffId
    ? locations.find(l => l.id === followStaffId) || null
    : null;

  // Focus from external trigger
  useEffect(() => {
    if (!focusCoords || !map.current || !mapReady) return;
    map.current.flyTo({ center: [focusCoords.lng, focusCoords.lat], zoom: 14, duration: 800 });
  }, [focusCoords, mapReady]);

  // Render route polyline
  useEffect(() => {
    if (!map.current || !mapReady) return;
    const sourceId = 'staff-route-line';
    const layerId = 'staff-route-layer';
    const casingId = 'staff-route-casing';

    // Clean up existing
    if (map.current.getLayer(casingId)) map.current.removeLayer(casingId);
    if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
    if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);

    if (!routePolyline) return;

    map.current.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: routePolyline },
    });

    // Casing (outline)
    map.current.addLayer({
      id: casingId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ffffff',
        'line-width': 8,
        'line-opacity': 0.6,
      },
    });

    // Main line
    map.current.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': 'hsl(184, 55%, 38%)',
        'line-width': 5,
        'line-opacity': 0.85,
      },
    });

    // Fit to route bounds
    const coords = routePolyline.coordinates as [number, number][];
    if (coords.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach(c => bounds.extend(c));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    }

    return () => {
      if (!map.current) return;
      if (map.current.getLayer(casingId)) map.current.removeLayer(casingId);
      if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
    };
  }, [routePolyline, mapReady, styleRevision]);

  const handleSendQuickMsg = async () => {
    if (!quickMsg.trim() || !staffPanel || sending) return;
    setSending(true);
    try {
      await sendAdminMessage(`@${staffPanel.name}: ${quickMsg}`, 'Admin');
      toast.success(`Meddelande skickat till ${staffPanel.name}`);
      setQuickMsg('');
      queryClient.invalidateQueries({ queryKey: ['ops-control', 'messages'] });
    } catch {
      toast.error('Kunde inte skicka meddelande');
    } finally {
      setSending(false);
    }
  };

  const onSiteCount = locations.filter(l => l.latitude && l.longitude && l.isWorking).length;
  const totalOnMap = locations.filter(l => l.latitude && l.longitude).length;
  const jobsOnMap = mapJobs.filter(j => j.latitude && j.longitude).length;

  const toggleFullscreen = useCallback(() => {
    const m = map.current;
    const savedCenter = m?.getCenter();
    const savedZoom = m?.getZoom();
    const savedBearing = m?.getBearing();
    const savedPitch = m?.getPitch();

    setIsFullscreen(prev => !prev);

    setTimeout(() => {
      if (!m) return;
      m.resize();
      if (savedCenter && savedZoom !== undefined) {
        m.jumpTo({
          center: savedCenter,
          zoom: savedZoom,
          bearing: savedBearing,
          pitch: savedPitch,
        });
      }
    }, 50);
  }, []);


  const toggleMapStyle = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const savedCenter = m.getCenter();
    const savedZoom = m.getZoom();
    const newStyle = mapStyle === 'streets' ? 'satellite' : 'streets';
    setMapStyle(newStyle);
    m.setStyle(MAP_STYLES[newStyle]);
    m.once('style.load', () => {
      m.jumpTo({ center: savedCenter, zoom: savedZoom });
    });
  }, [mapStyle]);

  return (
    <div
      ref={wrapperRef}
      className={
        isFullscreen
          ? 'fixed inset-4 z-50 bg-background rounded-2xl shadow-2xl border border-border overflow-hidden'
          : 'relative w-full h-full overflow-hidden rounded-xl border-2 border-border'
      }
    >
      <div ref={mapContainer} className="w-full h-full" />
      <style>{`@keyframes opspulse { 0%,100% { opacity:.18; transform:translate(-50%,-50%) scale(1);} 50% { opacity:.42; transform:translate(-50%,-50%) scale(1.25);} }`}</style>

      {/* Loading */}
      {(isLoading || !mapReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {/* ── PREMIUM MAP TOOLBAR ── */}
      <div className="absolute top-2 left-2 z-20 flex items-stretch gap-2">
        {/* Live stats pill */}
        <div
          className="flex items-center gap-3 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-xl border border-white/10 text-white shadow-lg"
          style={{ boxShadow: '0 4px 16px rgba(15,23,42,0.25)' }}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
            LIVE
          </span>
          <span className="h-3 w-px bg-white/20" />
          <span className="flex items-center gap-1 text-[11px] font-semibold tabular-nums">
            <Users className="w-3 h-3 text-slate-300" /> {totalOnMap}
          </span>
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-emerald-300">
            {onSiteCount} på plats
          </span>
          <span className="flex items-center gap-1 text-[11px] tabular-nums text-slate-300">
            <Briefcase className="w-3 h-3" /> {jobsOnMap}
          </span>
        </div>

        {/* Layer toggles toolbar */}
        <div
          className="flex items-center gap-0.5 p-1 rounded-xl bg-card/95 backdrop-blur-xl border border-border shadow-lg"
        >
          {[
            { key: 'staff', label: 'Personal', icon: Users, active: showStaff, onClick: () => setShowStaff(v => !v) },
            { key: 'jobs', label: 'Jobb', icon: Briefcase, active: showJobs, onClick: () => setShowJobs(v => !v) },
            { key: 'sites', label: 'Platser', icon: Building2, active: showOrgLocations, onClick: () => setShowOrgLocations(v => !v) },
            { key: 'cams', label: 'Kameror', icon: Camera, active: showCameras, onClick: handleToggleCameras, disabled: camerasLoading },
          ].map(b => (
            <button
              key={b.key}
              onClick={b.onClick}
              disabled={b.disabled}
              title={b.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                b.active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              } ${b.disabled ? 'opacity-50' : ''}`}
            >
              <b.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{b.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Follow mode badge */}
      {followedStaff && (
        <div className="absolute top-14 left-2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground shadow-lg border border-primary/40 animate-in slide-in-from-top-2 duration-200">
          <LocateFixed className="w-3.5 h-3.5 animate-pulse" />
          <span className="text-[11px] font-semibold">Följer: {followedStaff.name}</span>
          <button
            onClick={() => setFollowStaffId(null)}
            className="ml-1 p-0.5 rounded hover:bg-primary-foreground/20 transition-colors"
            title="Sluta följa"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Map style + Fullscreen toggles */}
      <div className="absolute top-2 right-2 z-20 flex gap-1">
        <button
          onClick={toggleMapStyle}
          className="w-8 h-8 rounded-lg bg-card/90 backdrop-blur-sm shadow-md border border-border flex items-center justify-center hover:bg-card transition-colors"
          title={mapStyle === 'streets' ? 'Visa satellit' : 'Visa karta'}
        >
          {mapStyle === 'streets' ? (
            <Satellite className="w-4 h-4 text-muted-foreground" />
          ) : (
            <MapIcon className="w-4 h-4 text-foreground" />
          )}
        </button>
        <button
          onClick={toggleFullscreen}
          className="w-8 h-8 rounded-lg bg-card/90 backdrop-blur-sm shadow-md border border-border flex items-center justify-center hover:bg-card transition-colors"
          title={isFullscreen ? 'Stäng helskärm' : 'Helskärm'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4 text-foreground" />
          ) : (
            <Maximize2 className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Premium Legend */}
      <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-2xl border border-white/10 text-white">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Live status</h3>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5">
          {(Object.entries(phaseStyles) as [JobPhase, typeof phaseStyles[JobPhase]][])
            .filter(([k]) => k !== 'other')
            .map(([key, p]) => (
              <span key={key} className="flex items-center gap-2 text-[10px] text-slate-200">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: p.fill, boxShadow: `0 0 8px ${p.ring}55` }}
                />
                {p.label}
              </span>
            ))}
          {Object.entries(statusStyles).map(([key, { color, label }]) => (
            <span key={key} className="flex items-center gap-2 text-[10px] text-slate-200">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/40" style={{ background: color }} />
              {label}
            </span>
          ))}
          {showCameras && (
            <span className="flex items-center gap-2 text-[10px] text-slate-200">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-500" />
              Kamera
            </span>
          )}
          {showOrgLocations && orgLocations.length > 0 && (
            <span className="flex items-center gap-2 text-[10px] text-slate-200">
              <span className="w-2.5 h-2.5 rounded shrink-0" style={{ background: '#7c3aed' }} />
              Plats
            </span>
          )}
        </div>
      </div>

      {/* Selected job panel */}
      {selectedJob && (
        <div className="absolute top-2 right-2 w-56 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-right-2 duration-150 z-20">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-bold text-foreground truncate">{selectedJob.client}</span>
            <button onClick={() => setSelectedJob(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            {selectedJob.bookingNumber && (
              <div className="text-[10px] text-muted-foreground">#{selectedJob.bookingNumber}</div>
            )}
            {selectedJob.deliveryAddress && (
              <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{selectedJob.deliveryAddress}</span>
              </div>
            )}
            {selectedJob.startTime && (
              <div className="text-[10px] text-muted-foreground">
                {selectedJob.eventType || 'Jobb'} · {format(new Date(selectedJob.startTime), 'HH:mm')}
                {selectedJob.endTime && `–${format(new Date(selectedJob.endTime), 'HH:mm')}`}
              </div>
            )}
            {selectedJob.isActive && (
              <span className="inline-block text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Pågår nu</span>
            )}

            {/* Assigned staff */}
            <div className="pt-1 border-t border-border/30">
              <div className="text-[9px] font-bold text-muted-foreground uppercase mb-1">
                Tilldelad personal ({selectedJob.assignedStaff.length})
              </div>
              {selectedJob.assignedStaff.length === 0 ? (
                <div className="text-[10px] text-destructive">Ingen personal tilldelad</div>
              ) : (
                selectedJob.assignedStaff.map(s => (
                  <div key={s.id} className="text-[10px] text-foreground">• {s.name}</div>
                ))
              )}
            </div>

            <button
              className="w-full text-[10px] font-medium text-primary hover:underline text-left mt-1"
              onClick={() => navigate(`/booking/${selectedJob.bookingId}`)}
            >
              Öppna bokning →
            </button>
          </div>
        </div>
      )}

      {/* Hover tooltip — shows ALL names when hovering a staff marker or cluster */}
      {hoverTip && hoverTip.members.length > 0 && (
        <div
          className="pointer-events-none absolute z-30 bg-popover text-popover-foreground border border-border rounded-md shadow-lg px-2.5 py-1.5"
          style={{
            left: Math.min(hoverTip.x + 14, (wrapperRef.current?.clientWidth || 800) - 290),
            top: Math.max(hoverTip.y - 8, 8),
            minWidth: 180,
            maxWidth: 280,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {hoverTip.members.length > 1 && (
            <div className="text-[9px] font-bold uppercase text-muted-foreground mb-1">
              {hoverTip.members.length} personer på platsen
            </div>
          )}
          <div className="space-y-1">
            {hoverTip.members.map(m => (
              <div key={m.id} className="flex items-start gap-1.5 text-[11px] leading-tight">
                <span
                  className="w-2 h-2 rounded-full shrink-0 mt-1"
                  style={{ background: statusStyles[m.status].color, opacity: m.isOffline ? 0.55 : 1 }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground break-words">{m.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {statusStyles[m.status].label}
                    {m.teamName && ` · ${m.teamName}`}
                  </div>
                  {m.lastSeen && (
                    <div className="text-[9px] text-muted-foreground/80 flex items-center gap-1 mt-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {(() => {
                        const diff = Date.now() - new Date(m.lastSeen).getTime();
                        if (diff < 60_000) return 'just nu';
                        return formatDistanceToNow(new Date(m.lastSeen), { addSuffix: true, locale: sv });
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cluster picker — shown when clicking a cluster that cannot be zoomed apart */}
      {clusterPicker && (
        <div
          className="absolute z-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden"
          style={{
            left: Math.min(clusterPicker.x + 10, (wrapperRef.current?.clientWidth || 800) - 240),
            top: Math.max(clusterPicker.y - 10, 8),
            width: 230,
            maxHeight: 300,
          }}
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Välj person</span>
            <button onClick={() => setClusterPicker(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 250 }}>
            {clusterPicker.members.map(loc => {
              const status = getStaffStatus(loc, mapJobs);
              return (
                <button
                  key={loc.id}
                  onClick={() => {
                    setStaffPanel(loc);
                    setSelectedJob(null);
                    setClusterPicker(null);
                  }}
                  className="w-full flex items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted transition-colors border-b border-border/30 last:border-0"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ background: statusStyles[status].color, opacity: loc.isOffline ? 0.55 : 1 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-foreground break-words">{loc.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {statusStyles[status].label}
                      {loc.teamName && ` · ${loc.teamName}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Staff quick panel */}
      {staffPanel && (
        <div className="absolute bottom-2 right-2 w-72 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-right-2 duration-150 z-20">
          <div className="px-3 py-2 border-b border-border flex items-start justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                style={{ background: statusStyles[getStaffStatus(staffPanel, mapJobs)].color }}
              />
              <span className="text-[11px] font-bold text-foreground break-words leading-tight">{staffPanel.name}</span>
            </div>
            <button onClick={() => setStaffPanel(null)} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <div className="text-[10px] text-muted-foreground">
              {statusStyles[getStaffStatus(staffPanel, mapJobs)].label}
              {staffPanel.teamName && ` · ${staffPanel.teamName}`}
              {staffPanel.isOffline && ' · Offline'}
            </div>
            {/* GPS / Last seen */}
            <div className="flex items-center gap-1.5 text-[10px]">
              {staffPanel.isGps ? (
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <Wifi className="w-3 h-3" /> Live GPS
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="w-3 h-3" /> Adressbaserad
                </span>
              )}
              {staffPanel.lastReportTime && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {(() => {
                    const diff = Date.now() - new Date(staffPanel.lastReportTime).getTime();
                    if (diff < 60_000) return 'Just nu';
                    return formatDistanceToNow(new Date(staffPanel.lastReportTime), { addSuffix: true, locale: sv });
                  })()}
                </span>
              )}
            </div>
            {/* Time at location */}
            {staffPanel.locationSince && (
              <div className="flex items-center gap-1 text-[10px] text-foreground">
                <Navigation className="w-3 h-3 text-muted-foreground" />
                <span>
                  På plats sedan {format(new Date(staffPanel.locationSince), 'HH:mm', { locale: sv })}
                  {' '}({(() => {
                    const mins = Math.floor((Date.now() - new Date(staffPanel.locationSince).getTime()) / 60000);
                    if (mins < 1) return 'just nu';
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    if (h === 0) return `${m} min`;
                    return `${h} tim ${m} min`;
                  })()})
                </span>
              </div>
            )}
            {staffPanel.bookingClient && (
              <div className="flex items-center gap-1 text-[10px] text-foreground">
                <Briefcase className="w-3 h-3 text-muted-foreground" />
                {staffPanel.bookingClient}
              </div>
            )}
            {staffPanel.deliveryAddress && (
              <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
                <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                <span className="truncate">{staffPanel.deliveryAddress}</span>
              </div>
            )}

            {/* Premium quick actions */}
            <div className="flex gap-1 pt-1.5 border-t border-border/30">
              <button
                onClick={() => {
                  if (!map.current || !staffPanel.latitude || !staffPanel.longitude) return;
                  map.current.flyTo({ center: [staffPanel.longitude, staffPanel.latitude], zoom: 16, duration: 700 });
                }}
                disabled={!staffPanel.latitude || !staffPanel.longitude}
                className="flex-1 flex items-center justify-center gap-1 text-[10px] font-medium px-2 py-1.5 rounded bg-muted hover:bg-muted/70 text-foreground transition-colors disabled:opacity-40"
                title="Zooma till person"
              >
                <ZoomIn className="w-3 h-3" /> Zooma
              </button>
              <button
                onClick={() => {
                  if (followStaffId === staffPanel.id) {
                    setFollowStaffId(null);
                  } else {
                    setFollowStaffId(staffPanel.id);
                  }
                }}
                disabled={!staffPanel.latitude || !staffPanel.longitude}
                className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded transition-colors disabled:opacity-40 ${
                  followStaffId === staffPanel.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/70 text-foreground'
                }`}
                title={followStaffId === staffPanel.id ? 'Sluta följa' : 'Följ live'}
              >
                <Crosshair className="w-3 h-3" />
                {followStaffId === staffPanel.id ? 'Slutar följa' : 'Följ live'}
              </button>
            </div>

            <div className="pt-1.5 border-t border-border/30">
              <div className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Snabbmeddelande</div>
              <div className="flex gap-1">
                <input
                  className="flex-1 text-[10px] bg-muted rounded px-1.5 py-1 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
                  placeholder={`Till ${staffPanel.name}...`}
                  value={quickMsg}
                  onChange={e => setQuickMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendQuickMsg()}
                />
                <button
                  className="px-1.5 py-1 rounded bg-primary text-primary-foreground text-[9px] font-medium disabled:opacity-50"
                  onClick={handleSendQuickMsg}
                  disabled={!quickMsg.trim() || sending}
                >
                  Skicka
                </button>
              </div>
            </div>

            {staffPanel.bookingId && (
              <button
                className="w-full text-[10px] font-medium text-primary hover:underline text-left"
                onClick={() => navigate(`/booking/${staffPanel.bookingId}`)}
              >
                Öppna jobb →
              </button>
            )}
            {onOpenDM && (
              <button
                className="w-full text-[10px] font-medium bg-primary text-primary-foreground rounded py-1 hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
                onClick={() => onOpenDM(staffPanel.id, staffPanel.name)}
              >
                <MessageCircle className="w-3 h-3" />
                Direktmeddelande
              </button>
            )}
            <button
              className="w-full text-[10px] font-medium text-primary hover:underline text-left"
              onClick={() => navigate(`/staff/${staffPanel.id}`)}
            >
              Personalprofil →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsLiveMap;
