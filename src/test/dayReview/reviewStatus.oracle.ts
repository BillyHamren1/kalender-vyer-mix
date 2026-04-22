/**
 * reviewStatus.oracle.ts
 * ──────────────────────
 * TypeScript-port av SQL-funktionen `compute_workday_review_status` från
 * 20260422232436_0dc106e3.sql, för att testa logiken utan en faktisk
 * Postgres-instans.
 *
 * Sviten i dayReview/*.test.ts driver scenarier (missad arrival, stale event,
 * öppen resa, osv) genom denna oracle och förväntar sig samma status/reasons
 * som migration-funktionen producerar.
 *
 * REGLER (måste hållas i synk med SQL):
 *   • approved är ABSORBERANDE — ingenting nedgraderar den.
 *   • Reasons (i ordning de evalueras):
 *       open_assistant_events     — pending && !stale_for_prompt under dagen
 *       stale_review_events       — pending && still_relevant_for_review
 *       missing_end               — wd.ended_at null && started > 20h sen
 *       unresolved_travel         — travel_time_logs utan ended_at samma dag
 *       missed_prompts_all_day    — >=3 stale_for_prompt && pending
 *   • Status:
 *       needs_review om reasons.length > 0
 *       ready       om ended_at finns
 *       draft       annars
 */

export type ReviewStatus = 'draft' | 'needs_review' | 'ready' | 'approved';
export type ReviewReason =
  | 'open_assistant_events'
  | 'stale_review_events'
  | 'missing_end'
  | 'unresolved_travel'
  | 'missed_prompts_all_day';

export interface OracleEvent {
  happened_at: string; // ISO
  resolution_status: 'pending' | 'resolved' | 'dismissed' | 'ignored_stale' | 'auto_closed_by_later_action';
  stale_for_prompt: boolean;
  still_relevant_for_review: boolean;
}

export interface OracleTravel {
  started_at: string;
  ended_at: string | null;
}

export interface OracleWorkday {
  id: string;
  started_at: string;
  ended_at: string | null;
  review_status: ReviewStatus;
}

export interface OracleInput {
  workday: OracleWorkday;
  events: OracleEvent[];
  travels: OracleTravel[];
  /** Default: now() — the migration uses now() for the missing_end heuristic. */
  now?: Date;
}

export interface OracleResult {
  status: ReviewStatus;
  reasons: ReviewReason[];
}

function dayBounds(startedAt: string): { dayStart: number; dayEnd: number } {
  const d = new Date(startedAt);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { dayStart, dayEnd: dayStart + 24 * 3600 * 1000 };
}

export function computeReview(input: OracleInput): OracleResult {
  const { workday, events, travels } = input;
  const now = (input.now ?? new Date()).getTime();

  // approved is absorbing
  if (workday.review_status === 'approved') {
    return { status: 'approved', reasons: [] };
  }

  const { dayStart, dayEnd } = dayBounds(workday.started_at);
  const inDay = (iso: string) => {
    const t = Date.parse(iso);
    return t >= dayStart && t < dayEnd;
  };

  const reasons: ReviewReason[] = [];

  // 1. open_assistant_events — pending and not stale-for-prompt
  const open = events.filter(
    (e) => inDay(e.happened_at) && e.resolution_status === 'pending' && !e.stale_for_prompt,
  );
  if (open.length > 0) reasons.push('open_assistant_events');

  // 2. stale_review_events — pending and still relevant for review
  const staleReview = events.filter(
    (e) => inDay(e.happened_at) && e.resolution_status === 'pending' && e.still_relevant_for_review,
  );
  if (staleReview.length > 0) reasons.push('stale_review_events');

  // 3. missing_end — wd.ended_at null and started > 20h ago
  if (
    workday.ended_at === null &&
    Date.parse(workday.started_at) < now - 20 * 3600 * 1000
  ) {
    reasons.push('missing_end');
  }

  // 4. unresolved_travel — open travel logs same day
  const openTravel = travels.filter((t) => inDay(t.started_at) && t.ended_at === null);
  if (openTravel.length > 0) reasons.push('unresolved_travel');

  // 5. missed_prompts_all_day — >=3 stale_for_prompt && pending
  const missed = events.filter(
    (e) => inDay(e.happened_at) && e.stale_for_prompt && e.resolution_status === 'pending',
  );
  if (missed.length >= 3) reasons.push('missed_prompts_all_day');

  let status: ReviewStatus;
  if (reasons.length > 0) status = 'needs_review';
  else if (workday.ended_at !== null) status = 'ready';
  else status = 'draft';

  return { status, reasons };
}
