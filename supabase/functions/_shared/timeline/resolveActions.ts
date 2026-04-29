// Day Timeline Engine — resolve_suggestion actions (Etapp 3)
// Centraliserar all mutation av time_reports / travel_time_logs / workday_flags
// + audit-loggning i timeline_action_audit.

export type ResolveAction =
  | "accept"
  | "ignore"
  | "mark_travel"
  | "mark_unclear"
  | "move_to_other_site"
  // Backwards compat for older clients:
  | "move";

export interface ResolveContext {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  userId: string;
  orgId: string;
  // deno-lint-ignore no-explicit-any
  suggestion: any; // row from time_report_correction_suggestions
  payload: Record<string, unknown>;
}

export interface ResolveResult {
  ok: true;
  action: ResolveAction;
  status: "accepted" | "ignored";
  side_effects: {
    time_report_updated?: boolean;
    travel_log_id?: string;
    new_time_report_id?: string;
    workday_flag_id?: string;
  };
}

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

async function loadReport(ctx: ResolveContext, id: string) {
  const { data } = await ctx.supabase
    .from("time_reports")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  return data;
}

async function writeAudit(
  ctx: ResolveContext,
  action: ResolveAction,
  extra: Record<string, unknown>,
) {
  const { suggestion } = ctx;
  await ctx.supabase.from("timeline_action_audit").insert({
    organization_id: ctx.orgId,
    staff_id: suggestion.staff_id,
    report_date: suggestion.report_date,
    suggestion_id: suggestion.id,
    time_report_id: suggestion.time_report_id ?? null,
    actor_user_id: ctx.userId,
    action,
    payload: { ...extra, suggestion_type: suggestion.suggestion_type },
  });
}

async function markSuggestionResolved(
  ctx: ResolveContext,
  status: "accepted" | "ignored",
  resolvedAction: ResolveAction,
) {
  await ctx.supabase
    .from("time_report_correction_suggestions")
    .update({
      status,
      resolved_by: ctx.userId,
      resolved_at: new Date().toISOString(),
      resolved_action: resolvedAction,
      resolution_payload: ctx.payload ?? null,
    })
    .eq("id", ctx.suggestion.id);
}

// ─── ACCEPT ────────────────────────────────────────────────────────────────
export async function resolveAccept(ctx: ResolveContext): Promise<ResolveResult> {
  const { suggestion } = ctx;
  const updates: Record<string, unknown> = {};
  if (suggestion.suggested_start_time) updates.start_time = suggestion.suggested_start_time;
  if (suggestion.suggested_end_time) updates.end_time = suggestion.suggested_end_time;
  if (suggestion.suggested_duration_min != null) {
    updates.hours_worked = Number((suggestion.suggested_duration_min / 60).toFixed(2));
  }
  let updated = false;
  if (suggestion.time_report_id && Object.keys(updates).length > 0) {
    const { error } = await ctx.supabase
      .from("time_reports")
      .update(updates)
      .eq("id", suggestion.time_report_id)
      .eq("organization_id", ctx.orgId);
    if (error) throw new Error(`update time_report failed: ${error.message}`);
    updated = true;
  }
  await markSuggestionResolved(ctx, "accepted", "accept");
  await writeAudit(ctx, "accept", { applied: updates, time_report_updated: updated });
  return { ok: true, action: "accept", status: "accepted", side_effects: { time_report_updated: updated } };
}

// ─── IGNORE ────────────────────────────────────────────────────────────────
export async function resolveIgnore(ctx: ResolveContext): Promise<ResolveResult> {
  await markSuggestionResolved(ctx, "ignored", "ignore");
  await writeAudit(ctx, "ignore", {});
  return { ok: true, action: "ignore", status: "ignored", side_effects: {} };
}

