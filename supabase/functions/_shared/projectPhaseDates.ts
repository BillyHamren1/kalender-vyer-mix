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
export type ProjectStatusTab = 'all' | 'all_active' | 'planning' | 'in_progress' | 'closing' | 'completed' | 'cancelled';

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

/** Operations database is the only authority for operational status.
 * No client clock or local classification fallback is allowed.
 */
export async function loadProjectStates(client: any, kind: ProjectKind, ids: string[], organizationId?: string) {
  const states = new Map<string, { status: string; lifecycle: ProjectLifecycle; statusTabs: ProjectStatusTab[] }>();
  const unique = [...new Set(ids)];
  for (let offset = 0; offset < unique.length; offset += 200) {
    const batch = unique.slice(offset, offset + 200);
    let query = client.from('operations_project_states')
      .select('project_id, status, lifecycle, status_tabs').eq('project_kind', kind).in('project_id', batch);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      if (!batch.includes(row.project_id) || !['planning', 'in_progress', 'completed', 'cancelled'].includes(row.status)
        || !['active', 'completed', 'cancelled'].includes(row.lifecycle) || !Array.isArray(row.status_tabs)) {
        throw new Error('Invalid Operations project state');
      }
      states.set(row.project_id, { status: row.status, lifecycle: row.lifecycle, statusTabs: row.status_tabs });
    }
    if (batch.some(id => !states.has(id))) throw new Error('Incomplete Operations project states');
  }
  return states;
}
