/**
 * projectHoursFromTimeEngine.ts
 * =============================
 *
 * Gemensam läsmodell för "projektets personaltimmar".
 *
 * REGLER (PROJECT HOURS 2):
 *   • ENDAST Time Engine-cache (staff_day_report_cache) är källa.
 *   • Använder INTE time_reports / location_time_entries / travel_time_logs
 *     / project_labor_costs som timkälla.
 *   • Helpern är 100% pure: anroparen hämtar `dayReports` (en lista med
 *     redan-lästa cache-rader) och skickar in dem hit. Vi gör inga DB-anrop.
 *   • Vi återskapar ALDRIG GPS-logik här — vi summerar bara färdiga blocks
 *     som Time Engine redan har konsoliderat.
 *
 * Vad räknas som projekttid?
 *   ✓ work-block vars target matchar `ProjectHoursTarget`
 *   ✓ Småblock som Time Engine redan absorberat in i en work-session räknas
 *     som en del av sessionen (vi tittar på sessionens samlade duration).
 *   ✗ transport räknas EJ (kan flaggas som warning om det är same-target,
 *     men aldrig adderas — om man senare vill ha "approved travel" görs det
 *     i en separat opt-in helper).
 *   ✗ private_residence / "Jag är hemma" räknas ALDRIG.
 *   ✗ signal_gap / unknown_place / needs_review räknas inte fristående —
 *     bara om Time Engine redan har slukat dem i ett work-block.
 *
 * Helpern är tolerant mot block-shape-variationer:
 *   - id | block_id
 *   - kind | type
 *   - label | target_label
 *   - booking_id / project_id / large_project_id / assignment_id / location_id
 *     antingen direkt på blocket, under `target: { type, id }`, eller via
 *     `targetType`/`targetId` (Time Engine canonical).
 *   - start_at | startAt   och   end_at | endAt
 *   - durationMinutes | minutes (annars beräknas från start/end)
 *   - evidence / metadata kan innehålla samma referenser som fallback.
 */

// ────────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────────

export interface ProjectHoursTarget {
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  assignment_id?: string | null;
  location_id?: string | null;
}

/**
 * En tolerant typ för ett block som kommer från
 * staff_day_report_cache.report_candidate_blocks_json eller display_blocks_json.
 *
 * Vi tar emot `Record<string, unknown>` i praktiken — typen här är bara en
 * dokumenterad superset av kända fält.
 */
export interface ProjectTimeEngineBlock {
  id?: string | null;
  block_id?: string | null;

  // kind/type
  kind?: string | null;
  type?: string | null;

  // labels
  label?: string | null;
  target_label?: string | null;
  targetLabel?: string | null;

  // direct refs
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  assignment_id?: string | null;
  location_id?: string | null;

  // canonical Time Engine target tuple
  targetType?: string | null;
  targetId?: string | null;
  target?: { type?: string | null; id?: string | null; kind?: string | null } | null;

  // nested bags
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;

  // time
  start_at?: string | null;
  end_at?: string | null;
  startAt?: string | null;
  endAt?: string | null;

  // duration
  durationMinutes?: number | null;
  minutes?: number | null;

  // misc — we accept anything else
  [key: string]: unknown;
}

export interface ProjectHoursStaffSummary {
  staff_id: string;
  staff_name: string | null;
  totalMinutes: number;
  totalHours: number;
  days: string[];
  blocks: ProjectTimeEngineBlock[];
}

export interface ProjectHoursDaySummary {
  date: string;
  totalMinutes: number;
  totalHours: number;
  staffCount: number;
}

export interface ProjectHoursSummary {
  target: ProjectHoursTarget;
  totalMinutes: number;
  totalHours: number;
  staffCount: number;
  staffSummaries: ProjectHoursStaffSummary[];
  daySummaries: ProjectHoursDaySummary[];
  blocks: ProjectTimeEngineBlock[];
  warnings: string[];
}

/**
 * Shape som anroparen skickar in. En rad per (staff × date) från
 * staff_day_report_cache. Anroparen väljer själv om hen plockar
 * `report_candidate_blocks_json` eller `display_blocks_json` — denna helper
 * tittar på den lista som lämnas i `blocks`.
 */
