import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncJob {
  id: string;
  booking_id: string;
  organization_id: string;
  event_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  received_at: string;
  started_at: string | null;
  processed_at: string | null;
}

export const useSyncJobs = (statusFilter?: string) => {
  return useQuery({
    queryKey: ['sync-jobs', statusFilter],
    queryFn: async (): Promise<SyncJob[]> => {
      let query = supabase
        .from('booking_sync_jobs' as any)
        .select('*')
        .order('received_at', { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SyncJob[];
    },
    refetchInterval: 10000,
  });
};

export const useSyncJobStats = () => {
  return useQuery({
    queryKey: ['sync-job-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('booking_sync_jobs' as any)
        .select('status');

      if (error) throw error;
      const jobs = (data || []) as unknown as { status: string }[];

      return {
        pending: jobs.filter(j => j.status === 'pending').length,
        processing: jobs.filter(j => j.status === 'processing').length,
        completed: jobs.filter(j => j.status === 'completed').length,
        failed: jobs.filter(j => j.status === 'failed').length,
        total: jobs.length,
      };
    },
    refetchInterval: 10000,
  });
};
