// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// process-day-timer-auto-stop
//
// PURPOSE: Cron-driven auto-stop för dagtimern (active_time_registrations).
//
// Detta är den ENDA edge function som auto-stoppar dagtimern baserat på
// GPS-evidence. Den får INTE:
//   • skapa eller ändra time_reports
//   • skapa eller ändra location_time_entries
//   • skapa eller ändra workdays
//   • skapa egna tidsblock / projekt-/booking-/platsregistreringar
//
// Allt den gör är att UPDATE:a active_time_registrations när evaluatorn
// säger "stop". Time Engine + adminvyn ansvarar för att bygga tidslinjen.
//
// Auth: x-cron-secret matchar CRON_SECRET, alternativt service role JWT.
// Multi-tenant: itererar per organization_id.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.170.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import {
  evaluateAutoStopForActiveDay,
  type AutoStopWorkAnchor,
  type AutoStopPing,
  type AutoStopHomeZone,
} from '../_shared/time-engine/evaluateAutoStopForActiveDay.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const MAX_CANDIDATES_PER_ORG = 50;

async function loadHomeZones(
  supabase: any,
  organizationId: string,
  staffId: string,
): Promise<AutoStopHomeZone[]> {
  const zones: AutoStopHomeZone[] = [];

  // Inferred home(s)
  const { data: homes } = await supabase
    .from('staff_inferred_home_locations')
    .select('lat, lng')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .is('valid_until', null)
    .limit(3);
  for (const h of homes || []) {
    const lat = Number(h.lat);
    const lng = Number(h.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      zones.push({ lat, lng, radiusM: 150, kind: 'inferred_home' });
    }
  }

  // Manual private zones (home / private_residence / manual_ignore / recurring_night)
  try {
    const { data: priv } = await supabase
      .from('staff_private_zones')
      .select('lat, lng, radius_m, zone_kind')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId);
    for (const p of priv || []) {
      const lat = Number(p.lat);
      const lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      zones.push({
        lat,
        lng,
        radiusM: Number.isFinite(p.radius_m) ? Number(p.radius_m) : 150,
        kind: p.zone_kind ?? 'private_residence',
      });
    }
  } catch (_) {
    // Tabellen kan saknas i vissa miljöer — ignorera.
  }

  return zones;
}

async function loadWorkAnchors(
  supabase: any,
  organizationId: string,
  staffId: string,
  sinceIso: string,
): Promise<AutoStopWorkAnchor[]> {
  const { data: lte } = await supabase
    .from('location_time_entries')
    .select(`
      entered_at, exited_at, location_id, booking_id, project_id, large_project_id,
      organization_locations(name, latitude, longitude)
    `)
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .gte('entered_at', sinceIso)
    .order('entered_at', { ascending: true })
    .limit(50);

  const anchors: AutoStopWorkAnchor[] = [];
  for (const r of lte || []) {
    const loc = (r as any).organization_locations || null;
    let kind: AutoStopWorkAnchor['kind'] = 'location';
    let targetId: string | null = r.location_id ?? null;
    if (r.large_project_id) { kind = 'large_project'; targetId = r.large_project_id; }
    else if (r.project_id) { kind = 'project'; targetId = r.project_id; }
    else if (r.booking_id) { kind = 'booking'; targetId = r.booking_id; }
    anchors.push({
      enteredAtIso: r.entered_at,
      exitedAtIso: r.exited_at ?? null,
      kind,
      targetId,
      label: loc?.name ?? null,
      lat: loc?.latitude != null ? Number(loc.latitude) : null,
      lng: loc?.longitude != null ? Number(loc.longitude) : null,
    });
  }
  return anchors;
}

async function loadPingsAfter(
  supabase: any,
  organizationId: string,
  staffId: string,
  sinceIso: string,
  untilIso: string,
): Promise<AutoStopPing[]> {
  const { data: pings } = await supabase
    .from('staff_location_history')
    .select('lat, lng, recorded_at')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .gte('recorded_at', sinceIso)
    .lte('recorded_at', untilIso)
    .order('recorded_at', { ascending: true })
    .limit(500);

  const out: AutoStopPing[] = [];
  for (const p of pings || []) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ recordedAtIso: p.recorded_at, lat, lng });
  }
  return out;
}

