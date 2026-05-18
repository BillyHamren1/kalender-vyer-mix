/**
 * trackingPolicy.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Server-authoritative GPS tracking policy. The mobile app must only follow
 * what this returns — it may NOT invent its own AI-driven boost or its own
 * heartbeat cadence.
 *
 * Contract returned to the app:
 *   mode                 – discrete tracking mode (see TrackingMode)
 *   heartbeatMs          – how often the app SHOULD ping
 *   distanceFilter       – meters of movement that triggers a ping
 *   expectedHeartbeatMs  – soft target (== heartbeatMs) for stale detection
 *   maxSilenceMs         – hard ceiling: if no ping arrives within this window
 *                           backend marks isSignalStale = true. Backend never
 *                           interprets silence as a workday gap.
 *   lastPingAt           – ISO of the most recent ping known to backend
 *   isSignalStale        – true when (now - lastPingAt) > maxSilenceMs
 *   expiresAt?           – set for time-boxed boost modes
 *   reason?              – short human-readable reason
 *
 * Modes (allowed):
 *   battery_saver        – default away from work, lazy heartbeat
 *   normal               – workday open, no specific target (~3 min)
 *   approaching_target   – heading toward a known geofence
 *   near_target          – inside or just outside a target geofence
 *   clarification_boost  – AI/rule engine asked for a short, dense window
 *   active_work          – an active timer is running
 *
 * Boosts:
 *   - Stored in tracking_policy_boosts (max 5 min, enforced by DB trigger)
 *   - Must include reason + expiresAt
 *   - Do NOT survive low battery / dismissed cooldown
 */

export type TrackingMode =
  | "battery_saver"
  | "normal"
  | "approaching_target"
  | "near_target"
  | "clarification_boost"
  | "active_work";

export interface TrackingPolicy {
  mode: TrackingMode;
  heartbeatMs: number;
  distanceFilter: number; // meters

  // ── Heartbeat contract (NEW) ────────────────────────────────────────
  expectedHeartbeatMs: number;
  maxSilenceMs: number;
  lastPingAt: string | null;     // ISO
  isSignalStale: boolean;
  silenceMs?: number | null;     // observed silence (now - lastPingAt)

  expiresAt?: string | null;     // ISO, only set for time-boxed modes
  reason?: string | null;
  targetId?: string | null;
  targetType?: string | null;

  // ── Legacy hints kept for older mobile clients ──────────────────────
  recommendedMode: "active_timer" | "workday_active" | "idle";
  hasActiveTimer: boolean;
  workdayOpen: boolean;
}

interface ModePreset {
  heartbeatMs: number;
  distanceFilter: number;
  /** Hard silence ceiling. Backend marks stale beyond this. */
  maxSilenceMs: number;
}

/**
 * IMPORTANT: distanceFilter is NEVER permanently 10m. Even the densest
 * boost mode caps at 20m — the app must not run a permanent 10m filter.
 */
const PRESETS: Record<TrackingMode, ModePreset> = {
  // Idle / no workday — very cheap. 500m endast när workday=stängd OCH
  // ingen aktiv timer/boost. Annars klampas distanceFilter ner längre ner.
  battery_saver:        { heartbeatMs: 15 * 60_000, distanceFilter: 500, maxSilenceMs: 30 * 60_000 },
  // Workday open utan target/timer: ~3 min heartbeat, MAX 50m distanceFilter
  // (tidigare 200m). 200m var för glest för att fånga vanlig promenad/byggen.
  normal:               { heartbeatMs:  3 * 60_000, distanceFilter:  50, maxSilenceMs:  7 * 60_000 },
  approaching_target:   { heartbeatMs:  60_000,     distanceFilter:  60, maxSilenceMs:  4 * 60_000 },
  // Inne vid eller alldeles utanför target — 20m räcker.
  near_target:          { heartbeatMs:  20_000,     distanceFilter:  20, maxSilenceMs:  3 * 60_000 },
  clarification_boost:  { heartbeatMs:  15_000,     distanceFilter:  20, maxSilenceMs:  2 * 60_000 },
  // Active timer: ~1 min heartbeat, MAX 25m distanceFilter
  // (tidigare 50m). Aktiv arbetsdag får aldrig vara glesare än 25m.
  active_work:          { heartbeatMs:  60_000,     distanceFilter:  25, maxSilenceMs:  7 * 60_000 },
};


