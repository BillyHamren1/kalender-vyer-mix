/**
 * Typer för intern bokningsplanering inne i stora projekt.
 * Isolerat från personalkalenderns dataskrivning — endast tabellen
 * `large_project_booking_plan_items` muteras härifrån.
 */

export type LargeProjectPlannerItemType = 'booking' | 'task' | 'manual' | 'split';
export type LargeProjectPlannerItemStatus =
  | 'unplanned'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'blocked';
export type LargeProjectPlannerSource = 'booking' | 'manual' | 'split';

export interface LargeProjectBookingPlanItem {
  id: string;
  large_project_id: string;
  booking_id: string | null;
  parent_item_id: string | null;
  title: string;
  description: string | null;
  item_type: LargeProjectPlannerItemType;
  phase: string | null;
  plan_date: string; // ISO date (yyyy-MM-dd)
  start_time: string | null; // HH:mm:ss
  end_time: string | null;
  assigned_staff_id: string | null;
  assigned_team_id: string | null;
  status: LargeProjectPlannerItemStatus;
  source: LargeProjectPlannerSource;
  source_booking_phase: string | null;
  sort_order: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  /** Låser tider och teamflytt mot ändringar/drag/resize (mirror av personalkalenderns calendar_events.times_locked). */
  times_locked?: boolean;
  /** Koppling till en specifik orderrad i bokningen (booking_products.id). */
  booking_product_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Read-only projektion av en bokning i det stora projektet. */
export interface LargeProjectPlannerBooking {
  id: string;
  booking_number: string | null;
  client: string | null;
  display_name: string;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  internalnotes: string | null;
  rig_dates: string[];
  event_dates: string[];
  rigdown_dates: string[];
}

/**
 * Read-only personal — speglar personalkalenderns assignment-källa.
 * Får ALDRIG skrivas tillbaka härifrån.
 */
export interface LargeProjectPlannerStaffMember {
  id: string;
  name: string;
  color: string | null;
  /** Datum (yyyy-MM-dd) där personen är bemannad på stora projektet i personalkalendern. */
  assignedDates: string[];
}

/** En dag i den interna projektplanen — items för dagen + ev. fas-tagg. */
export interface LargeProjectPlannerDay {
  date: string; // yyyy-MM-dd
  phase: 'rig' | 'event' | 'rigDown' | null;
  items: LargeProjectBookingPlanItem[];
}

/** Ett team som projektet "äger" en specifik dag (read-only spegling från personalkalendern). */
export interface LargeProjectPlannerTeam {
  /** team-id ur staff_assignments / calendar_events.resource_id (ex "team-1"). */
  teamId: string;
  /** Visningsnamn (ex "Team 1"). */
  teamTitle: string;
  /** Sorteringsindex (1-baserat, från personalkalenderns ordning). */
  order: number;
  /** Personer som är bemannade i teamet den dagen. */
  staff: Array<{ id: string; name: string; color: string | null }>;
}

export interface LargeProjectPlannerContext {
  projectId: string;
  bookings: LargeProjectPlannerBooking[];
  staff: LargeProjectPlannerStaffMember[];
  items: LargeProjectBookingPlanItem[];
  days: LargeProjectPlannerDay[];
  /** Bemanning per datum (yyyy-MM-dd) — speglar personalkalenderns storprojektbemanning. */
  staffByDay: Record<string, LargeProjectPlannerStaffMember[]>;
  /** Team-kolumner per datum (yyyy-MM-dd) — projektkalenderns kolumner. */
  teamsByDay: Record<string, LargeProjectPlannerTeam[]>;
}

// ── Write inputs ────────────────────────────────────────────────────────────

export interface CreatePlannerItemInput {
  large_project_id: string;
  title: string;
  plan_date: string;
  item_type?: LargeProjectPlannerItemType;
  source?: LargeProjectPlannerSource;
  status?: LargeProjectPlannerItemStatus;
  booking_id?: string | null;
  parent_item_id?: string | null;
  description?: string | null;
  phase?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  assigned_staff_id?: string | null;
  assigned_team_id?: string | null;
  source_booking_phase?: string | null;
  sort_order?: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  booking_product_id?: string | null;
}

export type UpdatePlannerItemInput = Partial<
  Omit<LargeProjectBookingPlanItem, 'id' | 'created_at' | 'updated_at' | 'large_project_id'>
>;

export interface SplitBookingInput {
  large_project_id: string;
  booking_id: string;
  /** En delpost per planerad sub-task. */
  parts: Array<{
    title: string;
    plan_date: string;
    phase?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    assigned_staff_id?: string | null;
    assigned_team_id?: string | null;
    notes?: string | null;
  }>;
}
