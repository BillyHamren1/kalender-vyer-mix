import { useOpsControl } from '@/hooks/useOpsControl';
import OpsMetricsBar from '@/components/ops-control/OpsMetricsBar';
import OpsStaffTimeline from '@/components/ops-control/OpsStaffTimeline';
import OpsJobQueue from '@/components/ops-control/OpsJobQueue';
import OpsActivityComms from '@/components/ops-control/OpsActivityComms';
import OpsLiveMap from '@/components/ops-control/OpsLiveMap';

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

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* TOP: Operations Bar */}
      <div className="shrink-0 border-b border-border bg-card px-4 py-2">
        <OpsMetricsBar metrics={metrics} isLoading={isLoadingMetrics} />
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
        {/* Left: Staff Timeline */}
        <div className="border-r border-border overflow-hidden p-3">
          <OpsStaffTimeline timeline={timeline} isLoading={isLoadingTimeline} />
        </div>

        {/* Right: Live Map */}
        <div className="min-h-0">
          <OpsLiveMap
            locations={locations}
            mapJobs={mapJobs}
            isLoading={isLoadingLocations || isLoadingMapJobs}
          />
        </div>
      </div>

      {/* BOTTOM AREA */}
      <div className="shrink-0 h-[260px] border-t border-border grid grid-cols-2 gap-0">
        {/* Left: Job Queue */}
        <div className="border-r border-border overflow-y-auto p-3">
          <OpsJobQueue jobs={jobQueue} isLoading={isLoadingJobQueue} />
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
  );
};

export default OpsControlCenter;
