import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getOrganizationId } from '@/hooks/useOrganizationId';

export interface BookingStatusChange {
  bookingId: string;
  from: string | null;
  to: string | null;
  changedAt: string;
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'Bekräftad',
  OFFER: 'Offert',
  CANCELLED: 'Avbokad',
};

export function bookingStatusLabel(status?: string | null): string {
  if (!status) return 'Okänd';
  return BOOKING_STATUS_LABELS[status.toUpperCase()] ?? status;
}

/**
 * Läser de senaste statusändringarna (från booking_changes) för en uppsättning
 * bokningar, så att inkorgen kan visa "Bekräftad → Offert" i klartext istället
 * för bara "1 ändring väntar".
 */
export function useBookingStatusChanges(bookingIds: string[]) {
  const sortedIds = [...bookingIds].sort();
  return useQuery({
    queryKey: ['booking-status-changes', sortedIds.join(',')],
    enabled: sortedIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, BookingStatusChange>> => {
      const { data, error } = await supabase
        .from('booking_changes')
        .select('booking_id, changed_at, changed_fields, previous_values, new_values')
        .in('booking_id', sortedIds)
        .order('changed_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('[useBookingStatusChanges]', error);
        return {};
      }

      const map: Record<string, BookingStatusChange> = {};
      for (const row of data || []) {
        const fields = (row.changed_fields as any) ?? null;
        const hasStatus = Array.isArray(fields)
          ? fields.includes('status')
          : fields && typeof fields === 'object'
            ? Object.prototype.hasOwnProperty.call(fields, 'status')
            : false;
        if (!hasStatus) continue;
        const id = String(row.booking_id);
        if (map[id]) continue; // senaste först
        map[id] = {
          bookingId: id,
          from: (row.previous_values as any)?.status ?? null,
          to: (row.new_values as any)?.status ?? null,
          changedAt: row.changed_at as string,
        };
      }
      return map;
    },
  });
}

/** Manuell "Hämta status nu" för en enskild bokning. */
export function useRefreshSingleBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const orgId = (await getOrganizationId()) ?? undefined;
      const { data, error } = await supabase.functions.invoke('import-bookings', {
        body: { booking_id: bookingId, syncMode: 'single', organization_id: orgId, skip_review: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unseen-booking-updates'] });
      queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
      queryClient.invalidateQueries({ queryKey: ['updated-bookings-meta'] });
      queryClient.invalidateQueries({ queryKey: ['booking-status-changes'] });
    },
  });
}
