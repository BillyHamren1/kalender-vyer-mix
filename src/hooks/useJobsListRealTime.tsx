
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
    retry: 3, // Retry failed requests
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // Set up real-time subscriptions
  useEffect(() => {
    console.log('Setting up real-time subscriptions for jobs list');
    
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
    console.log('Manual refresh requested');
    return refetch();
  }, [refetch]);

  // Derived data - all jobs will have calendar events now
  const totalJobs = jobsList.length;
  const jobsWithCalendarEvents = jobsList.length; // All jobs have calendar events
  const jobsWithoutCalendarEvents = 0; // None without calendar events
  const newJobs = jobsList.filter(job => !job.viewed).length;

  // Enhanced error handling
  const enhancedError = error ? {
    ...error,
    message: error.message || 'Failed to load jobs list',
    timestamp: new Date().toISOString()
  } : null;

  return {
    jobsList,
    isLoading,
    error: enhancedError,
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
