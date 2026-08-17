/**
 * useWarehouseCardMeta — READ-ONLY presentationsdata för lagerkalenderns kort.
 *
 * Hämtar enbart befintlig data (packstatus + projektrubrik) för att kunna visa
 * mer information i de kalenderkort som redan renderas. Skriver aldrig något,
 * rör inte datamodell eller sync.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toMap } from '@/lib/query/mapCache';

export interface WarehousePackingStat {
  bookingId: string;
  status: string | null;
  total: number;
  packed: number;
}

/** Batch-hämtar packstatus per booking_id. */
export function useWarehousePackingStats(bookingIds: string[]) {
  const ids = [...new Set(bookingIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['warehouse-card-packing-stats', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 30_000,
    select: (d: unknown) => toMap<WarehousePackingStat>(d),
    queryFn: async (): Promise<Map<string, WarehousePackingStat>> => {
      const result = new Map<string, WarehousePackingStat>();

      const { data: packings, error } = await supabase
        .from('packing_projects')
        .select('id, booking_id, status')
        .in('booking_id', ids);

      if (error || !packings?.length) return result;

      const packingIds = packings.map((p) => p.id);
      const { data: items } = await supabase
        .from('packing_list_items')
        .select('packing_id, quantity_to_pack, quantity_packed, excluded')
        .in('packing_id', packingIds);

      const agg = new Map<string, { total: number; packed: number }>();
      (items || []).forEach((item) => {
        if (item.excluded) return;
        const entry = agg.get(item.packing_id) || { total: 0, packed: 0 };
        const toPack = Number(item.quantity_to_pack || 0);
        const packed = Math.min(Number(item.quantity_packed || 0), toPack);
        entry.total += toPack;
        entry.packed += packed;
        agg.set(item.packing_id, entry);
      });

      packings.forEach((p) => {
        const a = agg.get(p.id) || { total: 0, packed: 0 };
        if (!p.booking_id) return;
        result.set(p.booking_id, {
          bookingId: p.booking_id,
          status: p.status ?? null,
          total: a.total,
          packed: a.packed,
        });
      });

      return result;
    },
  });
}

/** Bokningstitel (rubrik) per booking_id — endast läsning, för kortets projektrad. */
export function useWarehouseBookingTitles(bookingIds: string[]) {
  const ids = [...new Set(bookingIds.filter(Boolean))].sort();

  return useQuery({
    queryKey: ['warehouse-card-booking-titles', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 60_000,
    select: (d: unknown) => toMap<string>(d),
    queryFn: async (): Promise<Map<string, string>> => {
      const result = new Map<string, string>();
      const { data, error } = await supabase
        .from('bookings')
        .select('id, title')
        .in('id', ids);
      if (error || !data) return result;
      data.forEach((b) => {
        if (b.id && b.title) result.set(b.id, b.title as string);
      });
      return result;
    },
  });
}
