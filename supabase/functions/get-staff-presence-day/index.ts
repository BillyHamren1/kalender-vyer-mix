// @ts-nocheck
/**
 * get-staff-presence-day
 * ──────────────────────
 * Returns full-day presence timeline for a single staff member.
 *
 * Inputs (POST body):
 *   - staffId    (required)
 *   - date       (YYYY-MM-DD; defaults to today)
 *   - organizationId (required if caller is service-role)
 *
 * Reads ONLY:
 *   - staff_members
 *   - staff_presence_events           (arrival/departure/signal_lost/signal_resumed)
 *   - staff_location_history          (last ping + GPS timeline source)
 *   - active_time_registrations       (active_timer_started/stopped events)
 *   - organization_locations / projects / large_projects (target resolution)
 *
 * NEVER writes anything. NEVER reads workdays/time_reports/LTE/travel.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  buildGpsDayTimeline,
  type GpsPing,
} from '../_shared/time-engine/buildGpsDayTimeline.ts';
import {
  resolveWorkTargets,
  toWorkTarget,
} from '../_shared/time-engine/resolveWorkTargets.ts';
import type { WorkTarget } from '../_shared/time-engine/contracts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SIGNAL_LIVE_SEC = 120;
const SIGNAL_RECENT_SEC = 600;
const SIGNAL_STALE_SEC = 3600;

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function classifySignal(ageSec: number | null) {
  if (ageSec == null) return 'no_signal';
  if (ageSec < SIGNAL_LIVE_SEC) return 'live';
  if (ageSec < SIGNAL_RECENT_SEC) return 'recent';
  if (ageSec < SIGNAL_STALE_SEC) return 'stale';
  return 'no_signal';
}

interface TimelineRow {
  at: string;
  type:
    | 'arrival'
    | 'departure'
    | 'signal_lost'
    | 'signal_resumed'
    | 'transport'
    | 'unknown_place'
    | 'gps_gap'
    | 'active_timer_started'
    | 'active_timer_stopped';
  label: string;
  targetType?: string | null;
  targetId?: string | null;
  confidence?: number | null;
  source: string;
  gpsSegmentId?: string | null;
  endAt?: string | null;
  durationMin?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
  // ── Auth ──
  const authHeader = req.headers.get('authorization') ?? '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!bearer) return json(401, { ok: false, error: 'unauthorized' });

  const okSvc = SERVICE_ROLE.length > 0 && bearer === SERVICE_ROLE;
  let userOrgId: string | null = null;
  if (!okSvc) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false },
      });
      const { data, error } = await userClient.auth.getUser();
      if (error || !data?.user) return json(401, { ok: false, error: 'unauthorized' });
      const { data: prof } = await userClient
        .from('profiles')
        .select('organization_id')
        .eq('user_id', data.user.id)
        .maybeSingle();
      userOrgId = prof?.organization_id ?? null;
    } catch {
      return json(401, { ok: false, error: 'unauthorized' });
    }
    if (!userOrgId) return json(403, { ok: false, error: 'no_org' });
  }

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const staffId: string | null = body?.staffId ?? null;
  const date: string = body?.date || new Date().toISOString().slice(0, 10);
  const orgId: string | null = okSvc ? (body?.organizationId ?? null) : userOrgId;

  if (!staffId) return json(400, { ok: false, error: 'staffId_required' });
  if (!orgId) return json(400, { ok: false, error: 'organizationId_required' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // ── Staff ──
  const { data: staff } = await admin
    .from('staff_members')
    .select('id, name, organization_id')
    .eq('id', staffId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!staff) return json(404, { ok: false, error: 'staff_not_found' });

  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  // ── Presence events (arrival/departure/signal_lost/signal_resumed) ──
  const { data: presenceRows } = await admin
    .from('staff_presence_events')
    .select('event_at, event_type, target_type, target_id, target_label, source, confidence, gps_segment_id, metadata')
    .eq('organization_id', orgId)
    .eq('staff_id', staffId)
    .gte('event_at', dayStart)
    .lte('event_at', dayEnd)
    .order('event_at', { ascending: true });

  const timeline: TimelineRow[] = [];

  for (const r of presenceRows ?? []) {
    timeline.push({
      at: r.event_at,
      type: r.event_type,
      label: r.target_label ?? (r.event_type === 'signal_lost' ? 'GPS-signal saknas' : r.event_type === 'signal_resumed' ? 'GPS-signal åter' : 'Okänd plats'),
      targetType: r.target_type,
      targetId: r.target_id,
      confidence: r.confidence,
      source: r.source ?? 'staff_presence_events',
      gpsSegmentId: r.gps_segment_id,
    });
  }

  // ── Active timers (started/stopped) ──
  const { data: timers, error: timersErr } = await admin
    .from('active_time_registrations')
    .select('id, started_at, stopped_at, status, stop_source, metadata, start_target_type, start_target_id, start_target_label, current_label, current_target_type, current_target_id, start_source, auto_started')
    .eq('organization_id', orgId)
    .eq('staff_id', staffId)
    .or(`started_at.gte.${dayStart},stopped_at.gte.${dayStart}`)
    .order('started_at', { ascending: true });
  if (timersErr) console.error('[presence-day] timers err', timersErr);

  let hasActiveTimer = false;
  let activeTimerInfo: any = null;

  for (const t of timers ?? []) {
    const meta = (t.metadata as any) ?? {};
    const evidence = meta.evidence ?? {};
    const targetType = t.current_target_type ?? t.start_target_type ?? null;
    const targetId = t.current_target_id ?? t.start_target_id ?? null;
    const label = t.current_label ?? t.start_target_label ?? targetType ?? 'Aktivitet';
    if (t.started_at && t.started_at >= dayStart && t.started_at <= dayEnd) {
      timeline.push({
        at: t.started_at,
        type: 'active_timer_started',
        label: `Timer startad (${label})`,
        targetType,
        targetId,
        confidence: null,
        source: t.start_source ?? evidence.engine ?? 'time-engine',
        gpsSegmentId: evidence.segmentId ?? null,
      });
    }
    if (t.stopped_at && t.stopped_at >= dayStart && t.stopped_at <= dayEnd) {
      timeline.push({
        at: t.stopped_at,
        type: 'active_timer_stopped',
        label: `Timer stoppad (${t.stop_source ?? 'okänd'})`,
        targetType,
        targetId,
        confidence: null,
        source: t.stop_source ?? 'unknown',
      });
    }
    if (!t.stopped_at && t.status === 'active') {
      hasActiveTimer = true;
      activeTimerInfo = {
        id: t.id,
        startedAt: t.started_at,
        label,
        targetType,
        targetId,
      };
    }
  }

  // ── GPS day timeline (transport / unknown_place / gps_gap) ──
  const { data: pingRows } = await admin
    .from('staff_location_history')
    .select('lat, lng, accuracy, speed, recorded_at')
    .eq('organization_id', orgId)
    .eq('staff_id', staffId)
    .gte('recorded_at', dayStart)
    .lte('recorded_at', dayEnd)
    .order('recorded_at', { ascending: true })
    .limit(5000);

  const pings: GpsPing[] = (pingRows ?? []).map((p: any) => ({
    ts: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
    speedMps: p.speed != null ? Number(p.speed) : null,
  }));

  let lastPingAt: string | null = null;
  let lastPing: any = null;
  if (pings.length > 0) {
    lastPing = pings[pings.length - 1];
    lastPingAt = lastPing.ts;
  } else {
    // Fallback: most recent ping ever
    const { data: lp } = await admin
      .from('staff_location_history')
      .select('recorded_at')
      .eq('organization_id', orgId)
      .eq('staff_id', staffId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    lastPingAt = lp?.recorded_at ?? null;
  }

  try {
    const { targets: resolved } = await resolveWorkTargets({
      organizationId: orgId,
      staffId,
      date,
      supabaseAdmin: admin,
    });
    const workTargets: WorkTarget[] = resolved
      .map(toWorkTarget)
      .filter((t): t is WorkTarget => !!t);

    const gpsTimeline = buildGpsDayTimeline({
      staffId,
      organizationId: orgId,
      date,
      pings,
      targets: workTargets,
    });

    for (const seg of gpsTimeline.segments) {
      let type: TimelineRow['type'] | null = null;
      let label = seg.label ?? '';
      if (seg.kind === 'travel' || seg.type === 'transport') {
        type = 'transport';
        label = 'Transport';
      } else if (seg.kind === 'gps_gap' || seg.type === 'gps_gap') {
        type = 'gps_gap';
        label = 'GPS-glapp';
      } else if (seg.type === 'unknown_place') {
        type = 'unknown_place';
        label = seg.label ?? 'Okänd plats';
      }
      if (!type) continue;
      timeline.push({
        at: seg.startTs,
        endAt: seg.endTs,
        durationMin: seg.durationMin ?? null,
        type,
        label,
        confidence: null,
        source: 'gps_day_timeline',
        gpsSegmentId: seg.id,
      });
    }
  } catch (e) {
    // Ignore — timeline still has presence_events + timer events
  }

  // ── Sort timeline ──
  timeline.sort((a, b) => a.at.localeCompare(b.at));

  // ── Header summary ──
  const ageSec = lastPingAt
    ? Math.floor((Date.now() - new Date(lastPingAt).getTime()) / 1000)
    : null;
  const signal = classifySignal(ageSec);

  // Current status: latest arrival without later departure
  let currentLabel = 'Okänt';
  let currentTargetType: string | null = null;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const ev = timeline[i];
    if (ev.type === 'arrival') {
      currentLabel = ev.label;
      currentTargetType = ev.targetType ?? null;
      break;
    }
    if (ev.type === 'departure') {
      currentLabel = `Lämnade ${ev.label}`;
      break;
    }
  }
  if (signal === 'no_signal') currentLabel = 'Signal saknas';

  return json(200, {
    ok: true,
    staff: { id: staff.id, name: staff.name },
    date,
    summary: {
      lastPingAt,
      pingAgeSec: ageSec,
      signal,
      hasActiveTimer,
      activeTimer: activeTimerInfo,
      currentLabel,
      currentTargetType,
    },
    timeline,
    counts: {
      total: timeline.length,
      presenceEvents: (presenceRows ?? []).length,
      timerEvents: timeline.filter((t) => t.type.startsWith('active_timer_')).length,
      gpsSegments: timeline.filter((t) =>
        ['transport', 'unknown_place', 'gps_gap'].includes(t.type),
      ).length,
    },
  });
});
