/**
 * Time Engine — loadGeoAnchors
 * ============================
 *
 * Read-only loader that pulls geofence ENTER/EXIT signals from the two
 * canonical event tables and maps them to the unified `GeoAnchor` shape
 * consumed by buildGpsDayTimeline.
 *
 * Sources (read-only; never mutated):
 *   - assistant_events        (event_type IN ('arrival','departure') AND source LIKE 'geofence%')
 *   - staff_presence_events   (event_type IN ('arrival','departure'))
 *
 * After loading, anchors are cross-matched against the resolved
 * WorkTargets list. ONLY entry-anchors that resolve to a primary-eligible
 * WorkTarget become `strength='hard'`. Everything else is `weak`.
 *
 * NEVER touches workdays / time_reports / location_time_entries /
 * travel_time_logs / current_time_registration. Pure read.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import type {
  GeoAnchor,
  GeoAnchorSource,
  GeoAnchorStrength,
  WorkTarget,
} from './contracts.ts';
import { formatStockholm } from '../timeline/geo.ts';

export interface LoadGeoAnchorsInput {
  supabaseAdmin: SupabaseClient;
  organizationId: string;
  staffId: string;
  /** UTC window — pass the same Stockholm-day window the rest of the engine uses. */
  startUtc: string;
  endUtc: string;
  /** Resolved primary-eligible work targets (output of resolveWorkTargets+toWorkTarget). */
  targets: WorkTarget[];
}

export interface LoadGeoAnchorsResult {
  anchors: GeoAnchor[];
  diagnostics: {
    assistantEventsRows: number;
    staffPresenceEventsRows: number;
    hardCount: number;
    weakCount: number;
    entryCount: number;
    exitCount: number;
    weakReasons: Record<string, number>;
  };
  warnings: string[];
}

/**
 * Map an event_type from either source table into our binary entry/exit.
 * `arrival` and `signal_resumed` count as entry-context; `departure` and
 * `signal_lost` count as exit-context. Only arrival/departure currently
 * become anchors — signal_lost/resumed are GPS-quality events, not
 * geofence boundary crossings.
 */
function eventTypeToAnchorType(
  ev: string | null | undefined,
): 'entry' | 'exit' | null {
  switch ((ev ?? '').toLowerCase()) {
    case 'arrival':
      return 'entry';
    case 'departure':
      return 'exit';
    default:
      return null;
  }
}

/**
 * The source columns store a target id but the column type differs:
 *   - assistant_events.target_id     : text  (UUID-like for project/large_project/location, may be 'booking-...' style)
 *   - staff_presence_events.target_id: text  (same convention)
 * Match logic is purely string-equality against WorkTarget.refId.
 */
function matchAnchorToTarget(
  rawTargetType: string,
  rawTargetId: string,
  targets: WorkTarget[],
): { target: WorkTarget | null; weakReason: GeoAnchor['weakReason'] } {
  // Map source target_type → WorkTarget.kind
  // ('large_project' falls under 'project' in the time-engine target space)
  const kindCandidates = (() => {
    switch (rawTargetType) {
      case 'project':
      case 'large_project':
        return ['project'] as const;
      case 'booking':
        return ['booking'] as const;
      case 'location':
        return ['organization_location'] as const;
      case 'warehouse':
        return ['warehouse'] as const;
      default:
        return [
          'project',
          'booking',
          'organization_location',
          'warehouse',
        ] as const;
    }
  })();

  const matched = targets.find(
    (t) =>
      kindCandidates.includes(t.kind as never) && t.refId === rawTargetId,
  );

  if (!matched) {
    return { target: null, weakReason: 'no_matching_worktarget' };
  }
  if (matched.assignedToUserToday === false) {
    // Target exists but is not today-relevant for this staff → weak.
    return { target: matched, weakReason: 'target_not_today' };
  }
  return { target: matched, weakReason: null };
}

