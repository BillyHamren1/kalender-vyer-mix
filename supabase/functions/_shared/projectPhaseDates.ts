/**
 * Shared, pure project read rules used by BOTH the Operations web UI and
 * planning-mobile-read, so the mobile app shows exactly what Operations shows.
 * Imported directly by the web build (no mirror file).
 */

export type PhaseKey = 'rigdaydate' | 'eventdate' | 'rigdowndate';
export type PhaseDateSource = 'project' | 'booking' | null;
export interface PhaseDateInput {
  rigdaydate?: string | null;
  eventdate?: string | null;
  rigdowndate?: string | null;
}
export interface ResolvedPhaseDates {
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  sources: { rig: PhaseDateSource; event: PhaseDateSource; derig: PhaseDateSource };
}

const PHASES: readonly PhaseKey[] = ['rigdaydate', 'eventdate', 'rigdowndate'];
const LABEL = { rigdaydate: 'rig', eventdate: 'event', rigdowndate: 'derig' } as const;

/**
 * Per field: the project's own date wins, otherwise the linked booking's date,
 * otherwise null. Empty strings count as missing. Never invents a date.
 * Callers must only pass a booking from the project's own organization.
 */
export function resolveProjectPhaseDates(
  project: PhaseDateInput | null | undefined,
  booking: PhaseDateInput | null | undefined,
): ResolvedPhaseDates {
  const out = { rigdaydate: null, eventdate: null, rigdowndate: null, sources: { rig: null, event: null, derig: null } } as ResolvedPhaseDates;
  for (const k of PHASES) {
    const own = project?.[k] || null;
    const linked = booking?.[k] || null;
    out[k] = own ?? linked;
    out.sources[LABEL[k]] = own ? 'project' : linked ? 'booking' : null;
  }
  return out;
}

export type ProjectLifecycle = 'active' | 'completed' | 'cancelled';
/** Read-only operational state. Shared with the web dashboard; never persists status. */
export function projectOperationalStatus(
  status: string | null | undefined,
  dates: { rigDate?: string | null; date?: string | null; rigDownDate?: string | null },
  today: string,
): 'planning' | 'in_progress' | 'completed' | 'cancelled' {
  if (status === 'cancelled') return 'cancelled';
  const end = dates.rigDownDate;
  if (status === 'completed' || (end && end < today)) return 'completed';
  const start = dates.rigDate ?? dates.date;
  return start && start <= today ? 'in_progress' : 'planning';
}
export type ProjectStatusTab = 'all' | 'all_active' | 'planning' | 'in_progress' | 'closing' | 'completed' | 'cancelled';

/** Operations project-list status classification (UnifiedProjectList status tabs). */
export function classifyProjectLifecycle(status: string | null | undefined): ProjectLifecycle {
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'active';
}

/** Every Operations status tab the project appears under. `today` = YYYY-MM-DD. */
export function projectStatusTabs(
  status: string | null | undefined,
  eventDate: string | null | undefined,
  today: string,
): ProjectStatusTab[] {
  const normalized = status === 'planned' ? 'planning' : status;
  const lifecycle = classifyProjectLifecycle(normalized);
  const tabs: ProjectStatusTab[] = ['all'];
  if (lifecycle === 'active') tabs.push('all_active');
  if (normalized === 'planning') tabs.push('planning');
  if (normalized === 'in_progress') tabs.push('in_progress');
  if (lifecycle === 'active' && eventDate && eventDate < today) tabs.push('closing');
  if (lifecycle === 'completed') tabs.push('completed');
  if (lifecycle === 'cancelled') tabs.push('cancelled');
  return tabs;
}

// ---------------------------------------------------------------------------
// Unified project kinds — the same three kinds Operations' project list shows
// (UnifiedProjectList): small = jobs, medium = projects, large = large_projects.
// IDs come from different tables, so identity is always (projectKind, projectId).
// ---------------------------------------------------------------------------
export type ProjectKind = 'small' | 'medium' | 'large';

const first = (v: unknown): string | null => (Array.isArray(v) && typeof v[0] === 'string' && v[0]) ? v[0] : null;

/** Small project (jobs row): status 'planned' is shown as 'planning'; dates are the linked booking's. */
export function smallProjectView(job: { status?: string | null }, booking: PhaseDateInput | null | undefined) {
  const status = job.status === 'planned' ? 'planning' : (job.status ?? null);
  const dates = resolveProjectPhaseDates(null, booking);
  return { status, dates, listEventDate: dates.eventdate };
}

/** Large project: own date arrays only. listEventDate is exactly what the Operations list uses for tabs. */
export function largeProjectView(lp: { status?: string | null; start_date?: unknown; event_date?: unknown; end_date?: unknown }) {
  const rig = first(lp.start_date), ev = first(lp.event_date), derig = (Array.isArray(lp.end_date) ? first(lp.end_date.slice(-1)) : null) ?? (Array.isArray(lp.event_date) ? first(lp.event_date.slice(-1)) : null);
  return {
    status: lp.status ?? null,
    dates: {
      rigdaydate: rig, eventdate: ev, rigdowndate: derig,
      sources: { rig: rig ? 'project' : null, event: ev ? 'project' : null, derig: derig ? 'project' : null },
    } as ResolvedPhaseDates,
    listEventDate: derig ?? rig,
  };
}
