import { useState, useCallback, useMemo } from 'react';
import { useOpsControl } from '@/hooks/useOpsControl';
import OpsPlanningDayPanel from '@/components/ops-control/OpsPlanningDayPanel';
import OpsLiveProjects from '@/components/ops-control/OpsLiveProjects';
import OpsActivityComms from '@/components/ops-control/OpsActivityComms';
import OpsLiveMap from '@/components/ops-control/OpsLiveMap';
import OpsJobChat from '@/components/ops-control/OpsJobChat';
import OpsDirectChat from '@/components/ops-control/OpsDirectChat';
import OpsBroadcastDialog from '@/components/ops-control/OpsBroadcastDialog';
import OpsStaffRoute from '@/components/ops-control/OpsStaffRoute';
import OrganizationLocationsManager from '@/components/ops-control/OrganizationLocationsManager';
import OpsTodayJobsPanel from '@/components/ops-control/OpsTodayJobsPanel';
import { useLivePackingFeed } from '@/hooks/useLivePackingFeed';
import { OpsTimelineAssignment, type OpsMapJob } from '@/services/opsControlService';
import { optimizeStaffRoute, StaffRouteResult } from '@/services/staffRouteService';
import {
  type LucideIcon,
  Radio,
  Users,
  Briefcase,
  MapPin,
  Activity as ActivityIcon,
  Sparkles,
  CalendarDays,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import LogisticsWeeklyWeatherWidget from '@/components/logistics/widgets/LogisticsWeeklyWeatherWidget';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

/** Wrapper so useLivePackingFeed only runs when the panel is actually mounted. */
function LiveProjectsPanelBody({ enabled }: { enabled: boolean }) {
  const livePacking = useLivePackingFeed({ enabled });
  return (
    <OpsLiveProjects
      items={livePacking.items}
      counts={livePacking.counts}
      pulseIds={livePacking.pulseIds}
      isLoading={livePacking.isLoading}
      markSeen={livePacking.markSeen}
    />
  );
}

function CollapsibleHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-3.5 pt-3 pb-2 cursor-pointer select-none text-left"
    >
      <h3 className="planning-section-title">{title}</h3>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {open ? 'Dölj' : 'Visa'}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </span>
    </button>
  );
}

type SidePanel =
  | { type: 'job-chat'; bookingId: string; label: string }
  | { type: 'dm'; staffId: string; staffName: string; assignments: OpsTimelineAssignment[] }
  | { type: 'staff-route'; staffName: string; route: StaffRouteResult }
  | null;

