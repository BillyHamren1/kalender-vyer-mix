/**
 * largeProjectPlannerService
 * --------------------------------------------------------------------------
 * Service för intern bokningsplanering inne i stora projekt.
 *
 * HÅRDA REGLER:
 *  - Skriver ENDAST till `large_project_booking_plan_items`.
 *  - LÄSER `bookings`, `large_projects`, `staff_members`, `staff_assignments`,
 *    `booking_staff_assignments` för att visa kontext — aldrig skriver.
 *  - Får INTE anropas av personalkalendern, time-appen eller staff
 *    assignment-logiken.
 *
 * Se .lovable/large-project-calendar-audit.md.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  CreatePlannerItemInput,
  LargeProjectBookingPlanItem,
  LargeProjectPlannerBooking,
  LargeProjectPlannerContext,
  LargeProjectPlannerDay,
  LargeProjectPlannerStaffMember,
  SplitBookingInput,
  UpdatePlannerItemInput,
} from './largeProjectPlannerTypes';

const PLAN_TABLE = 'large_project_booking_plan_items';
// Tabellen är ny — Supabase-typerna är inte regenererade ännu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const planTable = () => (supabase.from as any)(PLAN_TABLE);

// ── Reads ──────────────────────────────────────────────────────────────────

async function fetchProjectBookings(
  largeProjectId: string,
): Promise<LargeProjectPlannerBooking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, booking_number, client, rigdaydate, eventdate, rigdowndate, ' +
        'rig_start_time, rig_end_time, event_start_time, event_end_time, ' +
        'rigdown_start_time, rigdown_end_time, deliveryaddress, delivery_city',
    )
    .eq('large_project_id', largeProjectId);

  if (error) throw error;
  // Tabellen kan returneras med smala typer beroende på Supabase-typgenerering;
  // mappa via en lös typ för att hålla servicen tålig.
  type RawBooking = {
    id: string;
    booking_number?: string | null;
    client?: string | null;
    rigdaydate?: string | null;
    eventdate?: string | null;
    rigdowndate?: string | null;
    rig_start_time?: string | null;
    rig_end_time?: string | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
    rigdown_start_time?: string | null;
    rigdown_end_time?: string | null;
    deliveryaddress?: string | null;
    delivery_city?: string | null;
  };
  const rows = ((data ?? []) as unknown as RawBooking[]);
  return rows.map((b) => ({
    id: b.id,
    booking_number: b.booking_number ?? null,
    client: b.client ?? null,
    display_name: b.client || b.booking_number || 'Bokning',
    rigdaydate: b.rigdaydate ?? null,
    eventdate: b.eventdate ?? null,
    rigdowndate: b.rigdowndate ?? null,
    rig_start_time: b.rig_start_time ?? null,
    rig_end_time: b.rig_end_time ?? null,
    event_start_time: b.event_start_time ?? null,
    event_end_time: b.event_end_time ?? null,
    rigdown_start_time: b.rigdown_start_time ?? null,
    rigdown_end_time: b.rigdown_end_time ?? null,
    deliveryaddress: b.deliveryaddress ?? null,
    delivery_city: b.delivery_city ?? null,
  }));
}

async function fetchProjectStaff(
  bookingIds: string[],
): Promise<LargeProjectPlannerStaffMember[]> {
  if (bookingIds.length === 0) return [];

  // Spegla personalkalenderns assignment-källa: BSA per bokning.
  const { data: bsa, error: bsaErr } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id, booking_id, assignment_date')
    .in('booking_id', bookingIds);
  if (bsaErr) throw bsaErr;

  const datesByStaff = new Map<string, Set<string>>();
  (bsa ?? []).forEach((row: { staff_id: string; assignment_date: string | null }) => {
    if (!row.staff_id || !row.assignment_date) return;
    const set = datesByStaff.get(row.staff_id) ?? new Set<string>();
    set.add(row.assignment_date);
    datesByStaff.set(row.staff_id, set);
  });

  const staffIds = Array.from(datesByStaff.keys());
  if (staffIds.length === 0) return [];

  const { data: staff, error: sErr } = await supabase
    .from('staff_members')
    .select('id, name, color')
    .in('id', staffIds);
  if (sErr) throw sErr;

  return (staff ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    color: (s as { color?: string | null }).color ?? null,
    assignedDates: Array.from(datesByStaff.get(s.id) ?? new Set<string>()).sort(),
  }));
}

export async function fetchLargeProjectPlannerItems(
  largeProjectId: string,
): Promise<LargeProjectBookingPlanItem[]> {
  const { data, error } = await planTable()
    .select('*')
    .eq('large_project_id', largeProjectId)
    .order('plan_date', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LargeProjectBookingPlanItem[];
}

function buildDays(items: LargeProjectBookingPlanItem[]): LargeProjectPlannerDay[] {
  const byDate = new Map<string, LargeProjectBookingPlanItem[]>();
  items.forEach((it) => {
    const list = byDate.get(it.plan_date) ?? [];
    list.push(it);
    byDate.set(it.plan_date, list);
  });
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      phase: (list.find((i) => i.phase)?.phase as LargeProjectPlannerDay['phase']) ?? null,
      items: list,
    }));
}

export async function fetchLargeProjectPlannerContext(
  largeProjectId: string,
): Promise<LargeProjectPlannerContext> {
  const [bookings, items] = await Promise.all([
    fetchProjectBookings(largeProjectId),
    fetchLargeProjectPlannerItems(largeProjectId),
  ]);
  const staff = await fetchProjectStaff(bookings.map((b) => b.id));
  return {
    projectId: largeProjectId,
    bookings,
    staff,
    items,
    days: buildDays(items),
  };
}

// ── Writes (endast plan-tabellen) ──────────────────────────────────────────

export async function createLargeProjectPlannerItem(
  input: CreatePlannerItemInput,
): Promise<LargeProjectBookingPlanItem> {
  const payload = {
    large_project_id: input.large_project_id,
    title: input.title,
    plan_date: input.plan_date,
    item_type: input.item_type ?? 'task',
    source: input.source ?? 'manual',
    status: input.status ?? 'planned',
    booking_id: input.booking_id ?? null,
    parent_item_id: input.parent_item_id ?? null,
    description: input.description ?? null,
    phase: input.phase ?? null,
    start_time: input.start_time ?? null,
    end_time: input.end_time ?? null,
    assigned_staff_id: input.assigned_staff_id ?? null,
    assigned_team_id: input.assigned_team_id ?? null,
    source_booking_phase: input.source_booking_phase ?? null,
    sort_order: input.sort_order ?? 0,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  };
  const { data, error } = await planTable().insert(payload).select('*').single();
  if (error) throw error;
  return data as LargeProjectBookingPlanItem;
}

export async function updateLargeProjectPlannerItem(
  id: string,
  updates: UpdatePlannerItemInput,
): Promise<LargeProjectBookingPlanItem> {
  const { data, error } = await planTable()
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as LargeProjectBookingPlanItem;
}

export async function deleteLargeProjectPlannerItem(id: string): Promise<void> {
  const { error } = await planTable().delete().eq('id', id);
  if (error) throw error;
}

/**
 * Dela upp en bokning i flera planner-tasks. Skapar EN parent-rad
 * (item_type='split') och en task per part. Skriver ALDRIG till bookings.
 */
