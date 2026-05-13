// @ts-nocheck
/**
 * infer-home-location
 * ───────────────────
 * Daily cron that silently learns where each staff member sleeps so the
 * client can suggest "end-of-day" when they arrive there from a workplace.
 *
 * Pipeline:
 *   1. For each org, scan staff_location_history pings between 02:00-05:00
 *      local (Europe/Stockholm) for the past 14 days.
 *   2. Snap each ping to a ~100m grid → cluster_key.
 *   3. Per (staff, observed_date), keep the dominant cluster (most pings)
 *      and upsert into staff_home_observations.
 *   4. For each staff, look at the last 14 observations:
 *        • Same cluster on ≥ 2 consecutive nights → upsert as 'primary'.
 *        • A non-primary cluster on ≥ 2 consecutive nights → upsert as
 *          'temporary' with rolling valid_until = last_observed + 2 days.
 *        • Returning to primary expires temporary (valid_until = now).
 *   5. Prune observations older than 30 days.
 *
 * Idempotent: uses unique (staff_id, kind, cluster_key) and
 * (staff_id, observed_date, cluster_key).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Grid snap: ~111 m at the equator. 0.001 deg ≈ 111 m latitude.
const GRID_DEG = 0.001;
const NIGHT_START_HOUR = 2;
const NIGHT_END_HOUR = 5;
const LOOKBACK_DAYS = 14;
const RETENTION_DAYS = 30;
const HOME_RADIUS_M = 150;

function snapKey(lat: number, lng: number): { key: string; lat: number; lng: number } {
  const sLat = Math.round(lat / GRID_DEG) * GRID_DEG;
  const sLng = Math.round(lng / GRID_DEG) * GRID_DEG;
  return { key: `${sLat.toFixed(4)}:${sLng.toFixed(4)}`, lat: sLat, lng: sLng };
}

// Haversine in meters.
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface WorkExclusion {
  org: string;
  lat: number;
  lng: number;
  radiusM: number;
  name: string;
}

/**
 * People do not live at the warehouse / office. Any cluster that lands
 * inside an active org-location radius (excluding `private_residence`
 * which IS a home) must be excluded from home inference.
 */
