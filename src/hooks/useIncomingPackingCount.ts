import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from './useRealtimeInvalidation';

/**
 * Returns the count of project bookings that don't have a packing_project yet.
 * Used for sidebar badge notifications.
 */
export function useIncomingPackingCount(): number {
  useRealtimeInvalidation({
    channelName: 'incoming-packing-count',
    tables: ['packing_projects', 'jobs', 'projects', 'large_project_bookings', 'bookings'],
    queryKeys: [['incoming-packing-count']],
  });

  const { data: count = 0 } = useQuery({
    queryKey: ['incoming-packing-count'],
    queryFn: async () => {
      const [{ data: jobBookingIds }, { data: projectBookingIds }, { data: largeLinks }] = await Promise.all([
        supabase.from('jobs').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('projects').select('booking_id').not('status', 'in', '("completed","cancelled")').not('booking_id', 'is', null),
        supabase.from('large_project_bookings').select('booking_id'),
      ]);

      const allIds = new Set([
        ...(jobBookingIds || []).map(j => j.booking_id).filter(Boolean),
        ...(projectBookingIds || []).map(p => p.booking_id).filter(Boolean),
        ...(largeLinks || []).map(l => l.booking_id).filter(Boolean),
      ]);

      if (allIds.size === 0) return 0;

      const ids = Array.from(allIds);

      const [{ data: existingPackings }, { data: activeBookings }] = await Promise.all([
        supabase.from('packing_projects').select('booking_id').in('booking_id', ids),
        supabase.from('bookings').select('id').in('id', ids).neq('status', 'CANCELLED'),
      ]);

      const packedIds = new Set((existingPackings || []).map(p => p.booking_id).filter(Boolean));
      const activeIds = new Set((activeBookings || []).map(b => b.id));

      return ids.filter(id => activeIds.has(id) && !packedIds.has(id)).length;
    },
    staleTime: 30000,
  });

  return count;
}
