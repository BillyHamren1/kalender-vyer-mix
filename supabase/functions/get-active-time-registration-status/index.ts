/**
 * get-active-time-registration-status
 * ===================================
 *
 * Returns the new Time Engine's current timer status for a staff member.
 *
 * Sources used (whitelist):
 *   - active_time_registrations (the new authoritative active timer)
 *   - staff_location_history    (recent GPS pings only — for classification)
 *   - resolveWorkTargets        (matching pings to known work places)
 *
 * Sources NEVER used (blacklist):
 *   - workday / workdays
 *   - time_reports
 *   - location_time_entries
 *   - travel_time_logs
 *   - assistant_events / legacy timers
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildGpsDayTimeline,
  type GpsPing,
} from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import { classifyActiveSegment } from '../_shared/time-engine/timePolicy.ts';
import type { TargetMatch, WorkTarget } from '../_shared/time-engine/contracts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ReqBody {
  staffId?: string;
  organizationId?: string;
}

interface ActiveRow {
  id: string;
  organization_id: string;
  staff_id: string;
  status: string;
  started_at: string;
  start_source: string;
  auto_started: boolean;
  current_kind: string | null;
  current_label: string | null;
  current_target_type: string | null;
  current_target_id: string | null;
  current_confidence: number | null;
  needs_user_choice: boolean;
  manual_override_kind: string | null;
  manual_override_label: string | null;
  manual_override_target_type: string | null;
  manual_override_target_id: string | null;
}

const todayLocalIsoDate = (d = new Date()) => {
  // YYYY-MM-DD in UTC; fine for "today" bucketing of recent pings.
  return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const staffId = body.staffId;
    const organizationId = body.organizationId;
    if (!staffId || !organizationId) {
      return json({ error: 'staffId and organizationId required' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Active row?
    const { data: activeData, error: activeErr } = await supabaseAdmin
      .from('active_time_registrations')
      .select(
        'id, organization_id, staff_id, status, started_at, start_source, auto_started, current_kind, current_label, current_target_type, current_target_id, current_confidence, needs_user_choice, manual_override_kind, manual_override_label, manual_override_target_type, manual_override_target_id',
      )
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (activeErr) return json({ error: activeErr.message }, 500);

    if (!activeData) {
      return json({
        active: false,
        label: 'Tid registreras inte',
        elapsedSeconds: 0,
      });
    }

    const active = activeData as ActiveRow;
    const elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - Date.parse(active.started_at)) / 1000),
    );

    // 2) Manual override wins.
    if (active.manual_override_kind) {
      return json({
        active: true,
        registrationId: active.id,
        startedAt: active.started_at,
        elapsedSeconds,
        currentKind: active.manual_override_kind,
        currentLabel: active.manual_override_label ?? active.manual_override_kind,
        currentTargetType: active.manual_override_target_type,
        currentTargetId: active.manual_override_target_id,
        confidence: 1,
        needsUserChoice: false,
        startSource: active.start_source,
        autoStarted: active.auto_started,
        manualOverride: true,
      });
    }

    // 3) GPS classification of "now" — last ~20 minutes of pings, just enough
    //    to classify the current segment. Pure read of staff_location_history.
    const sinceIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: pingsData } = await supabaseAdmin
      .from('staff_location_history')
      .select('lat, lng, accuracy, speed, recorded_at')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: true })
      .limit(200);

    let currentKind = active.current_kind;
    let currentLabel = active.current_label;
    let currentTargetType = active.current_target_type;
    let currentTargetId = active.current_target_id;
    let confidence = active.current_confidence ?? 0;
    let needsUserChoice = active.needs_user_choice;

    const pings: GpsPing[] = (pingsData ?? []).map((p: any) => ({
      ts: p.recorded_at,
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
      speedMps: p.speed != null ? Number(p.speed) : null,
    }));

    if (pings.length >= 2) {
      // Resolve targets for today.
      const { targets: resolved } = await resolveWorkTargets({
        organizationId,
        staffId,
        date: todayLocalIsoDate(),
        supabaseAdmin,
      });
      const workTargets: WorkTarget[] = resolved
        .map(toWorkTarget)
        .filter((t): t is WorkTarget => !!t);

      const timeline = buildGpsDayTimeline({
        staffId,
        organizationId,
        date: todayLocalIsoDate(),
        pings,
        targets: workTargets,
      });

      // Most recent segment = "now".
      const last = timeline.segments[timeline.segments.length - 1];
      if (last) {
        const matchedTarget = workTargets.find((t) => t.refId === last.matchedTargetId);
        const fakeMatch: TargetMatch = {
          segmentId: last.id,
          outcome:
            last.kind === 'travel' || last.type === 'transport' ? 'transport'
            : last.kind === 'gps_gap' || last.type === 'gps_gap' ? 'gps_uncertain'
            : last.type === 'known_site' && matchedTarget ? 'inside_known_target'
            : 'unknown_place',
          target: matchedTarget,
          confidence: last.confidence,
        };

        // Use the policy's segment classifier (regel 5).
        const seg = classifyActiveSegment(
          {
            id: last.id,
            startedAt: last.startTs,
            endedAt: last.endTs,
            kind:
              last.kind === 'stay' ? 'stationary'
              : last.kind === 'travel' ? 'movement'
              : 'gps_gap',
            confidence: last.confidence,
            pingCount: last.pingCount,
          },
          fakeMatch,
        );

        // Apply only if GPS is decisive (regel: "tydligt visar ny status").
        const decisive =
          seg.kind === 'transport' ||
          seg.kind === 'unknown_place' ||
          seg.kind === 'gps_uncertain' ||
          (seg.kind === 'project' || seg.kind === 'booking' || seg.kind === 'warehouse') &&
            !!matchedTarget;

        if (decisive) {
          currentKind = seg.kind;
          currentLabel = seg.label;
          confidence = last.confidence;
          if (matchedTarget && (seg.kind === 'project' || seg.kind === 'booking' || seg.kind === 'warehouse')) {
            currentTargetType = matchedTarget.kind;
            currentTargetId = matchedTarget.refId;
            needsUserChoice = false;
          } else if (seg.kind === 'unknown_place' || seg.kind === 'gps_uncertain') {
            currentTargetType = null;
            currentTargetId = null;
            needsUserChoice = true;
          } else if (seg.kind === 'transport') {
            currentTargetType = null;
            currentTargetId = null;
            needsUserChoice = false;
          }

          // Persist the new classification (best-effort; do not fail request).
          await supabaseAdmin
            .from('active_time_registrations')
            .update({
              current_kind: currentKind,
              current_label: currentLabel,
              current_target_type: currentTargetType,
              current_target_id: currentTargetId,
              current_confidence: confidence,
              needs_user_choice: needsUserChoice,
            })
            .eq('id', active.id);
        }
      }
    }

    return json({
      active: true,
      registrationId: active.id,
      startedAt: active.started_at,
      elapsedSeconds,
      currentKind,
      currentLabel,
      currentTargetType,
      currentTargetId,
      confidence,
      needsUserChoice,
      startSource: active.start_source,
      autoStarted: active.auto_started,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