// ─── MARK_TRAVEL ───────────────────────────────────────────────────────────
// Tolkning: differensen mellan rapporterad slut och föreslagen slut räknas som
// restid. Vi kortar time_report enligt förslaget OCH skapar en travel_time_log
// från föreslagen slut → original slut samma dag.
export async function resolveMarkTravel(ctx: ResolveContext): Promise<ResolveResult> {
  const { suggestion } = ctx;
  if (!suggestion.time_report_id) throw new Error("missing_time_report_id");
  const report = await loadReport(ctx, suggestion.time_report_id);
  if (!report) throw new Error("time_report_not_found");

  const origEnd = suggestion.original_end_time ?? report.end_time;
  const newEnd = suggestion.suggested_end_time;
  if (!origEnd || !newEnd || newEnd >= origEnd) {
    throw new Error("invalid_travel_window");
  }
  // Update report end + hours
  const newDurationMin = suggestion.suggested_duration_min;
  const reportUpdates: Record<string, unknown> = { end_time: newEnd };
  if (newDurationMin != null) reportUpdates.hours_worked = Number((newDurationMin / 60).toFixed(2));
  const { error: updErr } = await ctx.supabase
    .from("time_reports")
    .update(reportUpdates)
    .eq("id", report.id)
    .eq("organization_id", ctx.orgId);
  if (updErr) throw new Error(`update time_report failed: ${updErr.message}`);

  // Insert travel_time_log (newEnd → origEnd same date)
  const startTs = `${suggestion.report_date}T${newEnd.length === 5 ? newEnd + ":00" : newEnd}+00:00`;
  const endTs   = `${suggestion.report_date}T${origEnd.length === 5 ? origEnd + ":00" : origEnd}+00:00`;
  const startMs = new Date(startTs).getTime();
  const endMs   = new Date(endTs).getTime();
  const hours   = Math.max(0, (endMs - startMs) / 3_600_000);

  const { data: travel, error: tErr } = await ctx.supabase
    .from("travel_time_logs")
    .insert({
      organization_id: ctx.orgId,
      staff_id: suggestion.staff_id,
      report_date: suggestion.report_date,
      start_time: startTs,
      end_time: endTs,
      hours_worked: Number(hours.toFixed(2)),
      classification: "work",
      source: "timeline_suggestion",
      auto_detected: false,
      needs_review: false,
      description: `Skapad från korrigeringsförslag: ${fmtDuration(Math.round(hours * 60))} klassad som restid`,
      destination_booking_id: report.booking_id ?? null,
      related_booking_id: null,
      approved: false,
    })
    .select("id")
    .maybeSingle();
  if (tErr) throw new Error(`travel_log insert failed: ${tErr.message}`);

  await markSuggestionResolved(ctx, "accepted", "mark_travel");
  await writeAudit(ctx, "mark_travel", {
    new_end: newEnd,
    travel_start: newEnd,
    travel_end: origEnd,
    travel_log_id: travel?.id ?? null,
  });
  return {
    ok: true,
    action: "mark_travel",
    status: "accepted",
    side_effects: { time_report_updated: true, travel_log_id: travel?.id ?? undefined },
  };
}

