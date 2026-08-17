/**
 * useWarehouseCardMeta — READ-ONLY presentationsdata för lagerkalenderns kort.
 *
 * Hämtar enbart befintlig data (packstatus + bemanning) för att kunna visa
 * mer information i de kalenderkort som redan renderas. Skriver aldrig något,
 * rör inte datamodell eller sync.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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

      const agg = new Map<string, { total: number; packed: number; shortfallRows: number }>();
      (items || []).forEach((item) => {
        if (item.excluded) return;
        const entry = agg.get(item.packing_id) || { total: 0, packed: 0, shortfallRows: 0 };
        const toPack = Number(item.quantity_to_pack || 0);
        const packed = Math.min(Number(item.quantity_packed || 0), toPack);
        entry.total += toPack;
        entry.packed += packed;
        if (packed < toPack) entry.shortfallRows += 1;
        agg.set(item.packing_id, entry);
      });

      packings.forEach((p) => {
        const a = agg.get(p.id) || { total: 0, packed: 0, shortfallRows: 0 };
        if (!p.booking_id) return;
        result.set(p.booking_id, {
          bookingId: p.booking_id,
          status: p.status ?? null,
          total: a.total,
          packed: a.packed,
          shortfallRows: a.shortfallRows,
        });
      });

      return result;
    },
  });
}

/** Bemanning per dag + lagerkolumn: `${yyyy-MM-dd}|${teamId}` → förnamn[]. */
export function useLagerCrewByDayTeam(start: Date, end: Date) {
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['warehouse-card-crew', startKey, endKey],
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const result = new Map<string, string[]>();

      const { data: assignments, error } = await supabase
        .from('staff_assignments')
        .select('staff_id, assignment_date, team_id')
        .gte('assignment_date', startKey)
        .lte('assignment_date', endKey);

      if (error || !assignments?.length) return result;

      const lager = assignments.filter(
        (a) => typeof a.team_id === 'string' && (a.team_id.startsWith('lager-') || a.team_id === 'transport'),
      );
      if (!lager.length) return result;

      const staffIds = [...new Set(lager.map((a) => a.staff_id).filter(Boolean))] as string[];
      const { data: staff } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', staffIds);

      const nameById = new Map<string, string>();
      (staff || []).forEach((s) => nameById.set(s.id, (s.name || '').split(' ')[0] || ''));

      lager.forEach((a) => {
        const key = `${a.assignment_date}|${a.team_id}`;
        const name = nameById.get(a.staff_id as string);
        if (!name) return;
        const list = result.get(key) || [];
        if (!list.includes(name)) list.push(name);
        result.set(key, list);
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
