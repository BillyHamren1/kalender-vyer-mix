import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchOpsMetrics, fetchOpsTimeline, fetchOpsJobQueue, fetchOpsMapJobs, OpsMetrics, OpsTimelineStaff, OpsJobQueueItem, OpsMapJob } from '@/services/opsControlService';
import { fetchStaffMessages, fetchJobActivity, StaffMessage, JobActivityItem } from '@/services/staffDashboardService';
import { fetchStaffLocations, StaffLocation } from '@/services/planningDashboardService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';
import { addDays, format } from 'date-fns';

export const useOpsControl = () => {
  const [timelineDate, setTimelineDate] = useState<Date>(new Date());

  const devLog = (scope: string, payload: any) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(`[ops-control][realtime] ${scope}`, payload);
    }
  };

  // Planning-data → invaliderar bara timeline / job-queue / map-jobs
  useRealtimeInvalidation({
    channelName: 'ops-control-planning',
    tables: [
      { table: 'calendar_events', events: ['INSERT', 'UPDATE', 'DELETE'], onEvent: (p) => { devLog('calendar_events', p?.eventType); } },
      { table: 'staff_assignments', events: ['INSERT', 'UPDATE', 'DELETE'], onEvent: (p) => { devLog('staff_assignments', p?.eventType); } },
      { table: 'booking_staff_assignments', events: ['INSERT', 'UPDATE', 'DELETE'], onEvent: (p) => { devLog('booking_staff_assignments', p?.eventType); } },
      { table: 'bookings', events: ['INSERT', 'UPDATE', 'DELETE'], onEvent: (p) => { devLog('bookings', p?.eventType); } },
    ],
    queryKeys: [
      ['ops-control', 'timeline'],
      ['ops-control', 'job-queue'],
      ['ops-control', 'map-jobs'],
    ],
    debounceMs: 1000,
  });

  // Messages → invaliderar bara messages
  useRealtimeInvalidation({
    channelName: 'ops-control-messages',
    tables: [
      { table: 'staff_messages', events: ['INSERT'], onEvent: (p) => { devLog('staff_messages', p?.eventType); } },
      { table: 'broadcast_messages', events: ['INSERT'], onEvent: (p) => { devLog('broadcast_messages', p?.eventType); } },
    ],
    queryKeys: [['ops-control', 'messages']],
    debounceMs: 1000,
  });


  const metricsQuery = useQuery<OpsMetrics>({
    queryKey: ['ops-control', 'metrics'],
    queryFn: fetchOpsMetrics,
    refetchInterval: 60000,
  });

  const dateKey = format(timelineDate, 'yyyy-MM-dd');
  const timelineQuery = useQuery<OpsTimelineStaff[]>({
    queryKey: ['ops-control', 'timeline', dateKey],
    queryFn: () => fetchOpsTimeline(timelineDate),
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

  const goToNextDay = () => setTimelineDate(prev => addDays(prev, 1));
  const goToPrevDay = () => setTimelineDate(prev => addDays(prev, -1));
  const goToToday = () => setTimelineDate(new Date());

  return {
    metrics: metricsQuery.data,
    isLoadingMetrics: metricsQuery.isLoading,
    timeline: timelineQuery.data || [],
    isLoadingTimeline: timelineQuery.isLoading,
    timelineDate,
    goToNextDay,
    goToPrevDay,
    goToToday,
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
