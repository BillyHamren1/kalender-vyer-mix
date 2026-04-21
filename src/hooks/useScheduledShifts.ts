import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi, ScheduledShift } from '@/services/mobileApiService';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

const STALE_TIME = 60 * 1000; // 1 minute

/**
 * Returns the staff member's planned shifts (one per calendar_events row,
 * matched via booking_staff_assignments). Subscribes to realtime changes
 * on calendar_events + booking_staff_assignments so the timeline updates
 * live when the planner moves a shift.
 */
export function useScheduledShifts() {
  const queryClient = useQueryClient();
  const { staff } = useMobileAuth();

  const query = useQuery({
    queryKey: ['mobile-shifts'],
    queryFn: async () => {
      const r = await mobileApi.getBookings();
      return (r.shifts || []) as ScheduledShift[];
    },
    staleTime: STALE_TIME,
  });

  useEffect(() => {
    if (!staff?.id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['mobile-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['mobile-bookings'] });
    };

    const channel = supabase
      .channel('mobile-shifts-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_events' },
        invalidate
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_staff_assignments', filter: `staff_id=eq.${staff.id}` },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id, queryClient]);

  return query;
}
