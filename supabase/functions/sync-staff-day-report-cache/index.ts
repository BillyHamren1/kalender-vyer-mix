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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const engineVersion = body?.engineVersion;
  if (!engineVersion) return json(400, { error: 'missing engineVersion' });
  const batchSize = Math.max(1, Math.min(200, Number(body?.batchSize ?? 200)));

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
    // Find staff with recent ping activity (last 36h). Paginate so dominant
    // staff don't crowd less-active ones out of the discovery batch.
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const seen = new Set<string>();
    {
      const PAGE = 1000;
      const CAP = 50_000; // discovery only — read just staff_id column
      let from = 0;
      while (seen.size < 1000 && from < CAP) {
        const to = from + PAGE - 1;
        const { data: batch, error } = await admin
          .from('staff_location_history')
          .select('staff_id')
          .eq('organization_id', orgId)
          .gte('recorded_at', since)
          .order('recorded_at', { ascending: false })
          .range(from, to);
        if (error) break;
        const rows = batch ?? [];
        for (const r of rows) seen.add((r as any).staff_id);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }
    const staffIds = Array.from(seen);
    if (staffIds.length === 0) {
      perOrg.push({ orgId, skipped: 'no_recent_pings' });
      continue;
    }

    // Invoke backfill via fetch (so it shares a single deployment)
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
        staffIds,
        engineVersion,
        dryRun: false,
        batchSize,
        skipExisting: false, // sync forces refresh on these 2 dates
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
    safety: {
      wroteOnlyTo: 'staff_day_report_cache',
    },
  });
});
