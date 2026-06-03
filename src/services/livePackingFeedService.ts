import { supabase } from '@/integrations/supabase/client';
import { debugTimed } from '@/lib/performance/debugTiming';
import type { PackingStatus } from '@/types/packing';

export type LivePackingStatus = Extract<
  PackingStatus,
  'in_progress' | 'packed' | 'delivered' | 'back' | 'returning'
>;

export const LIVE_STATUSES: LivePackingStatus[] = [
  'in_progress',
  'packed',
  'delivered',
  'back',
  'returning',
];

export interface LivePackingItem {
  id: string;
  name: string;
  status: LivePackingStatus;
  updated_at: string;
  client_name: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  start_date: string | null;
  end_date: string | null;
  project_leader: string | null;
  booking_id: string | null;
  large_project_id: string | null;
  booking_number: string | null;
}

export interface LivePackingActivityCounts {
  files: number;
  expenses: number;
  comments: number;
  invoices: number;
  total: number;
  lastEventAt: string | null;
}

export async function fetchLivePackingProjects(): Promise<LivePackingItem[]> {
  const extra: Record<string, unknown> = {};
  return debugTimed('fetchLivePackingProjects', async () => {
  // 1. packing_projects in live phases
  const { data: packings, error } = await supabase
    .from('packing_projects')
    .select(
      'id, name, status, updated_at, client_name, delivery_address, start_date, end_date, project_leader, booking_id, large_project_id'
    )
    .in('status', LIVE_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  extra.packings = packings?.length || 0;
  if (!packings || packings.length === 0) return [];

  // 2. Optional booking enrichment (city + booking_number)
  const bookingIds = Array.from(
    new Set((packings as Array<{ booking_id: string | null }>).map(p => p.booking_id).filter((x): x is string => !!x))
  );
  extra.bookingIds = bookingIds.length;

  let bookingMap = new Map<string, { booking_number: string | null; delivery_city: string | null }>();
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, booking_number, delivery_city')
      .in('id', bookingIds);
    bookingMap = new Map(
      (bookings || []).map((b: any) => [b.id, { booking_number: b.booking_number, delivery_city: b.delivery_city }])
    );
  }

  const result = (packings as any[]).map(p => {
    const enrich = p.booking_id ? bookingMap.get(p.booking_id) : undefined;
    return {
      id: p.id,
      name: p.name,
      status: p.status as LivePackingStatus,
      updated_at: p.updated_at,
      client_name: p.client_name,
      delivery_address: p.delivery_address,
      delivery_city: enrich?.delivery_city ?? null,
      start_date: p.start_date,
      end_date: p.end_date,
      project_leader: p.project_leader,
      booking_id: p.booking_id,
      large_project_id: p.large_project_id,
      booking_number: enrich?.booking_number ?? null,
    };
  });
  return result;
  }, extra);
}

const isoOrFallback = (since: number | undefined): string => {
  const ts = since && since > 0 ? since : Date.now() - 24 * 60 * 60 * 1000;
  return new Date(ts).toISOString();
};

export async function fetchActivityCounts(
  packingIds: string[],
  seenAtMap: Record<string, number | undefined>
): Promise<Record<string, LivePackingActivityCounts>> {
  return debugTimed('fetchActivityCounts', async () => {
  const result: Record<string, LivePackingActivityCounts> = {};
  if (packingIds.length === 0) return result;

  // Initialize zero counts so consumers can rely on the keys
  packingIds.forEach(id => {
    result[id] = { files: 0, expenses: 0, comments: 0, invoices: 0, total: 0, lastEventAt: null };
  });

  const since = Math.min(...packingIds.map(id => seenAtMap[id] ?? Date.now() - 24 * 60 * 60 * 1000));
  const sinceIso = new Date(since).toISOString();

  const tables: Array<{ key: keyof Omit<LivePackingActivityCounts, 'total' | 'lastEventAt'>; table: string }> = [
    { key: 'files', table: 'packing_files' },
    { key: 'expenses', table: 'packing_purchases' },
    { key: 'comments', table: 'packing_comments' },
    { key: 'invoices', table: 'packing_invoices' },
  ];

  await Promise.all(
    tables.map(async ({ key, table }) => {
      const dateCol = table === 'packing_files' ? 'uploaded_at' : 'created_at';
      const { data } = await supabase
        .from(table as any)
        .select(`packing_id, ${dateCol}`)
        .in('packing_id', packingIds)
        .gte(dateCol, sinceIso)
        .limit(2000);

      (data || []).forEach((row: any) => {
        const pid = row.packing_id as string;
        const ts = row[dateCol] as string;
        const seen = seenAtMap[pid] ?? Date.now() - 24 * 60 * 60 * 1000;
        if (new Date(ts).getTime() <= seen) return;
        const bucket = result[pid];
        if (!bucket) return;
        bucket[key] += 1;
        bucket.total += 1;
        if (!bucket.lastEventAt || new Date(ts) > new Date(bucket.lastEventAt)) {
          bucket.lastEventAt = ts;
        }
      });
    })
  );

  // Loose fallback: if seenAtMap missing → bucket already aggregated above.
  void isoOrFallback;
  return result;
  }, { packingIds: packingIds.length });
}
