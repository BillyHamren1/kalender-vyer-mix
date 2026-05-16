// READ-ONLY: Raw staff GPS pings debug.
// Reads ONLY staff_location_history. No Day Evidence / Location Truth /
// Workday Allocation / Display Timeline / Gantt / assignments / targets /
// booking / project logic. Writes nothing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getStockholmDayWindowUtc } from '../_shared/stockholmDayWindow.ts';

interface Body {
  organizationId: string;
  date?: string;
  startAt?: string;
  endAt?: string;
  staffIds?: string[];
  includeRows?: boolean;
  maxRowsPerStaff?: number;
}

interface PingRow {
  id: string;
  staff_id: string;
  organization_id: string;
  recorded_at: string;
  created_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  speed: number | null;
  time_report_id: string | null;
  battery_level: number | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  battery_captured_at: string | null;
  battery_source: string | null;
}

// ── Battery diagnostics (Deno port; mirrors src/lib/staff/batteryDiagnostics.ts) ──
const LOW_BATTERY_THRESHOLD_PERCENT = 10;
const SIGNAL_LOSS_GAP_AFTER_LOW_MS = 30 * 60_000;
const FAST_DROP_TOTAL_PP = 30;
const FAST_DROP_WINDOW_MS = 60 * 60_000;
const FAST_DROP_WINDOW_PP = 15;

function coerceBatteryPercent(level: number | null, percent: number | null): number | null {
  if (typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100) {
    return Math.round(percent);
  }
  if (typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 1) {
    return Math.round(level * 100);
  }
  return null;
}

interface BatteryStats {
  firstBatteryPercent: number | null;
  lastBatteryPercent: number | null;
  minBatteryPercent: number | null;
  maxBatteryPercent: number | null;
  latestIsCharging: boolean | null;
  batterySamplesCount: number;
  missingBatterySamplesCount: number;
  batteryDroppedFast: boolean;
  likelyBatteryRelatedSignalLoss: boolean;
}

function emptyBattery(): BatteryStats {
  return {
    firstBatteryPercent: null, lastBatteryPercent: null,
    minBatteryPercent: null, maxBatteryPercent: null,
    latestIsCharging: null,
    batterySamplesCount: 0, missingBatterySamplesCount: 0,
    batteryDroppedFast: false, likelyBatteryRelatedSignalLoss: false,
  };
}

function computeBatteryStats(list: PingRow[], intervalEndMs: number): BatteryStats {
  if (list.length === 0) return emptyBattery();
  type S = { ts: number; pct: number; charging: boolean | null };
  const samples: S[] = [];
  let missing = 0;
  let latestIsCharging: boolean | null = null;
  for (const p of list) {
    const ts = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(ts)) { missing++; continue; }
    const pct = coerceBatteryPercent(p.battery_level, p.battery_percent);
    const charging = typeof p.is_charging === 'boolean' ? p.is_charging : null;
    if (pct === null) { missing++; continue; }
    samples.push({ ts, pct, charging });
    if (charging !== null) latestIsCharging = charging;
  }
  if (samples.length === 0) return { ...emptyBattery(), missingBatterySamplesCount: missing };
  samples.sort((a, b) => a.ts - b.ts);
  const first = samples[0];
  const last = samples[samples.length - 1];
  let minPct = first.pct, maxPct = first.pct;
  for (const s of samples) {
    if (s.pct < minPct) minPct = s.pct;
    if (s.pct > maxPct) maxPct = s.pct;
  }
  let batteryDroppedFast = (first.pct - last.pct) > FAST_DROP_TOTAL_PP;
  if (!batteryDroppedFast) {
    let left = 0;
    for (let right = 0; right < samples.length; right++) {
      while (samples[right].ts - samples[left].ts > FAST_DROP_WINDOW_MS) left++;
      let winMax = samples[left].pct, winMin = samples[left].pct;
      for (let i = left; i <= right; i++) {
        if (samples[i].pct > winMax) winMax = samples[i].pct;
        if (samples[i].pct < winMin) winMin = samples[i].pct;
      }
      if (winMax - winMin > FAST_DROP_WINDOW_PP) { batteryDroppedFast = true; break; }
    }
  }
  let likelyBatteryRelatedSignalLoss = false;
  if (last.pct <= LOW_BATTERY_THRESHOLD_PERCENT) {
    if (intervalEndMs - last.ts >= SIGNAL_LOSS_GAP_AFTER_LOW_MS) likelyBatteryRelatedSignalLoss = true;
  }
  if (last.charging !== null) latestIsCharging = last.charging;
  return {
    firstBatteryPercent: first.pct,
    lastBatteryPercent: last.pct,
    minBatteryPercent: minPct,
    maxBatteryPercent: maxPct,
    latestIsCharging,
    batterySamplesCount: samples.length,
    missingBatterySamplesCount: missing,
    batteryDroppedFast,
    likelyBatteryRelatedSignalLoss,
  };
}

