/**
 * projectHoursService.ts
 * ======================
 *
 * SINGLE SOURCE för projektets rapporterade personaltimmar.
 *
 * Projektets rapporterade personaltimmar kommer från `staff_day_report_cache`,
 * SAMMA källa som `/staff-management/time-reports`. Projektvyn återskapar inte
 * GPS-logik och läser INTE `time_reports` eller `project_labor_costs` som
 * timkälla.
 *
 * - `time_reports`         → INTE källa här (legacy attest-tabell).
 * - `project_labor_costs`  → INTE källa här (manuell extra kostnad i annan
 *                            vy, ej rapporterad projekttid).
 * - Time Engine-cachens `report_candidate_blocks_json` är primär; faller
 *   tillbaka på `display_blocks_json` om den saknas.
 *
 * Bygger inget attestflöde — `approved` sätts till `true` på de syntetiska
 * raderna som returneras (cachens summering är kanonisk sanning för
 * projektet).
 */
import { supabase } from '@/integrations/supabase/client';
import {
  summarizeProjectHoursFromDayReports,
  summarizeLargeProjectHoursFromDayReports,
  type LargeProjectHoursTarget,
  type ProjectHoursSummary,
  type ProjectHoursTarget,
  type ProjectTimeEngineBlock,
  type StaffDayReportInput,
} from '@/lib/projects/projectHoursFromTimeEngine';
import type {
  DetailedTimeReport,
  StaffTimeReport,
} from '@/types/projectEconomy';

// ────────────────────────────────────────────────────────────────────────────
// Date window resolution
// ────────────────────────────────────────────────────────────────────────────

interface DateWindow {
  startDate: string; // yyyy-MM-dd
  endDate: string;   // yyyy-MM-dd
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

interface BookingContext {
  organization_id: string;
  large_project_id: string | null;
  assigned_project_id: string | null;
  window: DateWindow;
}

async function loadBookingContext(bookingId: string): Promise<BookingContext | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('organization_id, large_project_id, assigned_project_id, rigdaydate, rigdowndate, eventdate, rig_start_time, rigdown_end_time, event_start_time')
    .eq('id', bookingId)
    .maybeSingle();
  if (error || !data) return null;

