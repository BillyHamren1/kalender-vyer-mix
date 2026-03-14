import { useQuery } from '@tanstack/react-query';
import { fetchOpsMetrics, fetchOpsTimeline, fetchOpsJobQueue, fetchOpsMapJobs, OpsMetrics, OpsTimelineStaff, OpsJobQueueItem, OpsMapJob } from '@/services/opsControlService';
import { fetchStaffMessages, fetchJobActivity, StaffMessage, JobActivityItem } from '@/services/staffDashboardService';
import { fetchStaffLocations, StaffLocation } from '@/services/planningDashboardService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

export const useOpsControl = () => {
  useRealtimeInvalidation({
    channelName: 'ops-control-realtime',
    tables: ['calendar_events', 'staff_assignments', 'booking_staff_assignments', 'bookings', 'staff_messages', 'project_comments'],
    queryKeys: [['ops-control']],
  });

  const metricsQuery = useQuery<OpsMetrics>({
    queryKey: ['ops-control', 'metrics'],
    queryFn: fetchOpsMetrics,
    refetchInterval: 60000,
  });

  const timelineQuery = useQuery<OpsTimelineStaff[]>({
    queryKey: ['ops-control', 'timeline'],
    queryFn: fetchOpsTimeline,
    refetchInterval: 120000,
  });

  const jobQueueQuery = useQuery<OpsJobQueueItem[]>({
    queryKey: ['ops-control', 'job-queue'],
    queryFn: fetchOpsJobQueue,
    refetchInterval: 60000,
  });

  const locationsQuery = useQuery<StaffLocation[]>({
    queryKey: ['ops-control', 'locations'],
    queryFn: fetchStaffLocations,
    refetchInterval: 120000,
  });

  const mapJobsQuery = useQuery<OpsMapJob[]>({
    queryKey: ['ops-control', 'map-jobs'],
    queryFn: fetchOpsMapJobs,
    refetchInterval: 120000,
  });

  const messagesQuery = useQuery<StaffMessage[]>({
    queryKey: ['ops-control', 'messages'],
    queryFn: fetchStaffMessages,
    refetchInterval: 30000,
  });

  const activityQuery = useQuery<JobActivityItem[]>({
    queryKey: ['ops-control', 'activity'],
    queryFn: fetchJobActivity,
    refetchInterval: 60000,
  });

  return {
    metrics: metricsQuery.data,
    isLoadingMetrics: metricsQuery.isLoading,
    timeline: timelineQuery.data || [],
    isLoadingTimeline: timelineQuery.isLoading,
    jobQueue: jobQueueQuery.data || [],
    isLoadingJobQueue: jobQueueQuery.isLoading,
    locations: locationsQuery.data || [],
    isLoadingLocations: locationsQuery.isLoading,
    mapJobs: mapJobsQuery.data || [],
    isLoadingMapJobs: mapJobsQuery.isLoading,
    messages: messagesQuery.data || [],
    isLoadingMessages: messagesQuery.isLoading,
    activity: activityQuery.data || [],
    isLoadingActivity: activityQuery.isLoading,
  };
};