export async function splitBookingIntoPlannerTasks(
  input: SplitBookingInput,
): Promise<LargeProjectBookingPlanItem[]> {
  if (!input.parts.length) return [];

  const firstDate = input.parts[0].plan_date;
  const parent = await createLargeProjectPlannerItem({
    large_project_id: input.large_project_id,
    booking_id: input.booking_id,
    title: 'Uppdelad bokning',
    plan_date: firstDate,
    item_type: 'split',
    source: 'split',
  });

  const rows = input.parts.map((p, idx) => ({
    large_project_id: input.large_project_id,
    booking_id: input.booking_id,
    parent_item_id: parent.id,
    title: p.title,
    plan_date: p.plan_date,
    item_type: 'task' as const,
    source: 'split' as const,
    status: 'planned' as const,
    phase: p.phase ?? null,
    start_time: p.start_time ?? null,
    end_time: p.end_time ?? null,
    assigned_staff_id: p.assigned_staff_id ?? null,
    assigned_team_id: p.assigned_team_id ?? null,
    notes: p.notes ?? null,
    sort_order: idx,
    metadata: {},
  }));

  const { data, error } = await planTable().insert(rows).select('*');
  if (error) throw error;
  return [parent, ...((data ?? []) as LargeProjectBookingPlanItem[])];
}

export interface SeedPlannerItemsResult {
  created: LargeProjectBookingPlanItem[];
  createdCount: number;
  skippedCount: number;
  errors: string[];
}

/**
 * Skapa planner-items (EN per bokning) som speglar projektets bokningar.
 * Idempotent: hoppar över bokningar som redan har minst ett booking-source-item.
 * Skriver ENDAST till `large_project_booking_plan_items`.
 */
export async function createPlannerItemsFromProjectBookings(
  largeProjectId: string,
): Promise<SeedPlannerItemsResult> {
  const errors: string[] = [];
  let bookings: LargeProjectPlannerBooking[] = [];
  let existing: LargeProjectBookingPlanItem[] = [];
  try {
    [bookings, existing] = await Promise.all([
      fetchProjectBookings(largeProjectId),
      fetchLargeProjectPlannerItems(largeProjectId),
    ]);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }

  const existingBookingIds = new Set(
    existing
      .filter((i) => i.source === 'booking' && i.booking_id)
      .map((i) => i.booking_id as string),
  );

  const projectFallbackDate = bookings
    .map((b) => b.rigdaydate ?? b.eventdate ?? b.rigdowndate)
    .find((d): d is string => !!d) ?? null;

  const rows: CreatePlannerItemInput[] = [];
  let skippedCount = 0;

  bookings.forEach((b) => {
    if (existingBookingIds.has(b.id)) {
      skippedCount += 1;
      return;
    }
    const planDate =
      b.rigdaydate ?? b.eventdate ?? b.rigdowndate ?? projectFallbackDate;
    if (!planDate) {
      errors.push(`${b.display_name}: saknar datum`);
      return;
    }
    const startTime =
      b.rig_start_time ?? b.event_start_time ?? b.rigdown_start_time ?? null;
    const endTime =
      b.rig_end_time ?? b.event_end_time ?? b.rigdown_end_time ?? null;
    const titleParts = [b.booking_number, b.client].filter(Boolean) as string[];
    const title = titleParts.length ? titleParts.join(' – ') : b.display_name;

    rows.push({
      large_project_id: largeProjectId,
      booking_id: b.id,
      title,
      plan_date: planDate,
      item_type: 'booking',
      source: 'booking',
      status: 'unplanned',
      start_time: startTime,
      end_time: endTime,
      assigned_staff_id: null,
      assigned_team_id: null,
    });
  });

  if (rows.length === 0) {
    return { created: [], createdCount: 0, skippedCount, errors };
  }

  const { data, error } = await planTable().insert(rows).select('*');
  if (error) {
    errors.push(error.message);
    return { created: [], createdCount: 0, skippedCount, errors };
  }
  const created = (data ?? []) as LargeProjectBookingPlanItem[];
  return { created, createdCount: created.length, skippedCount, errors };
}

// Re-export för test/extern användning
export { buildDays as __buildPlannerDays };