  const candidates = [
    data.rigdaydate,
    data.rigdowndate,
    data.eventdate,
    data.rig_start_time?.slice(0, 10),
    data.rigdown_end_time?.slice(0, 10),
    data.event_start_time?.slice(0, 10),
  ].filter((s): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s));

  let window: DateWindow;
  if (candidates.length > 0) {
    candidates.sort();
    window = {
      startDate: shiftDays(candidates[0], -2),
      endDate: shiftDays(candidates[candidates.length - 1], 2),
    };
  } else {
    const today = isoDate(new Date());
    window = { startDate: shiftDays(today, -90), endDate: today };
  }

  return {
    organization_id: data.organization_id,
    large_project_id: data.large_project_id ?? null,
    assigned_project_id: data.assigned_project_id ?? null,
    window,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cache reader
// ────────────────────────────────────────────────────────────────────────────

interface CacheRow {
  staff_id: string;
  date: string;
  report_candidate_blocks_json: unknown;
  display_blocks_json: unknown;
}

function pickBlocks(row: CacheRow): ProjectTimeEngineBlock[] {
  const primary = row.report_candidate_blocks_json;
  if (Array.isArray(primary)) return primary as ProjectTimeEngineBlock[];
  if (primary && typeof primary === 'object' && Array.isArray((primary as any).blocks)) {
    return (primary as any).blocks as ProjectTimeEngineBlock[];
  }
  const fallback = row.display_blocks_json;
  if (Array.isArray(fallback)) return fallback as ProjectTimeEngineBlock[];
  if (fallback && typeof fallback === 'object' && Array.isArray((fallback as any).blocks)) {
    return (fallback as any).blocks as ProjectTimeEngineBlock[];
  }
  return [];
}

async function loadDayReportsForOrg(
  organizationId: string,
  window: DateWindow,
): Promise<StaffDayReportInput[]> {
  const { data, error } = await supabase
    .from('staff_day_report_cache')
    .select(
      'staff_id, date, report_candidate_blocks_json, display_blocks_json',
    )
    .eq('organization_id', organizationId)
    .gte('date', window.startDate)
    .lte('date', window.endDate)
    .order('date', { ascending: true })
    .limit(5000);
  if (error) {
    console.error('[projectHoursService] cache fetch failed:', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    staff_id: (row as any).staff_id,
    date: (row as any).date,
    blocks: pickBlocks(row as unknown as CacheRow),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Rate resolver (kept compatible with legacy fetchProjectTimeReports)
// ────────────────────────────────────────────────────────────────────────────

interface StaffRate {
  name: string;
  hourly_rate: number;
  overtime_rate: number;
}

async function resolveStaffRates(
  staffIds: string[],
  bookingId: string,
): Promise<Map<string, StaffRate>> {
  const out = new Map<string, StaffRate>();
  if (staffIds.length === 0) return out;

  const [{ data: members }, { data: snapshots }] = await Promise.all([
    supabase
      .from('staff_members')
      .select('id, name, hourly_rate, overtime_rate')
      .in('id', staffIds),
    supabase
      .from('completion_staff')
      .select('staff_id, hourly_rate, work_date')
      .eq('completion_id', bookingId)
      .in('staff_id', staffIds),
  ]);

  const snapshotRate = new Map<string, number>();
  if (snapshots && snapshots.length > 0) {
    const sorted = [...snapshots].sort((a, b) =>
      (b.work_date || '').localeCompare(a.work_date || ''),
    );
    for (const s of sorted) {
      if (s.hourly_rate != null && !snapshotRate.has(s.staff_id)) {
        snapshotRate.set(s.staff_id, Number(s.hourly_rate));
      }
    }
  }

  for (const m of members ?? []) {
    const current = Number((m as any).hourly_rate) || 0;
    const snap = snapshotRate.get((m as any).id);
    const hourly = snap ?? current;
    const otCurrent = Number((m as any).overtime_rate) || 0;
    out.set((m as any).id, {
      name: (m as any).name || 'Okänd',
      hourly_rate: hourly,
      overtime_rate: otCurrent > 0 ? otCurrent : hourly * 1.5,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Hämta projektets timmar som ProjectHoursSummary (raw helper-output).
 * Använd denna för nya vyer.
 */
export async function fetchProjectHoursSummary(
  bookingId: string,
  extraTarget?: Partial<ProjectHoursTarget>,
): Promise<ProjectHoursSummary> {
  const ctx = await loadBookingContext(bookingId);
  if (!ctx) {
    return {
      target: { booking_id: bookingId },
      totalMinutes: 0,
      totalHours: 0,
      staffCount: 0,
      staffSummaries: [],
      daySummaries: [],
      blocks: [],
      warnings: ['booking_not_found'],
    };
  }
  const dayReports = await loadDayReportsForOrg(ctx.organization_id, ctx.window);
  const target: ProjectHoursTarget = {
    booking_id: bookingId,
    project_id: ctx.assigned_project_id ?? extraTarget?.project_id ?? null,
    large_project_id: ctx.large_project_id ?? extraTarget?.large_project_id ?? null,
    assignment_id: extraTarget?.assignment_id ?? null,
    location_id: extraTarget?.location_id ?? null,
  };
  return summarizeProjectHoursFromDayReports(dayReports, target);
}

/**
 * Adapter: returnerar projektets timmar i den gamla `StaffTimeReport[]`-shapen
 * som befintliga UI-komponenter (StaffCostTable, ProjectEconomyTab,
 * TimeApprovalSummary, exporter, large project breakdown m.fl.) förväntar sig.
 *
 * Källa: staff_day_report_cache (Time Engine) — ALDRIG `time_reports`.
 *
 * Notera:
 *  - `id`/`report_ids` är syntetiska block-ids (cache-blockets `id`/`block_id`
 *    eller en deterministisk fallback). De kan INTE användas för att attestera
 *    en `time_reports`-rad — det är medvetet, eftersom rapporterade timmar nu
 *    kommer från Time Engine och inte attesteras per-rad.
 *  - `approved` sätts till `true` (cache-summan är kanonisk).
 *  - `overtime_hours` kommer alltid att vara 0; Time Engine separerar inte ut
 *    övertid på blocknivå.
 */
export async function fetchProjectStaffHoursAsTimeReports(
  bookingId: string,
): Promise<StaffTimeReport[]> {
  const summary = await fetchProjectHoursSummary(bookingId);
  if (summary.staffSummaries.length === 0) return [];

  const staffIds = summary.staffSummaries.map((s) => s.staff_id);
  const rates = await resolveStaffRates(staffIds, bookingId);

  const result: StaffTimeReport[] = [];
  for (const s of summary.staffSummaries) {
    const rate = rates.get(s.staff_id) ?? {
      name: s.staff_name ?? 'Okänd',
      hourly_rate: 0,
      overtime_rate: 0,
    };
    if (rate.hourly_rate === 0) {
      console.warn(
        `[projectHoursService] No hourly_rate for staff ${s.staff_id} on booking ${bookingId} — cost will be 0`,
      );
    }

    // Group blocks by date and build DetailedTimeReport per (date, block).
    const detailed: DetailedTimeReport[] = s.blocks.map((b, idx) => {
      const startIso =
        ((b.startAt as string | null) ?? (b.start_at as string | null)) || null;
      const endIso =
        ((b.endAt as string | null) ?? (b.end_at as string | null)) || null;
      const durationMin =
        typeof b.durationMinutes === 'number' && b.durationMinutes > 0
          ? b.durationMinutes
          : typeof b.minutes === 'number' && b.minutes > 0
            ? b.minutes
            : startIso && endIso
              ? Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000))
              : 0;
      const hours = durationMin / 60;
      const reportDate =
        startIso?.slice(0, 10) ?? s.days[0] ?? '';
      const blockId =
        (b.id as string | undefined) ??
        (b.block_id as string | undefined) ??
        `te:${s.staff_id}:${reportDate}:${idx}`;
      return {
        id: blockId,
        staff_id: s.staff_id,
        staff_name: rate.name,
        report_date: reportDate,
        start_time: startIso,
        end_time: endIso,
        hours_worked: hours,
        overtime_hours: 0,
        hourly_rate: rate.hourly_rate,
        cost: hours * rate.hourly_rate,
        approved: true,
      };
    });

    const totalHours = s.totalMinutes / 60;
    result.push({
      staff_id: s.staff_id,
      staff_name: rate.name,
      total_hours: totalHours,
      overtime_hours: 0,
      hourly_rate: rate.hourly_rate,
      overtime_rate: rate.overtime_rate,
      total_cost: totalHours * rate.hourly_rate,
      approved: true,
      report_ids: detailed.map((d) => d.id),
      detailed_reports: detailed,
    });
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Large project — read same Time Engine cache, scoped by LP + linked bookings
// ────────────────────────────────────────────────────────────────────────────

import {
  summarizeLargeProjectHoursFromDayReports,
  type LargeProjectHoursTarget,
} from '@/lib/projects/projectHoursFromTimeEngine';

interface LargeProjectContext {
  organization_id: string;
  window: DateWindow;
}

async function loadLargeProjectContext(
  largeProjectId: string,
  bookingIds: string[],
): Promise<LargeProjectContext | null> {
  // Org from large_projects
  const { data: lp } = await supabase
    .from('large_projects')
    .select('organization_id')
    .eq('id', largeProjectId)
    .maybeSingle();
  const organization_id = (lp as any)?.organization_id as string | undefined;
  if (!organization_id) return null;

  // Date window from linked bookings
  let candidates: string[] = [];
  if (bookingIds.length > 0) {
    const { data: bks } = await supabase
      .from('bookings')
      .select('rigdaydate, rigdowndate, eventdate, rig_start_time, rigdown_end_time, event_start_time')
      .in('id', bookingIds);
    for (const b of (bks ?? []) as any[]) {
      for (const v of [
        b.rigdaydate,
        b.rigdowndate,
        b.eventdate,
        b.rig_start_time?.slice(0, 10),
        b.rigdown_end_time?.slice(0, 10),
        b.event_start_time?.slice(0, 10),
      ]) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) candidates.push(v);
      }
    }
  }

  let window: DateWindow;
  if (candidates.length > 0) {
    candidates.sort();
    window = {
      startDate: shiftDays(candidates[0], -2),
      endDate: shiftDays(candidates[candidates.length - 1], 2),
    };
  } else {
    const today = isoDate(new Date());
    window = { startDate: shiftDays(today, -180), endDate: shiftDays(today, 30) };
  }
  return { organization_id, window };
}

export interface LargeProjectHoursResult {
  summary: ProjectHoursSummary;
  totalCost: number;
  staffCosts: Array<{
    staff_id: string;
    staff_name: string | null;
    totalMinutes: number;
    totalHours: number;
    hourly_rate: number;
    cost: number;
  }>;
  source: 'staff_day_report_cache';
}

/**
 * Hämta large projectets timmar — SAMMA Time Engine-cache som
 * /staff-management/time-reports och projektvyn. Ett block räknas en gång,
 * matchat på large_project_id ELLER booking_id ∈ linkedBookingIds.
 *
 * Kostnaden räknas ut här (helpern är ren och kostnadsfri) genom att slå upp
 * staff_members.hourly_rate. Vi snapshot:ar inte mot completion_staff på
 * LP-nivå (den är per-booking och saknar deterministisk projekt-snapshot).
 */
export async function fetchLargeProjectHoursSummary(
  largeProjectId: string,
  bookingIds: string[],
): Promise<LargeProjectHoursResult> {
  const ctx = await loadLargeProjectContext(largeProjectId, bookingIds);
  if (!ctx) {
    return {
      summary: {
        target: { large_project_id: largeProjectId },
        totalMinutes: 0,
        totalHours: 0,
        staffCount: 0,
        staffSummaries: [],
        daySummaries: [],
        blocks: [],
        warnings: ['large_project_not_found'],
      },
      totalCost: 0,
      staffCosts: [],
      source: 'staff_day_report_cache',
    };
  }
  const dayReports = await loadDayReportsForOrg(ctx.organization_id, ctx.window);
  const target: LargeProjectHoursTarget = {
    large_project_id: largeProjectId,
    booking_ids: bookingIds ?? [],
  };
  const summary = summarizeLargeProjectHoursFromDayReports(dayReports, target);

  // Resolve current rates for all involved staff (no per-booking snapshot
  // available at LP-level). Matches normal project rate semantics for new staff.
  const staffIds = summary.staffSummaries.map((s) => s.staff_id);
  let rateMap = new Map<string, number>();
  let nameMap = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: members } = await supabase
      .from('staff_members')
      .select('id, name, hourly_rate')
      .in('id', staffIds);
    for (const m of (members ?? []) as any[]) {
      rateMap.set(m.id, Number(m.hourly_rate) || 0);
      nameMap.set(m.id, m.name || 'Okänd');
    }
  }

  let totalCost = 0;
  const staffCosts = summary.staffSummaries.map((s) => {
    const rate = rateMap.get(s.staff_id) ?? 0;
    const hours = s.totalMinutes / 60;
    const cost = hours * rate;
    totalCost += cost;
    return {
      staff_id: s.staff_id,
      staff_name: s.staff_name ?? nameMap.get(s.staff_id) ?? null,
      totalMinutes: s.totalMinutes,
      totalHours: hours,
      hourly_rate: rate,
      cost,
    };
  });

  return { summary, totalCost, staffCosts, source: 'staff_day_report_cache' };
}
