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
import { OpsJobQueueItem } from '@/services/opsControlService';
import { Radio } from 'lucide-react';

type SidePanel =
  | { type: 'job-chat'; bookingId: string; label: string }
  | { type: 'dm'; staffId: string; staffName: string }
  | null;

const OpsControlCenter = () => {
  const {
    metrics, isLoadingMetrics,
    timeline, isLoadingTimeline,
    jobQueue, isLoadingJobQueue,
    locations, isLoadingLocations,
    mapJobs, isLoadingMapJobs,
    messages, isLoadingMessages,
    activity, isLoadingActivity,
  } = useOpsControl();

  const [focusCoords, setFocusCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const handleFocusJob = useCallback((job: OpsJobQueueItem) => {
    if (job.latitude && job.longitude) {
      setFocusCoords({ lat: job.latitude, lng: job.longitude });
    }
  }, []);

  const handleOpenChat = useCallback((bookingId: string, label: string) => {
    setSidePanel({ type: 'job-chat', bookingId, label });
  }, []);

  const handleOpenDM = useCallback((staffId: string, staffName: string) => {
    setSidePanel({ type: 'dm', staffId, staffName });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* TOP: Operations Bar */}
        <div className="shrink-0 border-b border-border bg-card px-4 py-2">
          <OpsMetricsBar metrics={metrics} isLoading={isLoadingMetrics} />
        </div>

        {/* MAIN AREA */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          {/* Left: Staff Timeline */}
          <div className="border-r border-border overflow-hidden p-3">
            <OpsStaffTimeline timeline={timeline} isLoading={isLoadingTimeline} onOpenDM={handleOpenDM} />
          </div>

          {/* Right: Live Map */}
          <div className="min-h-0">
            <OpsLiveMap
              locations={locations}
              mapJobs={mapJobs}
              isLoading={isLoadingLocations || isLoadingMapJobs}
              focusCoords={focusCoords}
              onOpenDM={handleOpenDM}
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

      {/* Side Panel */}
      {sidePanel && (
        <div className="shrink-0 w-80 animate-in slide-in-from-right duration-200">
          {sidePanel.type === 'job-chat' ? (
            <OpsJobChat
              bookingId={sidePanel.bookingId}
              bookingLabel={sidePanel.label}
              onClose={() => setSidePanel(null)}
            />
          ) : (
            <OpsDirectChat
              staffId={sidePanel.staffId}
              staffName={sidePanel.staffName}
              onClose={() => setSidePanel(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default OpsControlCenter;