export interface StaffDayReportInput {
  staff_id: string;
  staff_name?: string | null;
  date: string; // yyyy-MM-dd
  blocks: ProjectTimeEngineBlock[] | null | undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Internals — block reading
// ────────────────────────────────────────────────────────────────────────────

const WORK_KINDS = new Set(['work', 'work_session', 'work_block', 'project_work']);
const PRIVATE_KINDS = new Set([
  'private_residence',
  'private',
  'home',
  'private_or_background',
]);
const TRANSPORT_KINDS = new Set(['transport', 'travel', 'resa']);
const NON_WORK_KINDS = new Set([
  'signal_gap',
  'unknown_place',
  'unknown',
  'needs_review',
  'gps_gap',
  'gps_gap_in_workday',
  'other_place',
  'unclear_movement',
  'unclear_transport',
]);

function readKind(block: ProjectTimeEngineBlock): string | null {
  const k = (block?.kind ?? block?.type) as string | null | undefined;
  return k ? String(k).toLowerCase() : null;
}

function readTargetType(block: ProjectTimeEngineBlock): string | null {
  const t =
    (block?.targetType as string | null | undefined) ??
    (block?.target?.type as string | null | undefined) ??
    (block?.target?.kind as string | null | undefined) ??
    null;
  return t ? String(t).toLowerCase() : null;
}

function readTargetId(block: ProjectTimeEngineBlock): string | null {
  const id =
    (block?.targetId as string | null | undefined) ??
    (block?.target?.id as string | null | undefined) ??
    null;
  return id ? String(id) : null;
}

function pickFirstString(
  ...candidates: Array<unknown>
): string | null {
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

/**
 * Plocka ut alla möjliga projekt-/booking-/location-referenser från ett block,
 * oavsett om de ligger direkt, under `target`, eller i `evidence`/`metadata`.
 */
export function getBlockProjectRefs(
  block: ProjectTimeEngineBlock,
): Required<ProjectHoursTarget> {
  const ev = (block?.evidence ?? {}) as Record<string, unknown>;
  const md = (block?.metadata ?? {}) as Record<string, unknown>;
  const targetType = readTargetType(block);
  const targetId = readTargetId(block);

  const fromTargetTuple = (kind: string): string | null =>
    targetType === kind ? targetId : null;

  return {
    booking_id:
      pickFirstString(
        block.booking_id,
        ev.booking_id,
        md.booking_id,
        fromTargetTuple('booking'),
      ) ?? null,
    project_id:
      pickFirstString(
        block.project_id,
        ev.project_id,
        md.project_id,
        fromTargetTuple('project'),
      ) ?? null,
    large_project_id:
      pickFirstString(
        block.large_project_id,
        ev.large_project_id,
        md.large_project_id,
        fromTargetTuple('large_project'),
      ) ?? null,
    assignment_id:
      pickFirstString(
        block.assignment_id,
        ev.assignment_id,
        md.assignment_id,
        ev.booking_staff_assignment_id,
        md.booking_staff_assignment_id,
      ) ?? null,
    location_id:
      pickFirstString(
        block.location_id,
        ev.location_id,
        md.location_id,
        fromTargetTuple('location'),
        fromTargetTuple('organization_location'),
      ) ?? null,
  };
}

/**
 * Sant om blocket är ett "work"-block (inkl. konsoliderade work-sessioner).
 * Private/transport/signal_gap/unknown/needs_review är aldrig work här.
 */
export function isProjectWorkBlock(block: ProjectTimeEngineBlock): boolean {
  const kind = readKind(block);
  if (!kind) return false;
  if (PRIVATE_KINDS.has(kind)) return false;
  if (TRANSPORT_KINDS.has(kind)) return false;
  if (NON_WORK_KINDS.has(kind)) return false;
  if (WORK_KINDS.has(kind)) return true;
  // Tolerant fallback: allt som börjar med "work" räknas som work.
  return kind.startsWith('work');
}

/**
 * Returnerar blockets längd i minuter.
 *  1. Använder durationMinutes/minutes om de finns och är > 0.
 *  2. Annars räknas (end - start) → minuter.
 *  3. Aldrig negativt; ogiltigt → 0.
 */
export function getBlockDurationMinutes(block: ProjectTimeEngineBlock): number {
  const d =
    typeof block?.durationMinutes === 'number' ? block.durationMinutes : null;
  if (d != null && Number.isFinite(d) && d > 0) return Math.round(d);

  const m = typeof block?.minutes === 'number' ? block.minutes : null;
  if (m != null && Number.isFinite(m) && m > 0) return Math.round(m);

  const startIso =
    (block?.startAt as string | null | undefined) ??
    (block?.start_at as string | null | undefined) ??
    null;
  const endIso =
    (block?.endAt as string | null | undefined) ??
    (block?.end_at as string | null | undefined) ??
    null;
  if (!startIso || !endIso) return 0;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

/**
 * True om blockets target matchar någon av de identifierare som finns på
 * `target`. Matchning är OR: räcker att ETT id-fält stämmer.
 *
 * Notera: vi gör ingen booking↔project-resolution här. Det är anroparens
 * ansvar att skicka med rätt id (t.ex. både booking_id och project_id för en
 * booking som tillhör ett normalt projekt). Detta håller helpern fri från
 * DB-anrop och cross-table-joins.
 */
export function blockMatchesProjectTarget(
  block: ProjectTimeEngineBlock,
  target: ProjectHoursTarget,
): boolean {
  if (!target) return false;
  const refs = getBlockProjectRefs(block);

  if (target.booking_id && refs.booking_id && refs.booking_id === target.booking_id) {
    return true;
  }
  if (target.project_id && refs.project_id && refs.project_id === target.project_id) {
    return true;
  }
  if (
    target.large_project_id &&
    refs.large_project_id &&
    refs.large_project_id === target.large_project_id
  ) {
    return true;
  }
  if (
    target.assignment_id &&
    refs.assignment_id &&
    refs.assignment_id === target.assignment_id
  ) {
    return true;
  }
  if (target.location_id && refs.location_id && refs.location_id === target.location_id) {
    return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Aggregation
// ────────────────────────────────────────────────────────────────────────────

function isTargetEmpty(target: ProjectHoursTarget): boolean {
  return !(
    target?.booking_id ||
    target?.project_id ||
    target?.large_project_id ||
    target?.assignment_id ||
    target?.location_id
  );
}

/**
 * Summerar projektets timmar från en lista av staff_day_report_cache-rader.
 *
 * Inputten `dayReports` är redan-lästa cache-rader. Helpern bryr sig inte om
 * vilken cache-kolumn de kommer från (`report_candidate_blocks_json` eller
 * `display_blocks_json`) — den summerar bara `blocks` som lämnas in.
 *
 * Time Engine ansvarar för att absorbera small/transport/signal_gap in i
 * work-sessioner. Vi litar på den konsolideringen och summerar bara work.
 */
export function summarizeProjectHoursFromDayReports(
  dayReports: StaffDayReportInput[] | null | undefined,
  target: ProjectHoursTarget,
): ProjectHoursSummary {
  const warnings: string[] = [];
  const empty: ProjectHoursSummary = {
    target,
    totalMinutes: 0,
    totalHours: 0,
    staffCount: 0,
    staffSummaries: [],
    daySummaries: [],
    blocks: [],
    warnings,
  };

  if (isTargetEmpty(target)) {
    warnings.push('empty_target');
    return empty;
  }
  if (!Array.isArray(dayReports) || dayReports.length === 0) {
    return empty;
  }

  const perStaff = new Map<string, ProjectHoursStaffSummary>();
  const perDay = new Map<
    string,
    { totalMinutes: number; staff: Set<string> }
  >();
  const allBlocks: ProjectTimeEngineBlock[] = [];

  for (const row of dayReports) {
    if (!row || !row.staff_id || !row.date) continue;
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    if (blocks.length === 0) continue;

    let staffSummary = perStaff.get(row.staff_id);
    if (!staffSummary) {
      staffSummary = {
        staff_id: row.staff_id,
        staff_name: row.staff_name ?? null,
        totalMinutes: 0,
        totalHours: 0,
        days: [],
        blocks: [],
      };
      perStaff.set(row.staff_id, staffSummary);
    } else if (!staffSummary.staff_name && row.staff_name) {
      staffSummary.staff_name = row.staff_name;
    }

    let dayMinutesForStaff = 0;
    for (const rawBlock of blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') continue;
      const block = rawBlock as ProjectTimeEngineBlock;

      // Diagnostik: same-target transport som inte räknas men är värt att veta.
      if (TRANSPORT_KINDS.has(readKind(block) ?? '') &&
          blockMatchesProjectTarget(block, target)) {
        warnings.push(
          `transport_not_counted:${row.staff_id}:${row.date}`,
        );
        continue;
      }

      if (!isProjectWorkBlock(block)) continue;
      if (!blockMatchesProjectTarget(block, target)) continue;

      const minutes = getBlockDurationMinutes(block);
      if (minutes <= 0) continue;

      staffSummary.totalMinutes += minutes;
      staffSummary.blocks.push(block);
      if (!staffSummary.days.includes(row.date)) {
        staffSummary.days.push(row.date);
      }
      allBlocks.push(block);
      dayMinutesForStaff += minutes;
    }

    if (dayMinutesForStaff > 0) {
      const d = perDay.get(row.date) ?? {
        totalMinutes: 0,
        staff: new Set<string>(),
      };
      d.totalMinutes += dayMinutesForStaff;
      d.staff.add(row.staff_id);
      perDay.set(row.date, d);
    }
  }

  // Finalize staff
  const staffSummaries: ProjectHoursStaffSummary[] = [];
  let totalMinutes = 0;
  for (const s of perStaff.values()) {
    if (s.totalMinutes <= 0) continue;
    s.totalHours = +(s.totalMinutes / 60).toFixed(2);
    s.days.sort();
    staffSummaries.push(s);
    totalMinutes += s.totalMinutes;
  }
  staffSummaries.sort((a, b) => b.totalMinutes - a.totalMinutes);

  // Finalize days
  const daySummaries: ProjectHoursDaySummary[] = Array.from(perDay.entries())
    .map(([date, v]) => ({
      date,
      totalMinutes: v.totalMinutes,
      totalHours: +(v.totalMinutes / 60).toFixed(2),
      staffCount: v.staff.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    target,
    totalMinutes,
    totalHours: +(totalMinutes / 60).toFixed(2),
    staffCount: staffSummaries.length,
    staffSummaries,
    daySummaries,
    blocks: allBlocks,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Large project aggregation
// ────────────────────────────────────────────────────────────────────────────

export interface LargeProjectHoursTarget {
  large_project_id: string;
  booking_ids: string[];
}

/**
 * True om blocket hör till ett large project. Räknas om:
 *   • block.large_project_id === target.large_project_id, ELLER
 *   • block.booking_id finns i target.booking_ids, ELLER
 *   • metadata/evidence pekar på samma large_project_id (samma normalisering
 *     som getBlockProjectRefs gör).
 *
 * Vi kör matchningen en gång per block — inget block räknas dubbelt.
 */
export function blockMatchesLargeProjectTarget(
  block: ProjectTimeEngineBlock,
  target: LargeProjectHoursTarget,
): boolean {
  if (!target?.large_project_id && (!target?.booking_ids || target.booking_ids.length === 0)) {
    return false;
  }
  const refs = getBlockProjectRefs(block);
  if (
    target.large_project_id &&
    refs.large_project_id &&
    refs.large_project_id === target.large_project_id
  ) {
    return true;
  }
  if (
    refs.booking_id &&
    target.booking_ids &&
    target.booking_ids.includes(refs.booking_id)
  ) {
    return true;
  }
  return false;
}

/**
 * Summera large projectets timmar från staff_day_report_cache.
 *
 * Sanningsmodell (PROJECT HOURS 6):
 *  - Source: samma staff_day_report_cache som /staff-management/time-reports.
 *  - Aggregeringen sker på LARGE PROJECT-nivå, inte per booking.
 *  - Ett block räknas en (1) gång om det matchar large_project_id eller
 *    någon av de länkade booking_ids.
 *  - Booking-level breakdown är detaljvy, inte total.
 */
export function summarizeLargeProjectHoursFromDayReports(
  dayReports: StaffDayReportInput[] | null | undefined,
  target: LargeProjectHoursTarget,
): ProjectHoursSummary {
  const warnings: string[] = [];
  const empty: ProjectHoursSummary = {
    target: { large_project_id: target?.large_project_id ?? null },
    totalMinutes: 0,
    totalHours: 0,
    staffCount: 0,
    staffSummaries: [],
    daySummaries: [],
    blocks: [],
    warnings,
  };

  if (!target?.large_project_id && (!target?.booking_ids || target.booking_ids.length === 0)) {
    warnings.push('empty_large_project_target');
    return empty;
  }
  if (!Array.isArray(dayReports) || dayReports.length === 0) return empty;

  const perStaff = new Map<string, ProjectHoursStaffSummary>();
  const perDay = new Map<string, { totalMinutes: number; staff: Set<string> }>();
  const allBlocks: ProjectTimeEngineBlock[] = [];
  // Dedup nyckel: föredra block.id/block_id, annars syntetisk via staff+date+start+end
  const seen = new Set<string>();

  for (const row of dayReports) {
    if (!row || !row.staff_id || !row.date) continue;
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    if (blocks.length === 0) continue;

    let staffSummary = perStaff.get(row.staff_id);
    if (!staffSummary) {
      staffSummary = {
        staff_id: row.staff_id,
        staff_name: row.staff_name ?? null,
        totalMinutes: 0,
        totalHours: 0,
        days: [],
        blocks: [],
      };
      perStaff.set(row.staff_id, staffSummary);
    } else if (!staffSummary.staff_name && row.staff_name) {
      staffSummary.staff_name = row.staff_name;
    }

    let dayMinutesForStaff = 0;
    for (const rawBlock of blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') continue;
      const block = rawBlock as ProjectTimeEngineBlock;

      if (!isProjectWorkBlock(block)) continue;
      if (!blockMatchesLargeProjectTarget(block, target)) continue;

      const startIso = (block.startAt as string | null) ?? (block.start_at as string | null) ?? '';
      const endIso = (block.endAt as string | null) ?? (block.end_at as string | null) ?? '';
      const blockKey =
        (block.id as string | undefined) ||
        (block.block_id as string | undefined) ||
        `${row.staff_id}|${row.date}|${startIso}|${endIso}`;
      if (seen.has(blockKey)) continue;
      seen.add(blockKey);

      const minutes = getBlockDurationMinutes(block);
      if (minutes <= 0) continue;

      staffSummary.totalMinutes += minutes;
      staffSummary.blocks.push(block);
      if (!staffSummary.days.includes(row.date)) staffSummary.days.push(row.date);
      allBlocks.push(block);
      dayMinutesForStaff += minutes;
    }

    if (dayMinutesForStaff > 0) {
      const d = perDay.get(row.date) ?? { totalMinutes: 0, staff: new Set<string>() };
      d.totalMinutes += dayMinutesForStaff;
      d.staff.add(row.staff_id);
      perDay.set(row.date, d);
    }
  }

  const staffSummaries: ProjectHoursStaffSummary[] = [];
  let totalMinutes = 0;
  for (const s of perStaff.values()) {
    if (s.totalMinutes <= 0) continue;
    s.totalHours = +(s.totalMinutes / 60).toFixed(2);
    s.days.sort();
    staffSummaries.push(s);
    totalMinutes += s.totalMinutes;
  }
  staffSummaries.sort((a, b) => b.totalMinutes - a.totalMinutes);

  const daySummaries: ProjectHoursDaySummary[] = Array.from(perDay.entries())
    .map(([date, v]) => ({
      date,
      totalMinutes: v.totalMinutes,
      totalHours: +(v.totalMinutes / 60).toFixed(2),
      staffCount: v.staff.size,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    target: { large_project_id: target.large_project_id },
    totalMinutes,
    totalHours: +(totalMinutes / 60).toFixed(2),
    staffCount: staffSummaries.length,
    staffSummaries,
    daySummaries,
    blocks: allBlocks,
    warnings,
  };
}
