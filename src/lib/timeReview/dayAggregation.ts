/**
 * Day-level aggregation for AdminTimeReviewDashboard.
 *
 * Bygger EN rad per (staff_id, day_key) genom att slå ihop:
 *  - workdays            → dagstart/slut, base review_status
 *  - time_reports        → rapporterad projekttid (exklusive subdivisions
 *                          och legacy location_auto-mirrors)
 *  - travel_time_logs    → restid
 *  - location_time_entries (open/stale) → "fortfarande aktiv"-signal
 *  - workday_flags       → admin-synliga varningar (olösta)
 *
 * Pure helpers — inga IO. Tar redan-hämtad data och returnerar dag-rader.
 */

export type DayStatus = 'in_progress' | 'needs_review' | 'ready' | 'approved';

export interface DayRowWarning {
  flag_type: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
}

export interface AdminDayRow {
  /** Stable key for list rendering. */
  key: string;
  staff_id: string;
  staff_name: string;
  staff_role: string | null;
  staff_color: string | null;
  /** YYYY-MM-DD (local). */
  day_key: string;

  /** Workday start/end (om workday-rad finns). */
  workday_id: string | null;
  workday_started_at: string | null;
  workday_ended_at: string | null;
  workday_review_status: 'draft' | 'needs_review' | 'ready' | 'approved' | null;

  /** Total dagspann i timmar (started_at → ended_at, eller now om öppen). */
  total_day_hours: number;
  /** Summa rapporterad projekttid (time_reports + LTE-baserade booking/lp). */
  reported_project_hours: number;
  /** Summa restid (travel_time_logs). */
  travel_hours: number;
  /** Oallokerad tid = max(0, total_day - reported_project - travel). */
  unallocated_hours: number;

  /** Det finns en ej avslutad workday/timer/travel just nu. */
  has_open: boolean;
  /** Härledd status. */
  status: DayStatus;
  /** Olösta varningar för dagen. */
  warnings: DayRowWarning[];
}

interface RawWorkday {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
  review_status: 'draft' | 'needs_review' | 'ready' | 'approved' | null;
  review_reasons: string[] | null;
  notes: string | null;
}

interface RawTimeReport {
  id: string;
  staff_id: string;
  report_date: string;
  hours_worked: number | null;
  start_time: string | null;
  end_time: string | null;
  source: string | null;
  is_subdivision?: boolean | null;
}

interface RawTravelLog {
  id: string;
  staff_id: string;
  report_date: string;
  hours_worked: number | null;
  start_time: string | null;
  end_time: string | null;
}

interface RawLocationEntry {
  id: string;
  staff_id: string;
  entry_date: string;
  entered_at: string;
  exited_at: string | null;
  total_minutes: number | null;
  booking_id?: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
  source?: string | null;
}

interface RawFlag {
  id: string;
  staff_id: string;
  flag_date: string;
  flag_type: string;
  severity: 'info' | 'warning' | 'error' | string | null;
  title: string;
  resolved: boolean | null;
}

interface RawStaff {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
}

export interface AggregateInput {
  /** Inclusive date range (YYYY-MM-DD). */
  fromDate: string;
  toDate: string;
  workdays: RawWorkday[];
  timeReports: RawTimeReport[];
  travelLogs: RawTravelLog[];
  locationEntries: RawLocationEntry[];
  flags: RawFlag[];
  staff: RawStaff[];
}

