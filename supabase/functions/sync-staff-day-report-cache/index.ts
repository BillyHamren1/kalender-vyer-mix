// @ts-nocheck
/**
 * sync-staff-day-report-cache
 * ─────────────────────────────
 * Cron-driven incremental refresh.
 *
 * For each org: re-process today + yesterday for staff with
 * recent ping activity. Same write contract as backfill-staff-day-report-cache:
 * ONLY writes staff_day_report_cache.
 *
 * Body (optional):
 * {
 *   organizationId?: uuid,         // if omitted, processes all orgs
 *   engineVersion: string,         // required
 *   batchSize?: number,            // default 50 staff-days per org
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
  // EMERGENCY: cap batchSize hard (was up to 200) — avoid heavy work per cron tick.
  const batchSize = Math.max(1, Math.min(10, Number(body?.batchSize ?? 10)));

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

    for (const orgId of orgIds) {
      // Find staff with recent ping activity (last 36h). EMERGENCY: cap hard
      // at 5_000 rows of discovery; don't scan 50k staff_location_history rows.
      const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const { data: pingRows } = await admin
        .from('staff_location_history')
        .select('staff_id')
        .eq('organization_id', orgId)
        .gte('recorded_at', since)
        .order('recorded_at', { ascending: false })
        .limit(5_000);
      const seen = new Set<string>();
      for (const r of pingRows ?? []) seen.add((r as any).staff_id);
      const staffIds = Array.from(seen);
      if (staffIds.length === 0) {
        perOrg.push({ orgId, skipped: 'no_recent_pings' });
        continue;
      }

      // Only re-process staff-days where cache is missing OR clearly stale
      // (older than 2 hours). Avoids unconditional rebuild every cron tick.
      const staleCutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const { data: cacheRows } = await admin
        .from('staff_day_report_cache')
        .select('staff_id, day, updated_at')
        .eq('organization_id', orgId)
        .in('staff_id', staffIds)
        .in('day', [today, yest]);
      const fresh = new Set<string>();
      for (const c of cacheRows ?? []) {
        const u = (c as any).updated_at as string | null;
        if (u && u > staleCutoff) fresh.add(`${(c as any).staff_id}|${(c as any).day}`);
      }
      const candidates: string[] = [];
      for (const sid of staffIds) {
        if (!fresh.has(`${sid}|${today}`) || !fresh.has(`${sid}|${yest}`)) candidates.push(sid);
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
          dateFrom: yest,
          dateTo: today,
          staffIds: candidates,
          engineVersion,
          dryRun: false,
          batchSize,
          skipExisting: false,
          enablePeerEvidence: false,
        }),
      });
      const text = await r.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch {}
      perOrg.push({ orgId, status: r.status, summary: parsed ? {
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
