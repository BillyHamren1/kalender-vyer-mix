// @ts-nocheck
/**
 * resolveActualWorkStartIso
 * ─────────────────────────
 * Returns the EARLIEST authoritative "work started"-timestamp for a
 * (org, staff, date) within the Stockholm day window.
 *
 * Sources (all read-only; we take the MIN across them):
 *   1. workdays.started_at  (overlapping the day window)
 *   2. active_time_registrations.started_at (overlapping the day window)
 *
 * If nothing is found we return null and the engine will not clip.
 *
 * This is used as a hard lower-bound by buildReportCandidateBlocks via
 * `actualWorkStartIso` to suppress pre-work geofence/midnight noise
 * (e.g. a 00:00 ENTER that flips into a "work" block before the staff
 * has actually started a workday/timer).
 */
export async function resolveActualWorkStartIso(
  admin: any,
  organizationId: string,
  staffId: string,
  dayStartUtcIso: string,
  dayEndUtcIso: string,
): Promise<string | null> {
  const candidates: number[] = [];

  try {
    const { data: wds } = await admin
      .from('workdays')
      .select('started_at, ended_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .lte('started_at', dayEndUtcIso)
      .or(`ended_at.is.null,ended_at.gte.${dayStartUtcIso}`);
    for (const w of wds ?? []) {
      if (!w?.started_at) continue;
      const ms = new Date(w.started_at).getTime();
      const startMs = new Date(dayStartUtcIso).getTime();
      // Clamp earliest workday start to the day window (a workday started
      // the day before should be treated as "started at day-window start").
      candidates.push(Math.max(ms, startMs));
    }
  } catch {
    // workdays optional
  }

  try {
    const { data: regs } = await admin
      .from('active_time_registrations')
      .select('started_at, stopped_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .lte('started_at', dayEndUtcIso)
      .or(`stopped_at.is.null,stopped_at.gte.${dayStartUtcIso}`);
    for (const r of regs ?? []) {
      if (!r?.started_at) continue;
      const ms = new Date(r.started_at).getTime();
      const startMs = new Date(dayStartUtcIso).getTime();
      candidates.push(Math.max(ms, startMs));
    }
  } catch {
    // optional
  }

  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates)).toISOString();
}
