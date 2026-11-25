import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { groupBookingDateChanges, type BookingDateChangeNotice } from '@/lib/warehouse/bookingDateChangeNotices';

const KEY = (packingId?: string) => ['booking-date-change-notices', packingId ?? 'all'];

/** Okvitterade datumnotiser. Utan packingId: alla i organisationen (RLS). */
export function useBookingDateChangeNotices(packingId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY(packingId),
    queryFn: async (): Promise<BookingDateChangeNotice[]> => {
      let q = (supabase as any)
        .from('warehouse_project_changes')
        .select('id, booking_id, booking_number, packing_id, field_name, old_value, new_value, source_revision, created_at')
        .eq('change_type', 'booking_date_changed')
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(200);
      if (packingId) q = q.eq('packing_id', packingId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BookingDateChangeNotice[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`booking-date-notices-${packingId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_project_changes' },
        () => qc.invalidateQueries({ queryKey: ['booking-date-change-notices'] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [packingId, qc]);

  const acknowledge = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('warehouse_project_changes')
        .update({ acknowledged: true, acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
        .in('id', ids)
        .eq('acknowledged', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking-date-change-notices'] }),
    onError: (e: any) => toast.error(`Kunde inte kvittera: ${e?.message || e}`),
  });

  const groups = useMemo(() => groupBookingDateChanges(query.data || []), [query.data]);
  return { groups, isLoading: query.isLoading, acknowledge };
}
