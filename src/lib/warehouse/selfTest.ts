/**
 * Warehouse logged-in self test — READ-ONLY.
 *
 * Kör hela warehouse-smoken (A–H) som den inloggade användaren direkt i
 * produktionsmiljön. Gör ALDRIG några skrivningar: inga inserts, updates,
 * deletes, migrationer eller sync-anrop. Endast selects + rena funktioner.
 */
import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toDisplayResources, isLegacyLagerResourceId } from '@/lib/warehouse/warehouseCalendarDisplay';
import { buildWarehouseProductivityReadModel } from '@/lib/warehouse/productivity';

export type SelfTestStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface SelfTestResult {
  id: string;
  label: string;
  status: SelfTestStatus;
  detail: string;
  durationMs: number;
}

type Check = { id: string; label: string; run: () => Promise<Omit<SelfTestResult, 'id' | 'label' | 'durationMs'>> };

const ok = (detail: string) => ({ status: 'pass' as const, detail });
const bad = (detail: string) => ({ status: 'fail' as const, detail });
const warn = (detail: string) => ({ status: 'warn' as const, detail });

const today = () => format(new Date(), 'yyyy-MM-dd');
const plus = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd');

const checks: Check[] = [
  {
    id: 'A1',
    label: 'Inloggad session',
    run: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ? ok(`Inloggad som ${data.user.email ?? data.user.id}`) : bad('Ingen inloggad användare');
    },
  },
  {
    id: 'A2',
    label: 'Organisation (multi-tenant)',
    run: async () => {
      const { data, error } = await supabase.rpc('get_user_organization_id');
      if (error) return bad(`RPC-fel: ${error.message}`);
      return data ? ok(`organization_id: ${String(data)}`) : bad('Ingen organisation kopplad till användaren');
    },
  },
  {
    id: 'B1',
    label: 'Lagerkalender: händelser läsbara (14 dagar)',
    run: async () => {
      const { data, error } = await supabase
        .from('warehouse_calendar_events')
        .select('id, title, event_type, start_time')
        .gte('start_time', `${today()}T00:00:00`)
        .lte('start_time', `${plus(14)}T23:59:59`)
        .limit(500);
      if (error) return bad(`Läsfel: ${error.message}`);
      const n = data?.length ?? 0;
      return n > 0 ? ok(`${n} lagerhändelser i fönstret`) : warn('0 händelser i fönstret (kan vara korrekt om inget planerat)');
    },
  },
  {
    id: 'B2',
    label: 'Endast riktiga lageraktiviteter i kalendern',
    run: async () => {
      const { data, error } = await supabase
        .from('warehouse_calendar_events')
        .select('event_type')
        .gte('start_time', `${today()}T00:00:00`)
        .lte('start_time', `${plus(14)}T23:59:59`)
        .limit(500);
      if (error) return bad(`Läsfel: ${error.message}`);
      const planning = (data || []).filter((r) => ['rig', 'event', 'rigdown', 'rigg', 'riv'].includes(String(r.event_type)));
      return planning.length === 0
        ? ok('Inga rigg/event/riv-poster som egna lagerkort')
        : warn(`${planning.length} planeringsposter finns i datat – ska filtreras bort i UI`);
    },
  },
  {
    id: 'C1',
    label: 'Team 1-N döljs i UI',
    run: async () => {
      const resources = [
        { id: 'lager-1', title: 'Lager 1' },
        { id: 'lager-3', title: 'Lager 3' },
        { id: 'transport', title: 'Transport' },
      ] as Parameters<typeof toDisplayResources>[0];
      const display = toDisplayResources(resources);
      const leaking = display.filter((r) => isLegacyLagerResourceId(r.id) && r.title !== 'Lager');
      const idsIntact = display.map((r) => r.id).join(',') === 'lager-1,lager-3,transport';
      if (leaking.length > 0) return bad('Lager-N syns fortfarande i UI-titlar');
      return idsIntact ? ok('Titlar maskade till "Lager", tekniska id:n orörda') : bad('Resurs-id:n har förändrats');
    },
  },
  {
    id: 'D1',
    label: 'Exact-event assignment (staff_id ↔ event/packing)',
    run: async () => {
      const { data, error } = await supabase
        .from('warehouse_assignments')
        .select('id, staff_id, warehouse_event_id, packing_id, assignment_date')
        .gte('assignment_date', plus(-7))
        .lte('assignment_date', plus(14))
        .limit(500);
      if (error) return bad(`Läsfel: ${error.message}`);
      const rows = data || [];
      if (rows.length === 0) return warn('Inga tilldelningar i fönstret');
      const loose = rows.filter((r) => !r.warehouse_event_id && !r.packing_id);
      const noStaff = rows.filter((r) => !r.staff_id);
      if (loose.length > 0) return bad(`${loose.length} tilldelningar saknar event/packning (team-spillover-risk)`);
      if (noStaff.length > 0) return bad(`${noStaff.length} tilldelningar saknar staff_id`);
      return ok(`${rows.length} tilldelningar, alla knutna till konkret event/packning`);
    },
  },
  {
    id: 'D2',
    label: 'Inga dubbletter (samma person, samma event)',
    run: async () => {
      const { data, error } = await supabase
        .from('warehouse_assignments')
        .select('staff_id, warehouse_event_id, packing_id, assignment_date')
        .gte('assignment_date', plus(-7))
        .lte('assignment_date', plus(14))
        .limit(500);
      if (error) return bad(`Läsfel: ${error.message}`);
      const seen = new Set<string>();
      let dupes = 0;
      for (const r of data || []) {
        const key = `${r.staff_id}|${r.warehouse_event_id ?? ''}|${r.packing_id ?? ''}|${r.assignment_date}`;
        if (seen.has(key)) dupes += 1;
        seen.add(key);
      }
      return dupes === 0 ? ok('Inga dubbletter') : bad(`${dupes} dubbletter hittade`);
    },
  },
  {
    id: 'E1',
    label: 'Packningar läsbara',
    run: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, name, status, booking_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return bad(`Läsfel: ${error.message}`);
      const n = data?.length ?? 0;
      return n > 0 ? ok(`${n} packningar läsbara (senaste: ${data?.[0]?.name ?? '—'})`) : warn('Inga packningar hittades');
    },
  },
  {
    id: 'E2',
    label: 'Packlista har rader (senaste packningen)',
    run: async () => {
      const { data: packings, error } = await supabase
        .from('packing_projects')
        .select('id, name')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) return bad(`Läsfel: ${error.message}`);
      const packing = packings?.[0];
      if (!packing) return { status: 'skip' as const, detail: 'Ingen packning att kontrollera' };
      const { count, error: itemErr } = await supabase
        .from('packing_list_items')
        .select('id', { count: 'exact', head: true })
        .eq('packing_id', packing.id);
      if (itemErr) return bad(`Läsfel rader: ${itemErr.message}`);
      return (count ?? 0) > 0
        ? ok(`${count} rader i "${packing.name}"`)
        : warn(`0 rader i "${packing.name}" (kan vara ny packning)`);
    },
  },
  {
    id: 'F1',
    label: 'Booking → lagerbehov (inbox)',
    run: async () => {
      const { data, error } = await supabase
        .from('warehouse_project_inbox')
        .select('id, source_booking_id, status')
        .limit(500);
      if (error) return bad(`Läsfel: ${error.message}`);
      const rows = data || [];
      const byBooking = new Map<string, number>();
      for (const r of rows) {
        const k = String(r.source_booking_id ?? r.id);
        byBooking.set(k, (byBooking.get(k) ?? 0) + 1);
      }
      const dupes = [...byBooking.values()].filter((v) => v > 1).length;
      if (dupes > 0) return bad(`${dupes} bokningar har flera inbox-poster (dubblettskydd brister)`);
      return ok(`${rows.length} inbox-poster, inga dubbletter per bokning`);
    },
  },
  {
    id: 'G1',
    label: 'Lagerprojekt läsbara',
    run: async () => {
      const { count, error } = await supabase
        .from('warehouse_projects')
        .select('id', { count: 'exact', head: true });
      if (error) return bad(`Läsfel: ${error.message}`);
      return ok(`${count ?? 0} lagerprojekt`);
    },
  },
  {
    id: 'H1',
    label: 'Produktivitetsmodell (read-only)',
    run: async () => {
      const model = buildWarehouseProductivityReadModel([
        { id: 'o1', staffId: 's1', activityType: 'packing', date: today(), plannedMinutes: 60, actualMinutes: 60, complexity: 10 },
        { id: 'o2', staffId: 's1', activityType: 'packing', date: today(), plannedMinutes: 60, actualMinutes: 70, complexity: 10 },
        { id: 'o3', staffId: 's1', activityType: 'packing', date: today(), plannedMinutes: 60, actualMinutes: 65, complexity: 10 },
      ] as Parameters<typeof buildWarehouseProductivityReadModel>[0]);
      return model ? ok('Modellen byggs utan personalscoring') : bad('Modellen kunde inte byggas');
    },
  },
];

export async function runWarehouseSelfTest(
  onProgress?: (result: SelfTestResult) => void,
): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  for (const check of checks) {
    const started = performance.now();
    let outcome: Omit<SelfTestResult, 'id' | 'label' | 'durationMs'>;
    try {
      outcome = await check.run();
    } catch (e) {
      outcome = bad(e instanceof Error ? e.message : String(e));
    }
    const result: SelfTestResult = {
      id: check.id,
      label: check.label,
      durationMs: Math.round(performance.now() - started),
      ...outcome,
    };
    results.push(result);
    onProgress?.(result);
  }
  return results;
}

export const selfTestCheckCount = checks.length;
