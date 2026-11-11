import { useQuery } from '@tanstack/react-query';
import { fetchStaffMessages, fetchJobActivity, StaffMessage, JobActivityItem } from '@/services/staffDashboardService';
import { fetchStaffLocations, StaffLocation } from '@/services/planningDashboardService';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

interface StaffDashboardOptions {
  messages?: boolean;
  activity?: boolean;
  locations?: boolean;
}

export const useStaffDashboard = ({ messages = true, activity = true, locations = true }: StaffDashboardOptions = {}) => {
  useRealtimeInvalidation({
    channelName: 'staff-dashboard-realtime',
    tables: ['staff_messages', 'project_files', 'time_reports', 'direct_messages', 'broadcast_messages', 'job_messages'],
    queryKeys: [['staff-dashboard-messages'], ['staff-dashboard-activity'], ['staff-dashboard-locations']],
  });

  const messagesQuery = useQuery<StaffMessage[]>({
    queryKey: ['staff-dashboard-messages'],
    queryFn: fetchStaffMessages,
    enabled: messages,
    refetchInterval: 300000,
  });

  const activityQuery = useQuery<JobActivityItem[]>({
    queryKey: ['staff-dashboard-activity'],
    queryFn: fetchJobActivity,
    enabled: activity,
    refetchInterval: 300000,
  });

  const locationsQuery = useQuery<StaffLocation[]>({
    queryKey: ['staff-dashboard-locations'],
    queryFn: fetchStaffLocations,
    enabled: locations,
    refetchInterval: 300000,
  });

  return {
    messages: messagesQuery.data || [],
    isLoadingMessages: messagesQuery.isLoading,
    activity: activityQuery.data || [],
    isLoadingActivity: activityQuery.isLoading,
    locations: locationsQuery.data || [],
    isLoadingLocations: locationsQuery.isLoading,
  };
};