function isInsideWorkExclusion(
  org: string,
  lat: number,
  lng: number,
  exclusions: WorkExclusion[],
): WorkExclusion | null {
  for (const ex of exclusions) {
    if (ex.org !== org) continue;
    if (distanceM(lat, lng, ex.lat, ex.lng) < ex.radiusM + 50) return ex;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const startedAt = Date.now();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  let pingsScanned = 0;
  let observationsWritten = 0;
  let primariesUpserted = 0;
  let temporariesUpserted = 0;
  let temporariesExpired = 0;

  // Reuse Intl formatters across all rows — instantiating per-row is the
  // single biggest CPU cost (was killing the worker on 60k pings).
  const hourFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false,
  });
  const dateFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
  });

  try {
    // 1+2. Pull night pings (cursor pagination on recorded_at to bypass
    // Supabase's 1000-row response cap; previous range()-loop silently
    // stopped after the first 1000 rows).
    const buckets = new Map<string, { staff_id: string; org: string; date: string; key: string; lat: number; lng: number; count: number }>();

    const PAGE = 1000;
    let cursor = since;
    while (true) {
      const { data: rows, error } = await supabase
        .from('staff_location_history')
        .select('staff_id, organization_id, lat, lng, recorded_at')
        .gte('recorded_at', cursor)
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .order('recorded_at', { ascending: true })
        .limit(PAGE);

      if (error) {
        console.error('[infer-home] scan failed:', error);
        break;
      }
      if (!rows || rows.length === 0) break;
      pingsScanned += rows.length;

      for (const r of rows) {
        const ts = new Date(r.recorded_at);
        const hour = parseInt(hourFmt.format(ts), 10);
        if (hour < NIGHT_START_HOUR || hour >= NIGHT_END_HOUR) continue;
        const dateStr = dateFmt.format(ts);

        const snap = snapKey(r.lat as number, r.lng as number);
        const bucketKey = `${r.staff_id}|${dateStr}|${snap.key}`;
        const entry = buckets.get(bucketKey);
        if (entry) {
          entry.count++;
        } else {
          buckets.set(bucketKey, {
            staff_id: r.staff_id,
            org: r.organization_id,
            date: dateStr,
            key: snap.key,
            lat: snap.lat,
            lng: snap.lng,
            count: 1,
          });
        }
      }

      if (rows.length < PAGE) break;
      const lastTs = new Date(rows[rows.length - 1].recorded_at).getTime();
      cursor = new Date(lastTs + 1).toISOString();
    }

    // 3. Per (staff, date) keep dominant cluster, then BATCH-upsert.
    const dominant = new Map<string, any>();
    for (const b of buckets.values()) {
      const k = `${b.staff_id}|${b.date}`;
      const cur = dominant.get(k);
      if (!cur || b.count > cur.count) dominant.set(k, b);
    }

    const obsRows = Array.from(dominant.values()).map((b) => ({
      staff_id: b.staff_id,
      organization_id: b.org,
      observed_date: b.date,
      lat: b.lat,
      lng: b.lng,
      cluster_key: b.key,
      dwell_minutes: b.count,
    }));

    for (let i = 0; i < obsRows.length; i += 500) {
      const slice = obsRows.slice(i, i + 500);
      const { error } = await supabase
        .from('staff_home_observations')
        .upsert(slice, { onConflict: 'staff_id,observed_date,cluster_key' });
      if (!error) observationsWritten += slice.length;
    }

    // 4. For each staff with fresh observations, derive home rows.
    const staffIds = new Set<string>();
    for (const b of dominant.values()) staffIds.add(b.staff_id);

    for (const staffId of staffIds) {
      const { data: obs } = await supabase
        .from('staff_home_observations')
        .select('observed_date, cluster_key, lat, lng, organization_id')
        .eq('staff_id', staffId)
        .order('observed_date', { ascending: false })
        .limit(LOOKBACK_DAYS);

      if (!obs || obs.length === 0) continue;

      const runs = new Map<string, { count: number; lat: number; lng: number; org: string; lastDate: string }>();
      let prevDate: string | null = null;
      let prevKey: string | null = null;
      let runCount = 0;

      for (const o of obs) {
        if (prevKey === o.cluster_key && prevDate) {
          const d1 = new Date(prevDate);
          const d2 = new Date(o.observed_date);
          const diffDays = Math.round((d1.getTime() - d2.getTime()) / 86400000);
          if (diffDays === 1) {
            runCount++;
          } else {
            runCount = 1;
          }
        } else {
          runCount = 1;
        }
        const existing = runs.get(o.cluster_key);
        if (!existing || runCount > existing.count) {
          runs.set(o.cluster_key, {
            count: runCount,
            lat: o.lat as number,
            lng: o.lng as number,
            org: o.organization_id as string,
            lastDate: obs[0].observed_date as string,
          });
        }
        prevKey = o.cluster_key;
        prevDate = o.observed_date as string;
      }

      let primary: { key: string; data: any } | null = null;
      for (const [key, data] of runs.entries()) {
        if (!primary || data.count > primary.data.count) {
          primary = { key, data };
        }
      }
      if (!primary || primary.data.count < 2) continue;

      const { error: pErr } = await supabase
        .from('staff_inferred_home_locations')
        .upsert(
          {
            staff_id: staffId,
            organization_id: primary.data.org,
            lat: primary.data.lat,
            lng: primary.data.lng,
            radius_m: HOME_RADIUS_M,
            kind: 'primary',
            cluster_key: primary.key,
            valid_from: new Date(Date.now() - primary.data.count * 86400000).toISOString(),
            valid_until: null,
            confidence: Math.min(1, primary.data.count / 7),
            nights_observed: primary.data.count,
            last_observed_at: new Date().toISOString(),
          },
          { onConflict: 'staff_id,kind,cluster_key' },
        );
      if (!pErr) primariesUpserted++;

      const newestKey = obs[0].cluster_key;
      if (newestKey !== primary.key) {
        const tempRun = runs.get(newestKey);
        if (tempRun && tempRun.count >= 2) {
          const validUntil = new Date(Date.now() + 2 * 86400000).toISOString();
          const { error: tErr } = await supabase
            .from('staff_inferred_home_locations')
            .upsert(
              {
                staff_id: staffId,
                organization_id: tempRun.org,
                lat: tempRun.lat,
                lng: tempRun.lng,
                radius_m: HOME_RADIUS_M,
                kind: 'temporary',
                cluster_key: newestKey,
                valid_from: new Date(Date.now() - tempRun.count * 86400000).toISOString(),
                valid_until: validUntil,
                confidence: Math.min(1, tempRun.count / 5),
                nights_observed: tempRun.count,
                last_observed_at: new Date().toISOString(),
              },
              { onConflict: 'staff_id,kind,cluster_key' },
            );
          if (!tErr) temporariesUpserted++;
        }
      } else {
        const { data: expired } = await supabase
          .from('staff_inferred_home_locations')
          .update({ valid_until: new Date().toISOString() })
          .eq('staff_id', staffId)
          .eq('kind', 'temporary')
          .or('valid_until.is.null,valid_until.gt.' + new Date().toISOString())
          .select('id');
        if (expired) temporariesExpired += expired.length;
      }
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    await supabase.from('staff_home_observations').delete().lt('observed_date', cutoff);

    return new Response(
      JSON.stringify({
        success: true,
        ms: Date.now() - startedAt,
        pings_scanned: pingsScanned,
        observations_written: observationsWritten,
        primaries_upserted: primariesUpserted,
        temporaries_upserted: temporariesUpserted,
        temporaries_expired: temporariesExpired,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[infer-home] fatal:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