export async function loadGeoAnchors(
  input: LoadGeoAnchorsInput,
): Promise<LoadGeoAnchorsResult> {
  const warnings: string[] = [];
  const anchors: GeoAnchor[] = [];
  const diag = {
    assistantEventsRows: 0,
    staffPresenceEventsRows: 0,
    hardCount: 0,
    weakCount: 0,
    entryCount: 0,
    exitCount: 0,
    weakReasons: {} as Record<string, number>,
  };

  const pushAnchor = (
    raw: {
      id: string;
      type: 'entry' | 'exit';
      source: GeoAnchorSource;
      rawSourceLabel: string | null;
      targetType: string;
      targetId: string;
      targetLabel: string | null;
      timestampUtc: string;
    },
  ) => {
    if (!raw.targetId || !raw.targetType || !raw.timestampUtc) return;
    const { target, weakReason } = matchAnchorToTarget(
      raw.targetType,
      raw.targetId,
      input.targets,
    );
    let strength: GeoAnchorStrength = 'weak';
    let matchedRefId: string | null = null;
    let matchedKind: WorkTarget['kind'] | null = null;
    if (target && !weakReason) {
      strength = 'hard';
      matchedRefId = target.refId;
      matchedKind = target.kind;
    } else if (weakReason) {
      diag.weakReasons[weakReason] =
        (diag.weakReasons[weakReason] ?? 0) + 1;
    }
    if (strength === 'hard') diag.hardCount += 1;
    else diag.weakCount += 1;
    if (raw.type === 'entry') diag.entryCount += 1;
    else diag.exitCount += 1;

    anchors.push({
      id: raw.id,
      staffId: input.staffId,
      organizationId: input.organizationId,
      type: raw.type,
      source: raw.source,
      rawSourceLabel: raw.rawSourceLabel,
      targetType: raw.targetType,
      targetId: raw.targetId,
      targetLabel: raw.targetLabel ?? target?.label ?? null,
      timestampUtc: raw.timestampUtc,
      timestampLocalStockholm: formatStockholm(raw.timestampUtc, 'datetime'),
      confidence: 'high',
      strength,
      matchedTargetRefId: matchedRefId,
      matchedTargetKind: matchedKind,
      weakReason: weakReason ?? null,
    });
  };

  // ── 1) assistant_events ─────────────────────────────────────────────
  try {
    const { data, error } = await input.supabaseAdmin
      .from('assistant_events')
      .select(
        'id, event_type, target_type, target_id, target_label, happened_at, source',
      )
      .eq('organization_id', input.organizationId)
      .eq('staff_id', input.staffId)
      .gte('happened_at', input.startUtc)
      .lte('happened_at', input.endUtc)
      .order('happened_at', { ascending: true });
    if (error) {
      warnings.push(`assistant_events_read_failed: ${error.message}`);
    } else {
      diag.assistantEventsRows = data?.length ?? 0;
      for (const row of data ?? []) {
        const t = eventTypeToAnchorType(row.event_type);
        if (!t) continue;
        const src = String(row.source ?? '');
        if (!src.toLowerCase().startsWith('geofence')) continue;
        if (!row.target_id || !row.target_type) continue;
        pushAnchor({
          id: `ae:${row.id}`,
          type: t,
          source: 'assistant_events',
          rawSourceLabel: src,
          targetType: String(row.target_type),
          targetId: String(row.target_id),
          targetLabel: row.target_label ?? null,
          timestampUtc: row.happened_at,
        });
      }
    }
  } catch (e: any) {
    warnings.push(`assistant_events_exception: ${e?.message ?? e}`);
  }

  // ── 2) staff_presence_events ────────────────────────────────────────
  try {
    const { data, error } = await input.supabaseAdmin
      .from('staff_presence_events')
      .select(
        'id, event_type, target_type, target_id, target_label, event_at, source',
      )
      .eq('organization_id', input.organizationId)
      .eq('staff_id', input.staffId)
      .gte('event_at', input.startUtc)
      .lte('event_at', input.endUtc)
      .order('event_at', { ascending: true });
    if (error) {
      warnings.push(`staff_presence_events_read_failed: ${error.message}`);
    } else {
      diag.staffPresenceEventsRows = data?.length ?? 0;
      for (const row of data ?? []) {
        const t = eventTypeToAnchorType(row.event_type);
        if (!t) continue;
        if (!row.target_id || !row.target_type) continue;
        pushAnchor({
          id: `sp:${row.id}`,
          type: t,
          source: 'staff_presence_events',
          rawSourceLabel: String(row.source ?? ''),
          targetType: String(row.target_type),
          targetId: String(row.target_id),
          targetLabel: row.target_label ?? null,
          timestampUtc: row.event_at,
        });
      }
    }
  } catch (e: any) {
    warnings.push(`staff_presence_events_exception: ${e?.message ?? e}`);
  }

  // Sort chronologically — multiple sources may interleave.
  anchors.sort(
    (a, b) => Date.parse(a.timestampUtc) - Date.parse(b.timestampUtc),
  );

  return { anchors, diagnostics: diag, warnings };
}