// ─── MOVE_TO_OTHER_SITE ────────────────────────────────────────────────────
// Originalrapporten kortas vid suggested_end_time, och en NY time_report skapas
// för perioden newEnd → origEnd, kopplad till user-vald target (booking/project/location).
export async function resolveMoveToOtherSite(ctx: ResolveContext): Promise<ResolveResult> {
  const { suggestion, payload } = ctx;
  const targetBookingId = (payload.target_booking_id as string | null | undefined) ?? null;
  const targetProjectId = (payload.target_project_id as string | null | undefined) ?? null;
  const targetLocationId = (payload.target_location_id as string | null | undefined) ?? null;
  if (!targetBookingId && !targetProjectId && !targetLocationId) {
    throw new Error("missing_target");
  }
  if (!suggestion.time_report_id) throw new Error("missing_time_report_id");
  const report = await loadReport(ctx, suggestion.time_report_id);
  if (!report) throw new Error("time_report_not_found");

  const origEnd = suggestion.original_end_time ?? report.end_time;
  const splitAt = suggestion.suggested_end_time;
  if (!origEnd || !splitAt || splitAt >= origEnd) throw new Error("invalid_split_window");

  // 1. Shorten original
  const newDur = suggestion.suggested_duration_min;
  const updates: Record<string, unknown> = { end_time: splitAt };
  if (newDur != null) updates.hours_worked = Number((newDur / 60).toFixed(2));
  const { error: uErr } = await ctx.supabase
    .from("time_reports")
    .update(updates)
    .eq("id", report.id)
    .eq("organization_id", ctx.orgId);
  if (uErr) throw new Error(`shorten original failed: ${uErr.message}`);

  // 2. Insert new report (splitAt → origEnd)
  const startMs = new Date(`${suggestion.report_date}T${splitAt.length === 5 ? splitAt + ":00" : splitAt}+00:00`).getTime();
  const endMs = new Date(`${suggestion.report_date}T${origEnd.length === 5 ? origEnd + ":00" : origEnd}+00:00`).getTime();
  const hours = Math.max(0, (endMs - startMs) / 3_600_000);

  const { data: newReport, error: nErr } = await ctx.supabase
    .from("time_reports")
    .insert({
      organization_id: ctx.orgId,
      staff_id: suggestion.staff_id,
      report_date: suggestion.report_date,
      start_time: splitAt,
      end_time: origEnd,
      hours_worked: Number(hours.toFixed(2)),
      booking_id: targetBookingId,
      large_project_id: targetProjectId,
      location_id: targetLocationId,
      source: "timeline_move",
    })
    .select("id")
    .maybeSingle();
  if (nErr) throw new Error(`new time_report failed: ${nErr.message}`);

  await markSuggestionResolved(ctx, "accepted", "move_to_other_site");
  await writeAudit(ctx, "move_to_other_site", {
    split_at: splitAt,
    original_report_id: report.id,
    new_report_id: newReport?.id ?? null,
    target_booking_id: targetBookingId,
    target_project_id: targetProjectId,
    target_location_id: targetLocationId,
  });
  return {
    ok: true,
    action: "move_to_other_site",
    status: "accepted",
    side_effects: { time_report_updated: true, new_time_report_id: newReport?.id ?? undefined },
  };
}

// ─── MARK_UNCLEAR ──────────────────────────────────────────────────────────
// Skapar en workday_flag av typen 'unclear_time' utan att röra time_report.
export async function resolveMarkUnclear(ctx: ResolveContext): Promise<ResolveResult> {
  const { suggestion, payload } = ctx;
  const note = (payload.note as string | undefined) ?? null;
  const { data: flag, error } = await ctx.supabase
    .from("workday_flags")
    .insert({
      organization_id: ctx.orgId,
      staff_id: suggestion.staff_id,
      flag_type: "unclear_time",
      severity: "medium",
      flag_date: suggestion.report_date,
      title: "Oklar tid markerad av admin",
      description: note ?? suggestion.human_readable_text,
      needs_user_input: false,
      related_time_report_id: suggestion.time_report_id ?? null,
      context: {
        source: "timeline_suggestion",
        suggestion_id: suggestion.id,
        suggestion_type: suggestion.suggestion_type,
      },
      resolved: false,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`workday_flag insert failed: ${error.message}`);

  await markSuggestionResolved(ctx, "accepted", "mark_unclear");
  await writeAudit(ctx, "mark_unclear", { workday_flag_id: flag?.id ?? null, note });
  return {
    ok: true,
    action: "mark_unclear",
    status: "accepted",
    side_effects: { workday_flag_id: flag?.id ?? undefined },
  };
}

export const ACTIONS: Record<ResolveAction, (ctx: ResolveContext) => Promise<ResolveResult>> = {
  accept: resolveAccept,
  ignore: resolveIgnore,
  mark_travel: resolveMarkTravel,
  mark_unclear: resolveMarkUnclear,
  move_to_other_site: resolveMoveToOtherSite,
  move: resolveMoveToOtherSite, // alias
};
