// get-project-time-summary
// Returnerar kanonisk projekttid (confirmed/active/suggested/travel) per projekt.
// Frontend ska inte räkna projekttid själv från råtabeller.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buildProjectTimeSummary,
  type ProjectTarget,
  type PtmTimeReport,
  type PtmLocationTimeEntry,
  type PtmTravelLog,
} from '../_shared/projectTimeModel.ts';

async function resolveJwtUserId(
  supabase: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  const authApi = supabase.auth as typeof supabase.auth & {
    getClaims?: (jwt?: string) => Promise<{ data: { claims?: { sub?: string } } | null; error: { message?: string } | null }>;
  };

  if (typeof authApi.getClaims === 'function') {
    const { data: claims, error: cErr } = await authApi.getClaims(token);
    if (cErr) return null;
    return claims?.claims?.sub ?? null;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr) return null;
  return userData.user?.id ?? null;
}

interface Body {
  project_type: 'booking' | 'large_project' | 'location';
  project_id: string;
  from?: string | null;
  to?: string | null;
  include_booking_ids?: string[];
}

const TR_COLS = 'id, staff_id, booking_id, large_project_id, start_time, end_time, hours_worked, break_time, approved, is_subdivision, source, source_entry_id, report_date';
const LTE_COLS = 'id, staff_id, booking_id, large_project_id, location_id, entered_at, exited_at, total_minutes, source, metadata';
const TRAVEL_COLS = 'id, staff_id, destination_booking_id, next_target_type, next_target_id, start_time, end_time, hours_worked, approved, auto_detected, source, classification';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const userId = await resolveJwtUserId(supabase, authHeader.replace('Bearer ', ''));
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const body = (await req.json()) as Body;
    if (!body?.project_type || !body?.project_id) {
      return json({ error: 'project_type and project_id required' }, 400);
    }

    // Resolve target + included bookings
    const includeBookingIds = new Set<string>(body.include_booking_ids ?? []);
    let target: ProjectTarget;

    if (body.project_type === 'booking') {
      target = { kind: 'booking', bookingId: body.project_id };
      includeBookingIds.add(body.project_id);
    } else if (body.project_type === 'large_project') {
      target = { kind: 'large_project', largeProjectId: body.project_id };
      // Auto-resolve sub-bookings.
      const { data: lpb } = await supabase
        .from('large_project_bookings')
        .select('booking_id')
        .eq('large_project_id', body.project_id);
      for (const r of lpb ?? []) if (r.booking_id) includeBookingIds.add(r.booking_id as string);
    } else if (body.project_type === 'location') {
      // location-projekt syntetiseras via booking_id = 'location-<id>' i BSA, men
      // location_time_entries lagrar location_id direkt. Vi behandlar location som
      // en "booking-target" där target.bookingId == location_id för LTE-matchning,
      // men vi måste även filtrera. Här gör vi en enklare väg: target=booking med
      // pseudo-id, och inkluderar inga bookings.
      target = { kind: 'booking', bookingId: `location-${body.project_id}` };
    } else {
      return json({ error: 'invalid project_type' }, 400);
    }

    const bookingArr = Array.from(includeBookingIds);

    // ── time_reports ───────────────────────────────────────────────
    let trQ = supabase.from('time_reports').select(TR_COLS).limit(2000);
    if (body.from) trQ = trQ.gte('report_date', body.from);
    if (body.to) trQ = trQ.lte('report_date', body.to);

    let timeReports: PtmTimeReport[] = [];
    if (target.kind === 'large_project') {
      const orFilter = bookingArr.length
        ? `large_project_id.eq.${target.largeProjectId},booking_id.in.(${bookingArr.join(',')})`
        : `large_project_id.eq.${target.largeProjectId}`;
      const { data, error } = await trQ.or(orFilter);
      if (error) throw error;
      timeReports = (data ?? []) as any;
    } else if (bookingArr.length) {
      const { data, error } = await trQ.in('booking_id', bookingArr);
      if (error) throw error;
      timeReports = (data ?? []) as any;
    }

    // ── location_time_entries ──────────────────────────────────────
    let lteQ = supabase.from('location_time_entries').select(LTE_COLS).limit(2000);
    if (body.from) lteQ = lteQ.gte('entered_at', body.from);
    if (body.to) lteQ = lteQ.lte('entered_at', `${body.to}T23:59:59`);

    let lteRows: PtmLocationTimeEntry[] = [];
    if (body.project_type === 'location') {
      const { data, error } = await lteQ.eq('location_id', body.project_id);
      if (error) throw error;
      lteRows = (data ?? []) as any;
      // Map location-LTE till target.bookingId så modellen matchar dem.
      lteRows = lteRows.map((r: any) => ({ ...r, booking_id: target.kind === 'booking' ? target.bookingId : null }));
    } else if (target.kind === 'large_project') {
      const orFilter = bookingArr.length
        ? `large_project_id.eq.${target.largeProjectId},booking_id.in.(${bookingArr.join(',')})`
        : `large_project_id.eq.${target.largeProjectId}`;
      const { data, error } = await lteQ.or(orFilter);
      if (error) throw error;
      lteRows = (data ?? []) as any;
    } else if (bookingArr.length) {
      const { data, error } = await lteQ.in('booking_id', bookingArr);
      if (error) throw error;
      lteRows = (data ?? []) as any;
    }

    // ── travel_time_logs ───────────────────────────────────────────
    let travelLogs: PtmTravelLog[] = [];
    if (body.project_type !== 'location') {
      let travelQ = supabase.from('travel_time_logs').select(TRAVEL_COLS).limit(2000);
      if (body.from) travelQ = travelQ.gte('start_time', body.from);
      if (body.to) travelQ = travelQ.lte('start_time', `${body.to}T23:59:59`);

      const orParts: string[] = [];
      if (bookingArr.length) {
        orParts.push(`destination_booking_id.in.(${bookingArr.join(',')})`);
        orParts.push(`and(next_target_type.eq.booking,next_target_id.in.(${bookingArr.join(',')}))`);
      }
      if (target.kind === 'large_project') {
        orParts.push(`and(next_target_type.eq.large_project,next_target_id.eq.${target.largeProjectId})`);
      }
      if (orParts.length) {
        const { data, error } = await travelQ.or(orParts.join(','));
        if (error) throw error;
        travelLogs = (data ?? []) as any;
      }
    }

    const summary = buildProjectTimeSummary({
      target,
      includeBookingIds: bookingArr,
      dateRange: body.from && body.to ? { start: body.from, end: body.to } : undefined,
      timeReports,
      locationTimeEntries: lteRows,
      travelLogs,
    });

    // ── Berika med staff-namn + per-person status ──────────────────
    const staffIds = Array.from(new Set(summary.staffBreakdown.map(s => s.staffId)));
    const nameById = new Map<string, string>();
    if (staffIds.length) {
      const { data: staffRows } = await supabase
        .from('staff_members')
        .select('id, name')
        .in('id', staffIds);
      for (const s of staffRows ?? []) nameById.set(s.id as string, (s.name as string) ?? 'Okänd');
    }

    // Index source-rows per staff
    const srcByStaff = new Map<string, typeof summary.sourceRows>();
    for (const r of summary.sourceRows) {
      if (r.minutes === 0) continue;
      const arr = srcByStaff.get(r.staffId) ?? [];
      arr.push(r);
      srcByStaff.set(r.staffId, arr);
    }

    const staffRows = summary.staffBreakdown.map((s) => {
      const rows = srcByStaff.get(s.staffId) ?? [];
      const allTimes = rows.flatMap(r => [r.startIso, r.endIso].filter(Boolean) as string[]);
      const firstSeenAt = allTimes.length ? allTimes.reduce((a, b) => (a < b ? a : b)) : null;
      const lastSeenAt = allTimes.length ? allTimes.reduce((a, b) => (a > b ? a : b)) : null;
      const activeTimer = rows.some(r => r.kind === 'lte_active');
      const reviewRequired = summary.anomalies.some(a => a.staffId === s.staffId);

      let status: 'ok' | 'active' | 'review_required' | 'gps_only' | 'missing_workday' = 'ok';
      if (activeTimer) status = 'active';
      else if (reviewRequired) status = 'review_required';
      else if (s.confirmedMinutes === 0 && s.suggestedMinutes > 0) status = 'gps_only';
      else if (s.confirmedMinutes === 0 && s.activeMinutes === 0) status = 'missing_workday';

      return {
        staff_id: s.staffId,
        staff_name: nameById.get(s.staffId) ?? 'Okänd',
        confirmed_minutes: s.confirmedMinutes,
        active_minutes: s.activeMinutes,
        suggested_minutes: s.suggestedMinutes,
        travel_minutes: s.travelMinutesApproved + s.travelMinutesSuggested,
        first_seen_at: firstSeenAt,
        last_seen_at: lastSeenAt,
        active_timer: activeTimer,
        status,
        source_rows: rows.map(r => ({
          type: ptmKindToType(r.kind),
          id: r.rowId,
          staff_id: r.staffId,
          start_at: r.startIso,
          end_at: r.endIso,
          minutes: r.minutes,
          status: r.decision,
          source: r.kind,
          confidence: null,
          metadata: r.reason ? { reason: r.reason } : null,
        })),
      };
    });

    const sourceRows = summary.sourceRows
      .filter(r => r.minutes > 0)
      .map(r => ({
        type: ptmKindToType(r.kind),
        id: r.rowId,
        staff_id: r.staffId,
        start_at: r.startIso,
        end_at: r.endIso,
        minutes: r.minutes,
        status: r.decision,
        source: r.kind,
        confidence: null,
        metadata: r.reason ? { reason: r.reason } : null,
      }));

    const summaryOut = {
      confirmed_minutes: summary.confirmedMinutes,
      active_minutes: summary.activeMinutes,
      suggested_minutes: summary.suggestedMinutes,
      approved_travel_minutes: summary.travelMinutesApproved,
      suggested_travel_minutes: summary.travelMinutesSuggested,
      staff_count: staffRows.length,
      active_staff_count: staffRows.filter(s => s.active_timer).length,
      review_required_count: staffRows.filter(s => s.status === 'review_required').length,
    };

    return json({
      target: { project_type: body.project_type, project_id: body.project_id },
      summary: summaryOut,
      staffRows,
      sourceRows,
      anomalies: summary.anomalies,
    }, 200);
  } catch (e: any) {
    console.error('get-project-time-summary error', e);
    return json({ error: e?.message ?? 'unknown_error' }, 500);
  }
});

function ptmKindToType(kind: string): 'time_report' | 'lte' | 'travel' | 'gps_suggestion' | 'assistant' {
  if (kind === 'time_report') return 'time_report';
  if (kind === 'lte_active' || kind === 'lte_closed') return 'lte';
  if (kind === 'travel_approved' || kind === 'travel_suggested') return 'travel';
  return 'gps_suggestion';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