/* ── Premium KPI Chip ── */
function KpiChip({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone?: 'default' | 'live';
}) {
  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl shrink-0"
      style={{
        background:
          tone === 'live'
            ? 'linear-gradient(180deg, hsl(150 60% 96%) 0%, hsl(150 50% 93%) 100%)'
            : 'linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(270 30% 98%) 100%)',
        border:
          tone === 'live'
            ? '1px solid hsl(150 40% 78%)'
            : '1px solid hsl(270 25% 88% / 0.8)',
        boxShadow: '0 1px 2px hsl(270 30% 25% / 0.04)',
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background:
            tone === 'live'
              ? 'hsl(150 50% 88%)'
              : 'hsl(var(--primary) / 0.10)',
        }}
      >
        <Icon
          className="w-3.5 h-3.5"
          strokeWidth={2.1}
          {...({
            style: {
              color: tone === 'live' ? 'hsl(150 55% 28%)' : 'hsl(var(--primary))',
            },
          } as any)}
        />
      </div>
      <div className="flex flex-col leading-tight">
        <span
          className="text-[16px] font-semibold tabular-nums"
          style={{ color: 'hsl(280 40% 18%)' }}
        >
          {value}
        </span>
        <span
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'hsl(270 14% 48%)' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

const OpsControlCenter = () => {
  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedJobBookingId, setSelectedJobBookingId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<GeoJSON.LineString | null>(null);

  // Sekundära paneler — stängda som default så de inte mountar tunga hooks vid första render.
  const [liveProjectsOpen, setLiveProjectsOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [commsOpen, setCommsOpen] = useState(false);
  const [staffCalendarOpen, setStaffCalendarOpen] = useState(false);

  const {
    timeline, isLoadingTimeline,
    timelineDate, goToNextDay, goToPrevDay, goToToday,
    jobQueue,
    locations, isLoadingLocations,
    mapJobs, isLoadingMapJobs,
    messages, isLoadingMessages,
    activity, isLoadingActivity,
  } = useOpsControl({
    enableMessages: commsOpen,
    enableActivity: commsOpen,
  });

  const handleFocusJob = useCallback((job: OpsMapJob) => {
    setSelectedJobBookingId(job.bookingId);
    if (job.latitude && job.longitude) {
      setFocusCoords({ lat: job.latitude, lng: job.longitude });
    }
  }, []);

  const handleOpenDM = useCallback((staffId: string, staffName: string) => {
    const staff = timeline.find(s => s.id === staffId);
    setSidePanel({ type: 'dm', staffId, staffName, assignments: staff?.assignments || [] });
  }, [timeline]);

  const handleOptimizeRoute = useCallback(async (staffId: string, staffName: string) => {
    const dateStr = format(timelineDate, 'yyyy-MM-dd');
    toast.loading('Optimerar rutt...', { id: 'route-opt' });
    try {
      const result = await optimizeStaffRoute(staffId, dateStr);
      toast.success(`Rutt optimerad: ${result.total_distance_km} km, ~${result.total_duration_min} min`, { id: 'route-opt' });
      setSidePanel({ type: 'staff-route', staffName, route: result });
      if (result.polyline) {
        setRoutePolyline(result.polyline);
      }
    } catch (e: any) {
      toast.error(e.message || 'Kunde inte optimera rutt', { id: 'route-opt' });
    }
  }, [timelineDate]);

  const handleShowRouteOnMap = useCallback(() => {
    if (sidePanel?.type === 'staff-route' && sidePanel.route.polyline) {
      setRoutePolyline(sidePanel.route.polyline);
    }
  }, [sidePanel]);

  const handleClosePanel = useCallback(() => {
    setSidePanel(null);
    setRoutePolyline(null);
  }, []);

  /* ── Derived KPIs (no extra data fetch) ── */
  const kpis = useMemo(() => {
    const staffOnDuty = timeline.filter(s => s.status !== 'off_duty').length;
    const staffOnSite = timeline.filter(s => !!s.currentJob).length;
    const jobsToday = jobQueue.length;
    const sitesCount = locations.length;
    return { staffOnDuty, staffOnSite, jobsToday, sitesCount };
  }, [timeline, jobQueue, locations]);

  const dateLabel = useMemo(() => {
    const isToday =
      format(timelineDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    const formatted = format(timelineDate, 'EEEE d MMM', { locale: sv });
    return isToday ? `Idag · ${formatted}` : formatted;
  }, [timelineDate]);

  return (
    <div className="flex h-screen overflow-hidden theme-purple"
      style={{
        background:
          'linear-gradient(180deg, hsl(270 30% 98%) 0%, hsl(275 25% 97%) 100%)',
      }}
    >
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── PREMIUM HEADER ── */}
        <header
          className="shrink-0 relative px-5 pt-4 pb-3"
          style={{
            background:
              'linear-gradient(135deg, hsl(270 50% 96%) 0%, hsl(280 45% 94%) 50%, hsl(265 40% 96%) 100%)',
            borderBottom: '1px solid hsl(270 25% 86% / 0.6)',
            boxShadow:
              'inset 0 1px 0 hsl(0 0% 100% / 0.6), 0 1px 0 hsl(270 30% 25% / 0.03)',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 20% -20%, hsl(270 60% 60% / 0.10), transparent 70%)',
            }}
          />

          <div className="relative flex items-start gap-4">
            {/* Title block */}
            <div className="flex items-center gap-3 shrink-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                style={{
                  background:
                    'linear-gradient(135deg, hsl(270 55% 60%) 0%, hsl(285 55% 45%) 100%)',
                  boxShadow:
                    '0 2px 6px hsl(270 50% 35% / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.25)',
                }}
              >
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div className="flex flex-col leading-tight">
                <h1
                  className="text-[18px] font-bold tracking-tight"
                  style={{ color: 'hsl(280 45% 18%)' }}
                >
                  Logistikplanering
                </h1>
                <span
                  className="text-[11px] font-medium flex items-center gap-1.5"
                  style={{ color: 'hsl(270 18% 42%)' }}
                >
                  <CalendarDays className="w-3 h-3" strokeWidth={2} />
                  <span className="capitalize">{dateLabel}</span>
                </span>
              </div>
            </div>

            {/* KPI Chips */}
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto pb-0.5 hide-scrollbar">
              <KpiChip
                icon={Users}
                label="Personal"
                value={kpis.staffOnDuty}
              />
              <KpiChip
                icon={ActivityIcon}
                label="På plats"
                value={kpis.staffOnSite}
                tone={kpis.staffOnSite > 0 ? 'live' : 'default'}
              />
              <KpiChip
                icon={Briefcase}
                label="Jobb"
                value={kpis.jobsToday}
              />
              <KpiChip
                icon={MapPin}
                label="Platser"
                value={kpis.sitesCount}
              />
            </div>

            {/* Broadcast CTA */}
            <button
              onClick={() => setBroadcastOpen(true)}
              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-150 hover:brightness-110"
              style={{
                background:
                  'linear-gradient(180deg, hsl(270 55% 58%) 0%, hsl(282 55% 48%) 100%)',
                boxShadow:
                  '0 1px 0 hsl(0 0% 100% / 0.2) inset, 0 2px 6px hsl(280 50% 35% / 0.28)',
              }}
            >
              <Radio className="w-3.5 h-3.5" strokeWidth={2.2} />
              Broadcast
            </button>
          </div>

          {/* Weather period strip */}
          <div className="relative mt-3">
            <LogisticsWeeklyWeatherWidget />
          </div>
        </header>

        {/* ── MAIN AREA: map-first, full width ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col gap-3 p-3">

            {/* ── HERO: FULL WIDTH LIVE MAP ── */}
            <section
              className="planning-card overflow-hidden flex flex-col"
              style={{ padding: 0, height: 'max(60vh, 620px)' }}
            >
              <div className="flex-1 min-h-0">
                <OpsLiveMap
                  locations={locations}
                  mapJobs={mapJobs}
                  isLoading={isLoadingLocations || isLoadingMapJobs}
                  focusCoords={focusCoords}
                  onOpenDM={handleOpenDM}
                  routePolyline={routePolyline}
                />
              </div>
            </section>

            {/* ── DAGENS JOBB — direkt under kartan ── */}
            <section
              className="planning-card overflow-hidden flex flex-col"
              style={{ padding: 0, height: '340px' }}
            >
              <div className="flex items-center justify-between px-3.5 pt-3 pb-2 shrink-0">
                <h3 className="planning-section-title">Dagens jobb</h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {kpis.staffOnSite} på plats · {kpis.jobsToday} jobb
                </span>
              </div>
              <OpsTodayJobsPanel
                mapJobs={mapJobs}
                timeline={timeline}
                isLoading={isLoadingMapJobs}
                onFocusJob={handleFocusJob}
                selectedBookingId={selectedJobBookingId}
              />
            </section>

            {/* ── SEKUNDÄRA PANELER — collapsade som default, lazy-mount ── */}
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
              <section className="planning-card overflow-hidden flex flex-col" style={{ padding: 0 }}>
                <CollapsibleHeader
                  title="Live projekt"
                  open={liveProjectsOpen}
                  onToggle={() => setLiveProjectsOpen((v) => !v)}
                />
                {liveProjectsOpen && (
                  <div className="max-h-[360px] overflow-y-auto px-3 pb-3">
                    <LiveProjectsPanelBody />
                  </div>
                )}
              </section>

              <section className="planning-card overflow-hidden flex flex-col" style={{ padding: 0 }}>
                <CollapsibleHeader
                  title="Platshantering"
                  open={locationsOpen}
                  onToggle={() => setLocationsOpen((v) => !v)}
                />
                {locationsOpen && (
                  <div className="p-3 max-h-[420px] overflow-y-auto">
                    <OrganizationLocationsManager />
                  </div>
                )}
              </section>

              <section className="planning-card overflow-hidden flex flex-col" style={{ padding: 0 }}>
                <CollapsibleHeader
                  title="Kommunikation"
                  open={commsOpen}
                  onToggle={() => setCommsOpen((v) => !v)}
                />
                {commsOpen && (
                  <div className="p-3 max-h-[420px] overflow-y-auto">
                    <OpsActivityComms
                      activity={activity}
                      isLoadingActivity={isLoadingActivity}
                      messages={messages}
                      isLoadingMessages={isLoadingMessages}
                      onOpenDM={handleOpenDM}
                      timeline={timeline}
                    />
                  </div>
                )}
              </section>

              <section className="planning-card overflow-hidden flex flex-col" style={{ padding: 0 }}>
                <CollapsibleHeader
                  title="Personalkalender"
                  open={staffCalendarOpen}
                  onToggle={() => setStaffCalendarOpen((v) => !v)}
                />
                {staffCalendarOpen && (
                  <div className="max-h-[480px] overflow-auto p-3 pt-0">
                    <OpsPlanningDayPanel />
                  </div>
                )}
              </section>
            </div>

          </div>
        </div>
      </div>

      {/* Broadcast Dialog */}
      <OpsBroadcastDialog
        open={broadcastOpen}
        onOpenChange={setBroadcastOpen}
        jobQueue={jobQueue}
        timeline={timeline}
      />

      {/* Side Panel */}
      {sidePanel && (
        <div className="shrink-0 w-80 animate-in slide-in-from-right duration-200">
          {sidePanel.type === 'job-chat' ? (
            <OpsJobChat
              bookingId={sidePanel.bookingId}
              bookingLabel={sidePanel.label}
              onClose={handleClosePanel}
            />
          ) : sidePanel.type === 'staff-route' ? (
            <OpsStaffRoute
              staffName={sidePanel.staffName}
              route={sidePanel.route}
              onClose={handleClosePanel}
              onShowOnMap={handleShowRouteOnMap}
            />
          ) : (
            <OpsDirectChat
              staffId={sidePanel.staffId}
              staffName={sidePanel.staffName}
              staffAssignments={sidePanel.assignments}
              onClose={handleClosePanel}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default OpsControlCenter;
