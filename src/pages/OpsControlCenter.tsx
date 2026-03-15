import { useState, useCallback } from 'react';
import { useOpsControl } from '@/hooks/useOpsControl';
import OpsMetricsBar from '@/components/ops-control/OpsMetricsBar';
import OpsStaffTimeline from '@/components/ops-control/OpsStaffTimeline';
import OpsJobQueue from '@/components/ops-control/OpsJobQueue';
import OpsActivityComms from '@/components/ops-control/OpsActivityComms';
import OpsLiveMap from '@/components/ops-control/OpsLiveMap';
import OpsJobChat from '@/components/ops-control/OpsJobChat';
import OpsDirectChat from '@/components/ops-control/OpsDirectChat';
import OpsBroadcastDialog from '@/components/ops-control/OpsBroadcastDialog';
import OpsStaffRoute from '@/components/ops-control/OpsStaffRoute';
import { OpsJobQueueItem, OpsTimelineAssignment } from '@/services/opsControlService';
import { optimizeStaffRoute, StaffRouteResult } from '@/services/staffRouteService';
import { Radio } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

type SidePanel =
  | { type: 'job-chat'; bookingId: string; label: string }
  | { type: 'dm'; staffId: string; staffName: string; assignments: OpsTimelineAssignment[] }
  | { type: 'staff-route'; staffName: string; route: StaffRouteResult }
  | null;

const OpsControlCenter = () => {
  const {
    metrics, isLoadingMetrics,
    timeline, isLoadingTimeline,
    timelineDate, goToNextDay, goToPrevDay, goToToday,
    jobQueue, isLoadingJobQueue,
    locations, isLoadingLocations,
    mapJobs, isLoadingMapJobs,
    messages, isLoadingMessages,
    activity, isLoadingActivity,
  } = useOpsControl();

  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [routePolyline, setRoutePolyline] = useState<GeoJSON.LineString | null>(null);

  const handleFocusJob = useCallback((job: OpsJobQueueItem) => {
    if (job.latitude && job.longitude) {
      setFocusCoords({ lat: job.latitude, lng: job.longitude });
    }
  }, []);

  const handleOpenChat = useCallback((bookingId: string, label: string) => {
    setSidePanel({ type: 'job-chat', bookingId, label });
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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* TOP: Operations Bar */}
        <div className="shrink-0 border-b border-border bg-card px-4 py-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <OpsMetricsBar metrics={metrics} isLoading={isLoadingMetrics} />
          </div>
          <button
            onClick={() => setBroadcastOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <Radio className="w-3.5 h-3.5" />
            Broadcast
          </button>
        </div>

        {/* MAIN AREA */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          {/* Left: Staff Timeline */}
          <div className="border-r border-border overflow-hidden p-3">
            <OpsStaffTimeline
              timeline={timeline}
              isLoading={isLoadingTimeline}
              onOpenDM={handleOpenDM}
              onOptimizeRoute={handleOptimizeRoute}
              date={timelineDate}
              onNextDay={goToNextDay}
              onPrevDay={goToPrevDay}
              onToday={goToToday}
            />
          </div>

          {/* Right: Live Map */}
          <div className="min-h-0">
            <OpsLiveMap
              locations={locations}
              mapJobs={mapJobs}
              isLoading={isLoadingLocations || isLoadingMapJobs}
              focusCoords={focusCoords}
              onOpenDM={handleOpenDM}
              routePolyline={routePolyline}
            />
          </div>
        </div>

        {/* BOTTOM AREA */}
        <div className="shrink-0 h-[260px] border-t border-border grid grid-cols-2 gap-0">
          {/* Left: Job Queue */}
          <div className="border-r border-border overflow-y-auto p-3">
            <OpsJobQueue
              jobs={jobQueue}
              isLoading={isLoadingJobQueue}
              onFocusJob={handleFocusJob}
              onOpenChat={handleOpenChat}
            />
          </div>

          {/* Right: Activity & Comms */}
          <div className="overflow-y-auto p-3">
            <OpsActivityComms
              activity={activity}
              isLoadingActivity={isLoadingActivity}
              messages={messages}
              isLoadingMessages={isLoadingMessages}
            />
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