const dayKey = (iso: string): string => {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const safeHours = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

const normSeverity = (s: string | null): 'info' | 'warning' | 'error' => {
  if (s === 'error' || s === 'warning' || s === 'info') return s;
  return 'warning';
};

const STALE_OPEN_HOURS = 18;

/**
 * Härledd status för en dag-rad.
 *
 * Prioritetsordning (top wins):
 *  1. in_progress  — har öppen workday/timer (och ej stale)
 *  2. needs_review — workday.review_status='needs_review', stale-open workday,
 *                    eller olöst error/warning-flag
 *  3. ready        — workday slut + 'ready' eller default när inga problem
 *  4. approved     — workday.review_status='approved'
 */
export function deriveStatus(args: {
  hasOpen: boolean;
  isStaleOpen: boolean;
  workdayReview: RawWorkday['review_status'];
  unresolvedSeverities: Array<'info' | 'warning' | 'error'>;
  hasAnyActivity: boolean;
}): DayStatus {
  const { hasOpen, isStaleOpen, workdayReview, unresolvedSeverities, hasAnyActivity } = args;

  if (workdayReview === 'approved') return 'approved';
  if (isStaleOpen) return 'needs_review';
  if (hasOpen) return 'in_progress';
  if (workdayReview === 'needs_review') return 'needs_review';
  if (unresolvedSeverities.some(s => s === 'error' || s === 'warning')) {
    return 'needs_review';
  }
  if (workdayReview === 'ready') return 'ready';
  // Inget workday-objekt men aktivitet finns → ready (admin kan godkänna)
  if (hasAnyActivity) return 'ready';
  // Tom dag — borde inte komma med, men fallback ready.
  return 'ready';
}

export function aggregateDayRows(input: AggregateInput): AdminDayRow[] {
  const staffMap = new Map<string, RawStaff>();
  input.staff.forEach(s => staffMap.set(s.id, s));

  // Buckets per (staff_id, day_key)
  type Bucket = {
    workday: RawWorkday | null;
    reportedHours: number;
    travelHours: number;
    hasOpenReport: boolean;
    hasOpenTravel: boolean;
    hasOpenLocation: boolean;
    hasAnyActivity: boolean;
    flags: RawFlag[];
  };
  const newBucket = (): Bucket => ({
    workday: null,
    reportedHours: 0,
    travelHours: 0,
    hasOpenReport: false,
    hasOpenTravel: false,
    hasOpenLocation: false,
    hasAnyActivity: false,
    flags: [],
  });
  const buckets = new Map<string, Bucket>();
  const keyOf = (staffId: string, dayKey: string) => `${staffId}|${dayKey}`;

  // Workdays — anchored på started_at-day
  for (const wd of input.workdays) {
    const dk = dayKey(wd.started_at);
    if (dk < input.fromDate || dk > input.toDate) continue;
    const k = keyOf(wd.staff_id, dk);
    const b = buckets.get(k) || newBucket();
    // Behåll tidigaste workday om flera (osannolikt — UNIQUE per dag)
    if (!b.workday || wd.started_at < b.workday.started_at) b.workday = wd;
    b.hasAnyActivity = true;
    buckets.set(k, b);
  }

  // Time reports
  for (const r of input.timeReports) {
    if (r.is_subdivision) continue;
    if (r.source === 'location_auto') continue;
    if (r.report_date < input.fromDate || r.report_date > input.toDate) continue;
    const k = keyOf(r.staff_id, r.report_date);
    const b = buckets.get(k) || newBucket();
    b.reportedHours += safeHours(r.hours_worked);
    if (r.start_time && !r.end_time) b.hasOpenReport = true;
    b.hasAnyActivity = true;
    buckets.set(k, b);
  }

  // Travel logs
  for (const t of input.travelLogs) {
    if (t.report_date < input.fromDate || t.report_date > input.toDate) continue;
    const k = keyOf(t.staff_id, t.report_date);
    const b = buckets.get(k) || newBucket();
    b.travelHours += safeHours(t.hours_worked);
    if (t.start_time && !t.end_time) b.hasOpenTravel = true;
    b.hasAnyActivity = true;
    buckets.set(k, b);
  }

  // Open location entries → räknas som "öppen aktivitet" men inte i totaler
  // (LTE blir tids-rapport via mobile-app-api vid stop). Däremot registrerar
  // vi att personen är ute.
  const nowMs = Date.now();
  for (const e of input.locationEntries) {
    const dk = e.entry_date;
    if (dk < input.fromDate || dk > input.toDate) continue;
    const k = keyOf(e.staff_id, dk);
    const b = buckets.get(k) || newBucket();
    if (!e.exited_at) b.hasOpenLocation = true;
    // Om LTE redan har total_minutes (stängd) och pekar på booking/lp:
    // räknas redan via tillhörande time_report (single owner), så vi
    // dubbelräknar inte här.
    b.hasAnyActivity = true;
    buckets.set(k, b);
    void nowMs;
  }

  // Flags (endast olösta)
  for (const f of input.flags) {
    if (f.resolved) continue;
    if (f.flag_date < input.fromDate || f.flag_date > input.toDate) continue;
    const k = keyOf(f.staff_id, f.flag_date);
    const b = buckets.get(k) || newBucket();
    b.flags.push(f);
    buckets.set(k, b);
  }

  // Build rader
  const rows: AdminDayRow[] = [];
  for (const [k, b] of buckets.entries()) {
    const [staffId, dk] = k.split('|');
    const staff = staffMap.get(staffId);
    if (!staff) continue;

    // Total dagspann
    let totalDay = 0;
    let isStaleOpen = false;
    if (b.workday) {
      const startMs = new Date(b.workday.started_at).getTime();
      const endMs = b.workday.ended_at ? new Date(b.workday.ended_at).getTime() : Date.now();
      const ageHours = (Date.now() - startMs) / 3_600_000;
      isStaleOpen = !b.workday.ended_at && ageHours > STALE_OPEN_HOURS;
      totalDay = Math.max(0, (endMs - startMs) / 3_600_000);
      if (isStaleOpen) {
        // Cap för UI: undvik 50h, visa som 0 så admin förstår att det är stale
        totalDay = 0;
      }
    } else {
      // Inget workday-objekt → uppskatta från rapporterad+rest
      totalDay = b.reportedHours + b.travelHours;
    }

    const reported = b.reportedHours;
    const travel = b.travelHours;
    const unallocated = Math.max(0, totalDay - reported - travel);

    const hasOpen =
      (b.workday ? !b.workday.ended_at : false) ||
      b.hasOpenReport ||
      b.hasOpenTravel ||
      b.hasOpenLocation;

    const warnings: DayRowWarning[] = b.flags.map(f => ({
      flag_type: f.flag_type,
      severity: normSeverity(f.severity as string | null),
      title: f.title,
    }));
    if (isStaleOpen) {
      warnings.push({
        flag_type: 'stale_open_workday',
        severity: 'error',
        title: 'Arbetsdag öppen >18h — sannolikt glömd stopp',
      });
    }

    const status = deriveStatus({
      hasOpen: hasOpen && !isStaleOpen,
      isStaleOpen,
      workdayReview: b.workday?.review_status ?? null,
      unresolvedSeverities: warnings.map(w => w.severity),
      hasAnyActivity: b.hasAnyActivity,
    });

    rows.push({
      key: k,
      staff_id: staffId,
      staff_name: staff.name,
      staff_role: staff.role,
      staff_color: staff.color,
      day_key: dk,
      workday_id: b.workday?.id ?? null,
      workday_started_at: b.workday?.started_at ?? null,
      workday_ended_at: b.workday?.ended_at ?? null,
      workday_review_status: b.workday?.review_status ?? null,
      total_day_hours: totalDay,
      reported_project_hours: reported,
      travel_hours: travel,
      unallocated_hours: unallocated,
      has_open: hasOpen,
      status,
      warnings,
    });
  }

  // Sortera: needs_review först, sedan in_progress, sedan ready, approved sist.
  // Inom samma status: nyaste dag först, sedan personnamn.
  const statusRank: Record<DayStatus, number> = {
    needs_review: 0,
    in_progress: 1,
    ready: 2,
    approved: 3,
  };
  rows.sort((a, b) => {
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    if (a.day_key !== b.day_key) return a.day_key < b.day_key ? 1 : -1;
    return a.staff_name.localeCompare(b.staff_name, 'sv');
  });

  return rows;
}
