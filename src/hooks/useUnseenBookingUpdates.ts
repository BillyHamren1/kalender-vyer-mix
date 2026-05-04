import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UnseenBookingUpdate {
  booking_id: string;
  assigned_project_id: string | null;
  large_project_id: string | null;
  last_change_at: string;
  change_count: number;
}

export function useUnseenBookingUpdates() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unseen-booking-updates'],
    queryFn: async (): Promise<UnseenBookingUpdate[]> => {
      const { data, error } = await supabase.rpc('get_unseen_booking_updates');
      if (error) {
        console.error('[useUnseenBookingUpdates]', error);
        return [];
      }
      return (data || []) as UnseenBookingUpdate[];
    },
    staleTime: 30_000,
  });

  // Realtime: nya booking_changes → invalidera
  useEffect(() => {
    const channel = supabase
      .channel('booking-changes-unseen')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'booking_changes' },
        () => queryClient.invalidateQueries({ queryKey: ['unseen-booking-updates'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useMarkBookingChangesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc('mark_booking_changes_seen', {
        p_booking_id: bookingId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unseen-booking-updates'] });
    },
  });
}

export function useMarkAllBookingChangesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingIds: string[]) => {
      if (bookingIds.length === 0) return 0;
      await Promise.all(
        bookingIds.map((id) =>
          supabase.rpc('mark_booking_changes_seen', { p_booking_id: id }),
        ),
      );
      return bookingIds.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unseen-booking-updates'] });
    },
  });
}