export interface BoostRow {
  mode: "clarification_boost" | "near_target" | "approaching_target";
  reason: string;
  target_id: string | null;
  target_type: string | null;
  expires_at: string;
  consumed: boolean;
}

export interface BuildTrackingPolicyInput {
  hasActiveTimer: boolean;
  workdayOpen: boolean;
  /** Active (non-expired, non-consumed) boost rows. */
  activeBoosts: BoostRow[];
  /** Optional client hints — when supplied, can suppress boosts. */
  batteryPct?: number | null;
  dismissedCooldownActive?: boolean;
  /** ISO of latest known ping (typically max recorded_at from staff_location_history). */
  lastPingAt?: string | null;
  /** Reference time, defaults to now(). */
  now?: Date;
}

const LOW_BATTERY_THRESHOLD = 0.15; // 15 %

function applyHeartbeatContract(
  base: { mode: TrackingMode } & ModePreset & Partial<TrackingPolicy>,
  lastPingAt: string | null,
  nowMs: number,
): TrackingPolicy {
  const lastMs = lastPingAt ? new Date(lastPingAt).getTime() : null;
  const silenceMs = lastMs ? Math.max(0, nowMs - lastMs) : null;
  const isSignalStale =
    silenceMs !== null ? silenceMs > base.maxSilenceMs : !!lastPingAt === false;

  return {
    mode: base.mode,
    heartbeatMs: base.heartbeatMs,
    distanceFilter: base.distanceFilter,
    expectedHeartbeatMs: base.heartbeatMs,
    maxSilenceMs: base.maxSilenceMs,
    lastPingAt: lastPingAt ?? null,
    isSignalStale,
    silenceMs,
    expiresAt: base.expiresAt ?? null,
    reason: base.reason ?? null,
    targetId: base.targetId ?? null,
    targetType: base.targetType ?? null,
    recommendedMode: base.recommendedMode!,
    hasActiveTimer: base.hasActiveTimer!,
    workdayOpen: base.workdayOpen!,
  };
}

export function buildTrackingPolicy(input: BuildTrackingPolicyInput): TrackingPolicy {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const lastPingAt = input.lastPingAt ?? null;

  const legacy = {
    recommendedMode: input.hasActiveTimer
      ? ("active_timer" as const)
      : input.workdayOpen
      ? ("workday_active" as const)
      : ("idle" as const),
    hasActiveTimer: input.hasActiveTimer,
    workdayOpen: input.workdayOpen,
  };

  // 1. Active timer always wins — no AI boost can override real work.
  if (input.hasActiveTimer) {
    return applyHeartbeatContract(
      { mode: "active_work", ...PRESETS.active_work, ...legacy },
      lastPingAt,
      nowMs,
    );
  }

  // 2. Filter boosts: not consumed, not expired
  const livingBoosts = (input.activeBoosts ?? [])
    .filter((b) => !b.consumed && new Date(b.expires_at).getTime() > nowMs)
    .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime());

  const lowBattery =
    typeof input.batteryPct === "number" && input.batteryPct >= 0 && input.batteryPct <= 1
      ? input.batteryPct < LOW_BATTERY_THRESHOLD
      : false;

  const cooldown = !!input.dismissedCooldownActive;

  // 3. Honor a boost only if battery + cooldown allow
  if (livingBoosts.length > 0 && !lowBattery && !cooldown) {
    const top = livingBoosts[0];
    const preset = PRESETS[top.mode];
    return applyHeartbeatContract(
      {
        mode: top.mode,
        ...preset,
        expiresAt: top.expires_at,
        reason: top.reason,
        targetId: top.target_id,
        targetType: top.target_type,
        ...legacy,
      },
      lastPingAt,
      nowMs,
    );
  }

  // 4. Workday open without active timer → normal (~3 min)
  if (input.workdayOpen) {
    return applyHeartbeatContract(
      {
        mode: "normal",
        ...PRESETS.normal,
        reason: lowBattery
          ? "low_battery_suppress_boost"
          : cooldown
          ? "dismissed_cooldown_active"
          : null,
        ...legacy,
      },
      lastPingAt,
      nowMs,
    );
  }

  // 5. Default — battery saver
  return applyHeartbeatContract(
    {
      mode: "battery_saver",
      ...PRESETS.battery_saver,
      reason: lowBattery ? "low_battery" : null,
      ...legacy,
    },
    lastPingAt,
    nowMs,
  );
}
