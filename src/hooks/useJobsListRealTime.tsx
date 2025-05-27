
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJobsList, subscribeToJobsListUpdates } from '@/services/jobsListService';
import { JobsListItem, JobsListFilters } from '@/types/jobsList';

export const useJobsListRealTime = (initialFilters?: JobsListFilters) => {
  const [filters, setFilters] = useState<JobsListFilters>(initialFilters || {});
  const queryClient = useQueryClient();

  const { data: jobsList = [], isLoading, error, refetch } = useQuery({
    queryKey: ['jobsList', filters],
    queryFn: () => fetchJobsList(filters),
    refetchInterval: 30000, // Fallback polling every 30 seconds
  });

  // Set up real-time subscriptions
  useEffect(() => {
    console.log('Setting up real-time subscriptions for jobs list (calendar events only)');
    
    const unsubscribe = subscribeToJobsListUpdates(() => {
      console.log('Real-time update detected, refreshing jobs list');
      // Invalidate and refetch the jobs list
      queryClient.invalidateQueries({ queryKey: ['jobsList'] });
    });

    return () => {
      console.log('Cleaning up real-time subscriptions');
      unsubscribe();
    };
  }, [queryClient]);

  const updateFilters = useCallback((newFilters: Partial<JobsListFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
  }, []);

  const refreshJobs = useCallback(() => {
    return refetch();
  }, [refetch]);

  // Derived data - all jobs will have calendar events now
  const totalJobs = jobsList.length;
  const jobsWithCalendarEvents = jobsList.length; // All jobs have calendar events
  const jobsWithoutCalendarEvents = 0; // None without calendar events
  const newJobs = jobsList.filter(job => !job.viewed).length;

  return {
    jobsList,
    isLoading,
    error,
    filters,
    updateFilters,
    clearFilters,
    refreshJobs,
    // Statistics
    totalJobs,
    jobsWithCalendarEvents,
    jobsWithoutCalendarEvents,
    newJobs
  };
};
