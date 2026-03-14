import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, MapPin, Users, Briefcase, Navigation, MessageCircle, Camera } from 'lucide-react';
import { StaffLocation } from '@/services/planningDashboardService';
import { OpsMapJob } from '@/services/opsControlService';
import { useNavigate } from 'react-router-dom';
import { sendAdminMessage } from '@/services/staffDashboardService';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useTrafficCameras, TrafficCamera } from '@/hooks/useTrafficCameras';

interface Props {
  locations: StaffLocation[];
  mapJobs: OpsMapJob[];
  isLoading: boolean;
  focusCoords?: { lat: number; lng: number } | null;
  onOpenDM?: (staffId: string, staffName: string) => void;
}

type StaffStatus = 'on_site' | 'on_way' | 'idle';

function getStaffStatus(loc: StaffLocation, mapJobs: OpsMapJob[]): StaffStatus {
  if (loc.isWorking) return 'on_site';
  // If staff is assigned to a booking that has started
  const job = mapJobs.find(j => j.bookingId === loc.bookingId);
  if (job?.isActive) return 'on_way';
  if (loc.bookingId) return 'on_way';
  return 'idle';
}

const statusStyles: Record<StaffStatus, { color: string; label: string }> = {
  on_site: { color: '#22c55e', label: 'På plats' },
  on_way: { color: '#eab308', label: 'På väg' },
  idle: { color: '#9ca3af', label: 'Inaktiv' },
};

const OpsLiveMap = ({ locations, mapJobs, isLoading, focusCoords, onOpenDM }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const staffMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const jobMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const cameraMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const popupsRef = useRef<mapboxgl.Popup[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selectedJob, setSelectedJob] = useState<OpsMapJob | null>(null);
  const [staffPanel, setStaffPanel] = useState<StaffLocation | null>(null);
  const [quickMsg, setQuickMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [showCameras, setShowCameras] = useState(false);
  const { cameras, isLoading: camerasLoading, fetchCameras } = useTrafficCameras();

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
          style: 'mapbox://styles/mapbox/navigation-day-v1',
          center: [15.5, 58.5],
          zoom: 5,
          attributionControl: false,
        });
        map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
        map.current.on('load', () => { if (!cancelled) setMapReady(true); });
      } catch { /* silent */ }
    };
    init();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
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
        width: 28px; height: 28px; border-radius: 50%;
        background: #3b82f6; border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        pointer-events: auto; position: relative; z-index: 1;
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

  // Render markers
  useEffect(() => {
    if (!mapReady || !map.current) return;
    clearMarkers();

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoints = false;

    // Job location markers (diamond shape)
    mapJobs.forEach(job => {
      if (!job.latitude || !job.longitude) return;
      hasPoints = true;
      bounds.extend([job.longitude, job.latitude]);

      const el = document.createElement('div');
      el.style.cssText = `
        width: 20px; height: 20px; cursor: pointer;
        background: ${job.isActive ? 'hsl(184, 55%, 38%)' : '#64748b'};
        border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        transform: rotate(45deg); border-radius: 3px;
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedJob(job);
        setStaffPanel(null);
        if (map.current) {
          map.current.flyTo({ center: [job.longitude!, job.latitude!], zoom: 14, duration: 800 });
        }
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([job.longitude, job.latitude])
        .addTo(map.current!);
      jobMarkersRef.current.push(marker);
    });

    // Staff markers (circles)
    const staffWithCoords = locations.filter(l => l.latitude && l.longitude);
    staffWithCoords.forEach(loc => {
      hasPoints = true;
      bounds.extend([loc.longitude!, loc.latitude!]);

      const status = getStaffStatus(loc, mapJobs);
      const style = statusStyles[status];

      const el = document.createElement('div');
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 50%;
        background: ${style.color}; border: 2.5px solid white;
        box-shadow: 0 1px 6px rgba(0,0,0,0.25);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: transform 0.15s;
        font-size: 10px; font-weight: 700; color: white;
      `;
      el.textContent = loc.name.charAt(0).toUpperCase();
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.2)'; });
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setStaffPanel(loc);
        setSelectedJob(null);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([loc.longitude!, loc.latitude!])
        .addTo(map.current!);
      staffMarkersRef.current.push(marker);
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
  }, [mapReady, locations, mapJobs, clearMarkers]);

  // Focus from external trigger
  useEffect(() => {
    if (!focusCoords || !map.current || !mapReady) return;
    map.current.flyTo({ center: [focusCoords.lng, focusCoords.lat], zoom: 14, duration: 800 });
  }, [focusCoords, mapReady]);

  // Handle zoom to job's assigned staff (highlight)
  useEffect(() => {
    if (!selectedJob || !map.current || !mapReady) return;
    // Highlight by adding ring effect markers for assigned staff
    const assignedIds = new Set(selectedJob.assignedStaff.map(s => s.id));
    staffMarkersRef.current.forEach((marker, idx) => {
      const loc = locations.filter(l => l.latitude && l.longitude)[idx];
      if (!loc) return;
      const el = marker.getElement();
      if (assignedIds.has(loc.id)) {
        el.style.boxShadow = '0 0 0 3px hsl(184, 55%, 38%), 0 1px 6px rgba(0,0,0,0.25)';
        el.style.zIndex = '10';
      } else {
        el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.25)';
        el.style.zIndex = '1';
      }
    });

    return () => {
      staffMarkersRef.current.forEach(marker => {
        const el = marker.getElement();
        el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.25)';
        el.style.zIndex = '1';
      });
    };
  }, [selectedJob, mapReady, locations]);

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

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Loading */}
      {(isLoading || !mapReady) && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute top-2 left-2 bg-card/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow border border-border">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-foreground">
            <Users className="w-3 h-3 text-primary" /> {totalOnMap} personal
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Briefcase className="w-3 h-3" /> {jobsOnMap} jobb
          </span>
          <span className="flex items-center gap-1 text-[10px] text-emerald-600">
            {onSiteCount} på plats
          </span>
          <button
            onClick={handleToggleCameras}
            disabled={camerasLoading}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
              showCameras
                ? 'bg-blue-500 text-white font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            } ${camerasLoading ? 'opacity-50' : ''}`}
          >
            <Camera className="w-3 h-3" />
            {camerasLoading ? '...' : showCameras ? `Kameror (${cameras.length})` : 'Kameror'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-card/90 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow border border-border">
        <div className="flex items-center gap-2">
          {Object.entries(statusStyles).map(([key, { color, label }]) => (
            <span key={key} className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="w-2.5 h-2.5 bg-primary rotate-45 rounded-[2px] shrink-0" style={{ transform: 'rotate(45deg)', width: 8, height: 8 }} />
            Jobb
          </span>
          {showCameras && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
              Kamera
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

      {/* Staff quick panel */}
      {staffPanel && (
        <div className="absolute bottom-2 right-2 w-56 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in slide-in-from-right-2 duration-150 z-20">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: statusStyles[getStaffStatus(staffPanel, mapJobs)].color }}
              />
              <span className="text-[11px] font-bold text-foreground truncate">{staffPanel.name}</span>
            </div>
            <button onClick={() => setStaffPanel(null)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
          <div className="px-3 py-2 space-y-1.5">
            <div className="text-[10px] text-muted-foreground">
              {statusStyles[getStaffStatus(staffPanel, mapJobs)].label}
              {staffPanel.teamName && ` · ${staffPanel.teamName}`}
            </div>
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

            {/* Quick message */}
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