const PAGE_SIZE = 1000;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (req.method === 'POST' ? await req.json().catch(() => ({})) : {}) as Body;
    const organizationId = body.organizationId;
    if (!organizationId) {
      return json({ error: 'organizationId required' }, 400);
    }

    const warnings: string[] = [];
    let intervalStart: string;
    let intervalEnd: string;
    let timezoneUsed: string;

    if (body.startAt && body.endAt) {
      intervalStart = new Date(body.startAt).toISOString();
      intervalEnd = new Date(body.endAt).toISOString();
      timezoneUsed = 'explicit_interval_utc';
    } else if (body.date) {
      const w = getStockholmDayWindowUtc(body.date);
      intervalStart = w.startUtc;
      intervalEnd = w.endUtc;
      timezoneUsed = 'Europe/Stockholm';
    } else {
      const now = Date.now();
      intervalStart = new Date(now - 24 * 3600_000).toISOString();
      intervalEnd = new Date(now).toISOString();
      timezoneUsed = 'utc_last_24h_default';
      warnings.push('no_date_or_interval_supplied_defaulted_to_last_24h');
    }

    const includeRows = body.includeRows === true;
    const maxRowsPerStaff = Math.max(1, Math.min(2000, body.maxRowsPerStaff ?? 200));

    // Auth: require a user session in the same org. Mirrors other admin debug fns
    // by using service-role client for the read but verifying caller identity.
    const auth = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return json({ error: 'unauthorized' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Confirm caller belongs to organization (any role).
    const { data: membership } = await admin
      .from('user_roles')
      .select('organization_id')
      .eq('user_id', userRes.user.id)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return json({ error: 'forbidden_for_organization' }, 403);
    }

    // Page through all pings in window.
    const rows: PingRow[] = [];
    let from = 0;
    let pages = 0;
    let truncated = false;
    const HARD_CAP = 50_000;

    while (true) {
      let q = admin
        .from('staff_location_history')
        .select('id, staff_id, organization_id, recorded_at, created_at, lat, lng, accuracy, speed, time_report_id, battery_level, battery_percent, is_charging, battery_captured_at, battery_source')
        .eq('organization_id', organizationId)
        .gte('recorded_at', intervalStart)
        .lte('recorded_at', intervalEnd)
        .order('recorded_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (body.staffIds && body.staffIds.length > 0) {
        q = q.in('staff_id', body.staffIds);
      }
      const { data, error } = await q;
      if (error) {
        return json({ error: 'query_failed', details: error.message }, 500);
      }
      const batch = (data ?? []) as PingRow[];
      rows.push(...batch);
      pages++;
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (rows.length >= HARD_CAP) {
        truncated = true;
        warnings.push(`row_hard_cap_${HARD_CAP}_reached`);
        break;
      }
    }

    // Group by staff_id.
    const byStaff = new Map<string, PingRow[]>();
    for (const r of rows) {
      const list = byStaff.get(r.staff_id) ?? [];
      list.push(r);
      byStaff.set(r.staff_id, list);
    }

    // Resolve names (best-effort, no fail).
    const staffIds = [...byStaff.keys()];
    const nameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: members } = await admin
        .from('staff_members')
        .select('id, name')
        .eq('organization_id', organizationId)
        .in('id', staffIds);
      for (const m of (members ?? []) as Array<{ id: string; name: string | null }>) {
        if (m.name) nameById.set(m.id, m.name);
      }
    }

    // Latest app health event per staff (diagnostics only — never feeds work time).
    type HealthRow = {
      staff_id: string;
      event_type: string;
      occurred_at: string;
      battery_percent: number | null;
      is_charging: boolean | null;
      app_state: string | null;
      platform: string | null;
      app_version: string | null;
    };
    const latestHealthByStaff = new Map<string, HealthRow>();
    if (staffIds.length > 0) {
      try {
        const { data: healthRows } = await admin
          .from('staff_app_health_events')
          .select('staff_id, event_type, occurred_at, battery_percent, is_charging, app_state, platform, app_version')
          .eq('organization_id', organizationId)
          .in('staff_id', staffIds)
          .lte('occurred_at', intervalEnd)
          .order('occurred_at', { ascending: false })
          .limit(staffIds.length * 20);
        for (const row of (healthRows ?? []) as HealthRow[]) {
          if (!latestHealthByStaff.has(row.staff_id)) {
            latestHealthByStaff.set(row.staff_id, row);
          }
        }
      } catch (err) {
        warnings.push(`health_events_query_failed:${(err as Error).message}`);
      }
    }
    const intervalStartMs = new Date(intervalStart).getTime();
    const intervalEndMs = new Date(intervalEnd).getTime();
    const workdayLikelyStartMs = intervalStartMs + 6 * 3600_000;   // 06:00 from window start
    const workdayLikelyEndMs   = intervalStartMs + 18 * 3600_000;  // 18:00 from window start

    const perStaff = [];
    let earliestPingAt: string | null = null;
    let latestPingAt: string | null = null;
    const staffWithOnlyFewPings: string[] = [];
    const staffWithLargeGaps: string[] = [];
    const staffWithNoRecentPing: string[] = [];

    for (const [staffId, list] of byStaff) {
      list.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
      const pingCount = list.length;
      const first = list[0];
      const last = list[list.length - 1];

      if (!earliestPingAt || new Date(first.recorded_at) < new Date(earliestPingAt)) {
        earliestPingAt = first.recorded_at;
      }
      if (!latestPingAt || new Date(last.recorded_at) > new Date(latestPingAt)) {
        latestPingAt = last.recorded_at;
      }

      // Accuracy stats.
      const accs = list.map(r => r.accuracy).filter((x): x is number => x != null).sort((a, b) => a - b);
      const minAccuracy = accs[0] ?? null;
      const maxAccuracy = accs[accs.length - 1] ?? null;
      const medianAccuracy = percentile(accs, 50);
      const p90Accuracy = percentile(accs, 90);

      // Gap stats.
      const gapsMin: number[] = [];
      for (let i = 1; i < list.length; i++) {
        const dt = (new Date(list[i].recorded_at).getTime() - new Date(list[i - 1].recorded_at).getTime()) / 60_000;
        gapsMin.push(dt);
      }
      const averagePingGapMinutes = gapsMin.length > 0
        ? gapsMin.reduce((s, x) => s + x, 0) / gapsMin.length
        : null;
      const maxPingGapMinutes = gapsMin.length > 0 ? Math.max(...gapsMin) : null;
      const gapCountOver15Min = gapsMin.filter(g => g > 15).length;
      const gapCountOver60Min = gapsMin.filter(g => g > 60).length;

      const firstMs = new Date(first.recorded_at).getTime();
      const lastMs = new Date(last.recorded_at).getTime();
      const hasPingsBeforeWorkdayLikely = firstMs < workdayLikelyStartMs;
      const hasPingsAfterWorkdayLikely = lastMs > workdayLikelyEndMs;

      // Sample rows.
      let sampleRows: PingRow[];
      if (includeRows) {
        sampleRows = list.slice(0, maxRowsPerStaff);
      } else {
        if (list.length <= 10) sampleRows = list;
        else sampleRows = [...list.slice(0, 5), ...list.slice(-5)];
      }

      if (pingCount < 5) staffWithOnlyFewPings.push(staffId);
      if ((maxPingGapMinutes ?? 0) > 60) staffWithLargeGaps.push(staffId);
      // "no recent" = last ping more than 2h before window end
      if (intervalEndMs - lastMs > 2 * 3600_000) staffWithNoRecentPing.push(staffId);

      const battery = computeBatteryStats(list, intervalEndMs);

      perStaff.push({
        staffId,
        staffName: nameById.get(staffId) ?? null,
        pingCount,
        firstRecordedAt: first.recorded_at,
        lastRecordedAt: last.recorded_at,
        firstCreatedAt: first.created_at,
        lastCreatedAt: last.created_at,
        minAccuracy,
        medianAccuracy,
        p90Accuracy,
        maxAccuracy,
        averagePingGapMinutes,
        maxPingGapMinutes,
        gapCountOver15Min,
        gapCountOver60Min,
        hasPingsBeforeWorkdayLikely,
        hasPingsAfterWorkdayLikely,
        battery,
        appHealth: (() => {
          const h = latestHealthByStaff.get(staffId);
          if (!h) return null;
          return {
            lastAppSeenAt: h.occurred_at,
            lastEventType: h.event_type,
            lastAppState: h.app_state,
            lastBatteryPercent: h.battery_percent,
            lastIsCharging: h.is_charging,
            lastPlatform: h.platform,
            lastAppVersion: h.app_version,
          };
        })(),
        sampleRows: sampleRows.map(r => ({
          id: r.id,
          staff_id: r.staff_id,
          recorded_at: r.recorded_at,
          created_at: r.created_at,
          latitude: r.lat,
          longitude: r.lng,
          accuracy: r.accuracy,
          speed_mps: r.speed,
          time_report_id: r.time_report_id,
          battery_level: r.battery_level,
          battery_percent: coerceBatteryPercent(r.battery_level, r.battery_percent),
          is_charging: r.is_charging,
          battery_captured_at: r.battery_captured_at,
          battery_source: r.battery_source,
        })),
      });
    }

    perStaff.sort((a, b) => b.pingCount - a.pingCount);

    const result = {
      summary: {
        totalStaffWithPings: byStaff.size,
        totalPingCount: rows.length,
        staffWithOnlyFewPings,
        staffWithLargeGaps,
        staffWithNoRecentPing,
        earliestPingAt,
        latestPingAt,
        intervalStart,
        intervalEnd,
        timezoneUsed,
      },
      perStaff,
      diagnostics: {
        queryWindow: { intervalStart, intervalEnd, timezoneUsed },
        rowLimitApplied: truncated ? HARD_CAP : null,
        paginationUsed: { pageSize: PAGE_SIZE, pageCount: pages, truncated },
        warnings,
        readOnly: true,
        sourceTable: 'staff_location_history',
        ignoredLayers: [
          'day_evidence', 'location_truth', 'workday_allocation',
          'display_timeline', 'gantt', 'assignments', 'targets',
          'booking_logic', 'project_logic',
        ],
      },
    };

    return json(result, 200);
  } catch (e) {
    return json({ error: 'internal_error', message: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