async function processOrganization(supabase: any, organizationId: string, nowIso: string) {
  // Plocka aktiva registreringar (status='active' OCH stopped_at null) som
  // pågått minst 60 minuter. Yngre än så lämnar vi i fred.
  const horizonIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: regs } = await supabase
    .from('active_time_registrations')
    .select('id, staff_id, started_at, status, stopped_at, start_source, metadata')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('stopped_at', null)
    .lt('started_at', horizonIso)
    .order('started_at', { ascending: true })
    .limit(MAX_CANDIDATES_PER_ORG);

  const summary = {
    candidates: regs?.length || 0,
    stopped: 0,
    rejected: 0,
    errors: 0,
    rejectedReasons: {} as Record<string, number>,
    stopSources: {} as Record<string, number>,
  };

  for (const reg of regs || []) {
    try {
      const sinceIso = reg.started_at;
      const [anchors, homeZones] = await Promise.all([
        loadWorkAnchors(supabase, organizationId, reg.staff_id, sinceIso),
        loadHomeZones(supabase, organizationId, reg.staff_id),
      ]);

      // Pings-fönster: efter sista anchor-exit (eller efter started_at om ingen exit finns).
      const lastExits = anchors
        .map(a => a.exitedAtIso)
        .filter((x): x is string => !!x)
        .sort();
      const pingSinceIso = lastExits.length > 0 ? lastExits[lastExits.length - 1] : sinceIso;
      const pings = await loadPingsAfter(supabase, organizationId, reg.staff_id, pingSinceIso, nowIso);

      const decision = evaluateAutoStopForActiveDay({
        registration: {
          id: reg.id,
          staffId: reg.staff_id,
          organizationId,
          startedAtIso: reg.started_at,
          status: reg.status,
          stoppedAtIso: reg.stopped_at,
          startSource: reg.start_source ?? null,
        },
        workAnchors: anchors,
        pingsAfterLastAnchor: pings,
        homeZones,
        nowIso,
      });

      if (!decision.stop) {
        summary.rejected++;
        const k = decision.rejectedReason;
        summary.rejectedReasons[k] = (summary.rejectedReasons[k] || 0) + 1;
        continue;
      }

      const newMetadata = {
        ...(reg.metadata || {}),
        autoStop: {
          ...decision.diagnostics,
          decidedAt: nowIso,
          source: 'process-day-timer-auto-stop',
        },
      };

      const { error } = await supabase
        .from('active_time_registrations')
        .update({
          status: 'stopped',
          stopped_at: decision.stopAtIso,
          stop_source: decision.stopSource,
          stopped_by: 'system_day_auto_stop',
          metadata: newMetadata,
          updated_at: nowIso,
        })
        .eq('id', reg.id)
        .eq('status', 'active')
        .is('stopped_at', null);

      if (error) {
        summary.errors++;
        console.error('[day-timer-auto-stop] update failed', reg.id, error.message);
        continue;
      }

      summary.stopped++;
      summary.stopSources[decision.stopSource] = (summary.stopSources[decision.stopSource] || 0) + 1;

      console.log(JSON.stringify({
        evt: 'day_timer_auto_stopped',
        registration_id: reg.id,
        staff_id: reg.staff_id,
        organization_id: organizationId,
        stop_source: decision.stopSource,
        stop_at: decision.stopAtIso,
        diagnostics: decision.diagnostics,
      }));
    } catch (e) {
      summary.errors++;
      console.error('[day-timer-auto-stop] exception', (e as Error).message);
    }
  }

  return summary;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get('CRON_SECRET');
  const headerSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('authorization') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const isServiceRole = authHeader === `Bearer ${serviceKey}` && serviceKey.length > 0;
  const isCron = cronSecret && headerSecret === cronSecret;

  if (!isCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const nowIso = new Date().toISOString();
  let body: any = {};
  try { body = await req.json(); } catch (_) { body = {}; }
  const onlyOrgId: string | null = body?.organization_id ?? null;

  let orgs: Array<{ id: string }> = [];
  if (onlyOrgId) {
    orgs = [{ id: onlyOrgId }];
  } else {
    const { data } = await supabase.from('organizations').select('id');
    orgs = data || [];
  }

  const perOrg: Record<string, any> = {};
  let totals = { stopped: 0, rejected: 0, errors: 0, candidates: 0 };
  for (const o of orgs) {
    try {
      const r = await processOrganization(supabase, o.id, nowIso);
      perOrg[o.id] = r;
      totals.stopped += r.stopped;
      totals.rejected += r.rejected;
      totals.errors += r.errors;
      totals.candidates += r.candidates;
    } catch (e) {
      perOrg[o.id] = { error: (e as Error).message };
    }
  }

  return new Response(JSON.stringify({ ok: true, now: nowIso, totals, perOrg }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
