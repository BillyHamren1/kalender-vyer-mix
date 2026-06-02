// @ts-nocheck
/**
 * sync-staff-day-report-cache
 * ─────────────────────────────
 * Cron-driven incremental refresh.
 *
 * For each org: re-process today (+ yesterday unless mode='today') for staff
 * with recent ping activity. Same write contract as backfill-staff-day-report-cache:
 * ONLY writes staff_day_report_cache.
 *
 * Body (optional):
 * {
 *   organizationId?: uuid,         // if omitted, processes all orgs
 *   engineVersion: string,         // required
 *   batchSize?: number,            // default 50, hard cap 100
 *   mode?: 'today' | 'today_and_yesterday',  // default 'today_and_yesterday'
 *   staffIds?: string[],           // optional override (bypass ping discovery)
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (s: number, b: any) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Process-wide guard to prevent overlapping cron runs in the same isolate.
let RUN_IN_PROGRESS = false;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const engineVersion = body?.engineVersion;
  if (!engineVersion) return json(400, { error: 'missing engineVersion' });
  // EMERGENCY cap raised from 10 → 100. Today-only ticks need to cover all
  // active staff in one pass to keep cache aligned with GPS-satelliten.
  const batchSize = Math.max(1, Math.min(100, Number(body?.batchSize ?? 50)));
  const mode: 'today' | 'today_and_yesterday' =
    body?.mode === 'today' ? 'today' : 'today_and_yesterday';
  const requestedStaffIds: string[] | null =
    Array.isArray(body?.staffIds) && body.staffIds.length ? body.staffIds : null;

  if (RUN_IN_PROGRESS) {
    return json(200, { ok: true, skipped: 'already_running' });
  }
  RUN_IN_PROGRESS = true;

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Resolve org list
    let orgIds: string[] = [];
    if (body?.organizationId) {
      orgIds = [body.organizationId];
    } else {
      const { data } = await admin.from('organizations').select('id').limit(100);
      orgIds = (data ?? []).map((o: any) => o.id);
    }

    const today = ymd(new Date());
    const yest = ymd(new Date(Date.now() - 86400000));

    const perOrg: any[] = [];

    // Datumfönster: today-only för täta tick (5–10 min), today+yesterday för
    // den långsammare hourly-sweep:en.
    const dates = mode === 'today' ? [today] : [today, yest];
    const dateFromSweep = dates[dates.length - 1]; // äldsta
    const dateToSweep = dates[0];                  // nyaste

    for (const orgId of orgIds) {
      // Bestäm staff-kandidater.
      let staffIds: string[];
      if (requestedStaffIds) {
        // Explicit override (manuell körning för t.ex. en specifik person).
        staffIds = requestedStaffIds;
      } else {
        // Hitta personal med ping-aktivitet senaste 12h (today-only mode)
        // resp. 36h (today+yesterday). Hård cap på discovery-läsning.
        const lookbackHours = mode === 'today' ? 12 : 36;
        const since = new Date(Date.now() - lookbackHours * 3600 * 1000).toISOString();
        const { data: pingRows } = await admin
          .from('staff_location_history')
          .select('staff_id')
          .eq('organization_id', orgId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: false })
          .limit(5_000);
        const seen = new Set<string>();
        for (const r of pingRows ?? []) seen.add((r as any).staff_id);
        staffIds = Array.from(seen);
      }
      if (staffIds.length === 0) {
        perOrg.push({ orgId, skipped: 'no_recent_pings' });
        continue;
      }

      // Freshness-gate: hoppa över (staff,date) som har cache yngre än 5 min
      // (today-only mode) resp. 2h (today+yesterday). FIX: kolumnen heter `date`,
      // inte `day` — den gamla buggen gjorde gaten värdelös.
      const freshCutoffMs = mode === 'today' ? 5 * 60 * 1000 : 2 * 3600 * 1000;
      const staleCutoff = new Date(Date.now() - freshCutoffMs).toISOString();
      const { data: cacheRows, error: cacheErr } = await admin
        .from('staff_day_report_cache')
        .select('staff_id, date, updated_at')
        .eq('organization_id', orgId)
        .in('staff_id', staffIds)
        .in('date', dates);
      if (cacheErr) {
        // Tysta inte — logga, men fortsätt (tom fresh-set = bygg allt).
        console.warn('[sync-staff-day-report-cache] freshness query failed', cacheErr);
      }
      const fresh = new Set<string>();
      for (const c of cacheRows ?? []) {
        const u = (c as any).updated_at as string | null;
        if (u && u > staleCutoff) fresh.add(`${(c as any).staff_id}|${(c as any).date}`);
      }
      const candidates: string[] = [];
      for (const sid of staffIds) {
        const allFresh = dates.every((d) => fresh.has(`${sid}|${d}`));
        if (!allFresh) candidates.push(sid);
        if (candidates.length >= batchSize) break;
      }
      if (candidates.length === 0) {
        perOrg.push({ orgId, skipped: 'all_fresh' });
        continue;
      }

      const url = `${SUPABASE_URL}/functions/v1/backfill-staff-day-report-cache`;
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          organizationId: orgId,
          dateFrom: dateFromSweep,
          dateTo: dateToSweep,
          staffIds: candidates,
          engineVersion,
          dryRun: false,
          // backfill caps at 200 internally; dimensionera så hela kandidat-
          // listan får plats i ett anrop när vi kör today-only.
          batchSize: Math.max(candidates.length * dates.length, batchSize),
          skipExisting: false,
          enablePeerEvidence: false,
        }),
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      perOrg.push({ orgId, mode, dates, candidateStaff: candidates.length, status: r.status, summary: parsed ? {
        processed: parsed.staffDaysProcessedThisCall,
        errors: parsed.staffDaysWithErrors,
        runtimeMs: parsed.runtimeMs,
      } : null });
    }

    return json(200, {
      ok: true,
      engineVersion,
      today,
      yesterday: yest,
      perOrg,
      safety: { wroteOnlyTo: 'staff_day_report_cache' },
    });
  } finally {
    RUN_IN_PROGRESS = false;
  }
});
