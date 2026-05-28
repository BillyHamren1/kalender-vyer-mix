// backfill-cache-canonical
// Lean writer: kör ENDAST canonical GPS-day → staff_day_report_cache.
// Skiljer sig från backfill-staff-day-report-cache som även kör hela legacy
// Time Engine och lätt slår i WORKER_RESOURCE_LIMIT.
//
// POST {
//   organizationId: string,
//   dateFrom: 'YYYY-MM-DD',
//   dateTo:   'YYYY-MM-DD',
//   staffIds?: string[],
//   engineVersion?: string,   // default 'canonical_mirror_v1'
//   forceRefresh?: boolean,
// }

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { buildCanonicalStaffDayGpsResult } from '../_shared/staff-gps/canonicalStaffDayGpsResult.ts';
import {
  canonicalToCacheBlocks,
  canonicalToCacheSummary,
} from '../_shared/staff-gps/canonicalToCacheProjection.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function* dateRange(fromIso: string, toIso: string): Generator<string> {
  const start = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}

async function processOne(
  admin: SupabaseClient,
  organizationId: string,
  staffId: string,
  date: string,
  engineVersion: string,
  forceRefresh: boolean,
): Promise<{ staffId: string; date: string; ok: boolean; payable?: number; error?: string }> {
  try {
    const canonical = await buildCanonicalStaffDayGpsResult(admin, {
      organizationId, staffId, date, forceRefresh,
    });
    const summary = canonicalToCacheSummary(canonical);
    const blocks = canonicalToCacheBlocks(canonical);

    const { error } = await admin
      .from('staff_day_report_cache')
      .upsert(
        {
          organization_id: organizationId,
          staff_id: staffId,
          date,
          engine_version: engineVersion,
          summary_json: summary as any,
          report_candidate_blocks_json: blocks as any,
          display_blocks_json: blocks as any,
          diagnostics_json: {
            source: 'backfill-cache-canonical',
            canonicalVersion: canonical.version,
            segmentCount: canonical.segments.length,
            totals: canonical.totals,
          } as any,
          built_at: new Date().toISOString(),
          stale: false,
          error: null,
        } as any,
        { onConflict: 'organization_id,staff_id,date,engine_version' } as any,
      );
    if (error) throw error;
    return { staffId, date, ok: true, payable: summary.payableMinutes };
  } catch (e: any) {
    return { staffId, date, ok: false, error: e?.message ?? String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const organizationId = body.organizationId as string | undefined;
  const dateFrom = body.dateFrom as string | undefined;
  const dateTo = body.dateTo as string | undefined;
  const staffIds = (body.staffIds as string[] | undefined) ?? null;
  const engineVersion = (body.engineVersion as string | undefined) ?? 'canonical_mirror_v1';
  const forceRefresh = Boolean(body.forceRefresh);

  if (!organizationId || !dateFrom || !dateTo) {
    return new Response(
      JSON.stringify({ error: 'missing_required', required: ['organizationId', 'dateFrom', 'dateTo'] }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Resolve staff
  let resolvedStaff: string[] = [];
  if (staffIds && staffIds.length > 0) {
    resolvedStaff = staffIds;
  } else {
    const { data, error } = await admin
      .from('staff_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    if (error) {
      return new Response(JSON.stringify({ error: 'staff_query_failed', detail: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    resolvedStaff = (data ?? []).map((r: any) => String(r.id));
  }

  const dates = Array.from(dateRange(dateFrom, dateTo));
  const results: any[] = [];
  let okCount = 0;
  let errCount = 0;

  // Serial loop to stay under worker memory/cpu limits.
  for (const sid of resolvedStaff) {
    for (const d of dates) {
      const r = await processOne(admin, organizationId, sid, d, engineVersion, forceRefresh);
      results.push(r);
      if (r.ok) okCount++; else errCount++;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      engineVersion,
      organizationId,
      dateFrom, dateTo,
      staffCount: resolvedStaff.length,
      dateCount: dates.length,
      processed: results.length,
      okCount,
      errCount,
      results,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
