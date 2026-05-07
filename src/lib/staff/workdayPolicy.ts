// Frontend mirror of supabase/functions/_shared/workdayPolicy.ts
//
// Canonical rules for what counts as work, what may auto-start the workday,
// and how segments are classified relative to an active workday window.
//
// PRINCIPLE: when the workday is running, time INSIDE the window counts
// as work until something explicitly proves otherwise. Unknown / travel
// segments are NEVER silently dropped from the workday duration — they
// are tagged for review.
//
// Keep this file in sync with the Deno copy. Both files share the same
// public API (isConfirmedWorksitePresence, canStartWorkdayAutomatically,
// countsWithinActiveWorkday, classifySegment, suggestedWorkdayStart,
// countsAsPayableUnallocated).

export type PolicyStatus =
  | 'confirmed_work'
  | 'active_work'
  | 'travel_within_workday'
  | 'other_place'
  | 'unknown_needs_review'
  | 'travel_outside_workday'
  | 'break'
  | 'private'
  | 'approved'
  | 'locked';

export interface PolicySegment {
  kind: 'project' | 'booking' | 'travel' | 'location' | 'unknown' | 'active';
  startedAt: string;
  endedAt: string | null;
  classification?: string | null;
  hasConfirmedRef?: boolean;
  approved?: boolean | null;
}

export interface PolicyWorkday {
  startedAt: string;
  endedAt: string | null;
  approved: boolean;
}

const tms = (iso: string | null | undefined) =>
  iso ? new Date(iso).getTime() : NaN;

export function isConfirmedWorksitePresence(seg: PolicySegment): boolean {
  if (seg.classification === 'private' || seg.classification === 'break') return false;
  if (seg.kind === 'project' || seg.kind === 'booking' || seg.kind === 'location') {
    return seg.hasConfirmedRef !== false;
  }
  if (seg.kind === 'active') return seg.hasConfirmedRef === true;
  return false;
}

export function canStartWorkdayAutomatically(seg: PolicySegment): boolean {
  return isConfirmedWorksitePresence(seg);
}

export function countsWithinActiveWorkday(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): boolean {
  if (!workday) return false;
  const wdStart = tms(workday.startedAt);
  const wdEnd = workday.endedAt ? tms(workday.endedAt) : now.getTime();
  const sStart = tms(seg.startedAt);
  const sEnd = seg.endedAt ? tms(seg.endedAt) : now.getTime();
  if (!isFinite(sStart) || !isFinite(wdStart)) return false;
  return sEnd > wdStart && sStart < wdEnd;
}

export function classifySegment(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): PolicyStatus {
  if (workday?.approved || seg.approved) return 'approved';
  if (seg.classification === 'break') return 'break';
  if (seg.classification === 'private') return 'private';

  const inside = countsWithinActiveWorkday(seg, workday, now);

  if (seg.kind === 'active') return 'active_work';
  if (seg.kind === 'travel') {
    return inside ? 'travel_within_workday' : 'travel_outside_workday';
  }
  if (isConfirmedWorksitePresence(seg)) return 'confirmed_work';
  return inside ? 'other_place' : 'unknown_needs_review';
}

export function suggestedWorkdayStart(
  segments: PolicySegment[],
  workday: PolicyWorkday | null,
): string | null {
  const confirmed = segments
    .filter(canStartWorkdayAutomatically)
    .map((s) => s.startedAt)
    .filter(Boolean)
    .sort();
  const earliest = confirmed[0] ?? null;
  if (!earliest) return null;
  if (!workday) return earliest;
  return earliest < workday.startedAt ? earliest : null;
}

export function countsAsPayableUnallocated(
  seg: PolicySegment,
  workday: PolicyWorkday | null,
  now: Date = new Date(),
): boolean {
  if (!workday) return false;
  if (seg.classification === 'private' || seg.classification === 'break') return false;
  return countsWithinActiveWorkday(seg, workday, now);
}

/** Human-readable label for a status — UI may use these as fallbacks. */
export function policyLabel(s: PolicyStatus): string {
  switch (s) {
    case 'confirmed_work': return 'Bekräftat arbete';
    case 'active_work': return 'Pågående aktivitet';
    case 'travel_within_workday': return 'Förflyttning · ingår i arbetsdagen';
    case 'other_place': return 'Annan plats · inom arbetsdagen';
    case 'unknown_needs_review': return 'Okänd vistelse · behöver granskning';
    case 'travel_outside_workday': return 'Förflyttning utanför arbetsdag';
    case 'break': return 'Rast';
    case 'private': return 'Privat';
    case 'approved': return 'Godkänd';
    case 'locked': return 'Låst';
  }
}
