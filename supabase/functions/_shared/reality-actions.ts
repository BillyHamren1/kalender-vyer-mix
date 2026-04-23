/**
 * reality-actions.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Idempotent helpers used by the reality-reconciler to apply AI-suggested
 * corrections. Every helper logs to ai_reality_corrections via the caller.
 *
 * All helpers are NO-OPs if the underlying row no longer matches the expected
 * state (e.g. travel already closed, workday already exists), so re-running
 * the reconciler is safe.
 */

export interface ActionResult {
  ok: boolean;
  changed: boolean;
  detail?: any;
  error?: string;
}

/**
 * Close an open travel log at `atIso` and open a new location_time_entry
 * for the given location starting at the same moment.
 */
export async function applyCloseTravelAndOpenLocation(
  supabase: any,
  args: {
    staffId: string;
    organizationId: string;
    travelId: string;
    locationId: string;
    locationName: string;
    locationLat: number;
    locationLng: number;
    atIso: string;
  },
): Promise<ActionResult> {
  // 1. Confirm travel still open
  const { data: travel, error: tErr } = await supabase
    .from('travel_time_logs')
    .select('id, end_time, start_time')
    .eq('id', args.travelId)
    .single();
  if (tErr || !travel) return { ok: false, changed: false, error: 'travel_not_found' };
  if (travel.end_time) return { ok: true, changed: false, detail: { reason: 'travel_already_closed' } };

  const startMs = new Date(travel.start_time).getTime();
  const atMs = new Date(args.atIso).getTime();
  const hours = Math.max(0, (atMs - startMs) / 3_600_000);

  const { error: closeErr } = await supabase
    .from('travel_time_logs')
    .update({
      end_time: args.atIso,
      to_latitude: args.locationLat,
      to_longitude: args.locationLng,
      to_address: args.locationName,
      hours_worked: Number(hours.toFixed(2)),
      classification: 'work',
    })
    .eq('id', args.travelId)
    .is('end_time', null);
  if (closeErr) return { ok: false, changed: false, error: `close_travel: ${closeErr.message}` };

  // 2. Skip creating location entry if one is already open
  const { data: existing } = await supabase
    .from('location_time_entries')
    .select('id')
    .eq('staff_id', args.staffId)
    .is('exited_at', null)
    .limit(1);

  let createdEntryId: string | null = null;
  if (!existing || existing.length === 0) {
    const dedupeKey = `ai-reality-${args.staffId}-${args.locationId}-${args.atIso}`;
    const { data: ins, error: insErr } = await supabase
      .from('location_time_entries')
      .insert({
        staff_id: args.staffId,
        organization_id: args.organizationId,
        location_id: args.locationId,
        entered_at: args.atIso,
        entry_date: args.atIso.slice(0, 10),
        source: 'ai_reconciled',
        client_dedupe_key: dedupeKey,
      })
      .select('id')
      .single();
    if (insErr) return { ok: false, changed: true, error: `open_location: ${insErr.message}` };
    createdEntryId = ins?.id ?? null;
  }

  return {
    ok: true,
    changed: true,
    detail: { closed_travel_id: args.travelId, created_entry_id: createdEntryId },
  };
}

/**
 * Close a location_time_entry that the staff member has clearly left.
 */
export async function applyCloseStaleLocation(
  supabase: any,
  args: { entryId: string; atIso: string },
): Promise<ActionResult> {
  const { data: entry, error: gErr } = await supabase
    .from('location_time_entries')
    .select('id, exited_at, entered_at')
    .eq('id', args.entryId)
    .single();
  if (gErr || !entry) return { ok: false, changed: false, error: 'entry_not_found' };
  if (entry.exited_at) return { ok: true, changed: false, detail: { reason: 'already_closed' } };

  const minutes = Math.max(
    0,
    Math.round((new Date(args.atIso).getTime() - new Date(entry.entered_at).getTime()) / 60000),
  );
  const { error: uErr } = await supabase
    .from('location_time_entries')
    .update({ exited_at: args.atIso, total_minutes: minutes })
    .eq('id', args.entryId)
    .is('exited_at', null);
  if (uErr) return { ok: false, changed: false, error: uErr.message };
  return { ok: true, changed: true, detail: { closed_entry_id: args.entryId } };
}

/**
 * Close an open workday at `atIso` (typically last activity timestamp).
 */
export async function applyCloseStaleWorkday(
  supabase: any,
  args: { workdayId: string; atIso: string },
): Promise<ActionResult> {
  const { data: wd, error: gErr } = await supabase
    .from('workdays')
    .select('id, ended_at')
    .eq('id', args.workdayId)
    .single();
  if (gErr || !wd) return { ok: false, changed: false, error: 'workday_not_found' };
  if (wd.ended_at) return { ok: true, changed: false, detail: { reason: 'already_ended' } };

  const { error: uErr } = await supabase
    .from('workdays')
    .update({ ended_at: args.atIso, ended_by: 'ai_reconciled' })
    .eq('id', args.workdayId)
    .is('ended_at', null);
  if (uErr) return { ok: false, changed: false, error: uErr.message };
  return { ok: true, changed: true, detail: { closed_workday_id: args.workdayId } };
}

/**
 * Ensure a workday row exists for today; create one if missing.
 */
export async function applyEnsureWorkday(
  supabase: any,
  args: { staffId: string; organizationId: string; atIso: string },
): Promise<ActionResult> {
  const dayStart = new Date(`${args.atIso.slice(0, 10)}T00:00:00Z`).toISOString();
  const { data: existing } = await supabase
    .from('workdays')
    .select('id, ended_at')
    .eq('staff_id', args.staffId)
    .gte('started_at', dayStart)
    .order('started_at', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    return { ok: true, changed: false, detail: { reason: 'workday_exists', id: existing[0].id } };
  }

  const { data: ins, error: insErr } = await supabase
    .from('workdays')
    .insert({
      staff_id: args.staffId,
      organization_id: args.organizationId,
      started_at: args.atIso,
      started_by: 'ai_reconciled',
    })
    .select('id')
    .single();
  if (insErr) return { ok: false, changed: false, error: insErr.message };
  return { ok: true, changed: true, detail: { created_workday_id: ins.id } };
}

/**
 * Insert audit row in ai_reality_corrections.
 */
export async function logCorrection(
  supabase: any,
  row: {
    organization_id: string;
    staff_id: string;
    situation_kind: string;
    confidence: number;
    ai_reasoning: string;
    ai_model?: string;
    situation_snapshot: any;
    suggested_actions: any[];
    applied_actions: any[];
    status: 'applied' | 'asked_user' | 'uncertain' | 'reverted' | 'dismissed';
  },
): Promise<{ id: string | null }> {
  const { data, error } = await supabase
    .from('ai_reality_corrections')
    .insert({
      ...row,
      applied_at: row.status === 'applied' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[reality-actions] logCorrection failed:', error);
    return { id: null };
  }
  return { id: data?.id ?? null };
}
