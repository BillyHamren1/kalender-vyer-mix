/**
 * trackingPolicy.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Server-authoritative GPS tracking policy. The mobile app must only follow
 * what this returns — it may NOT invent its own AI-driven boost.
 *
 * Modes (allowed):
 *   battery_saver        – default away from work, lazy heartbeat
 *   normal               – workday open, no specific target
 *   approaching_target   – heading toward a known geofence
 *   near_target          – inside or just outside a target geofence
 *   clarification_boost  – AI/rule engine asked for a short, dense window
 *   active_work          – an active timer is running
 *
 * Boosts:
 *   - Stored in tracking_policy_boosts (max 5 min, enforced by DB trigger)
 *   - Must include reason + expiresAt
 *   - Do NOT survive low battery (caller may pass batteryPct to suppress)
 *   - Do NOT bypass dismissed cooldowns (caller passes dismissedCooldownActive)
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
  expiresAt?: string | null; // ISO, only set for time-boxed modes
  reason?: string | null;
  targetId?: string | null;
  targetType?: string | null;

  // ── Legacy hints kept for older mobile clients ───────────────────────
  recommendedMode: "active_timer" | "workday_active" | "idle";
  hasActiveTimer: boolean;
  workdayOpen: boolean;
}

const PRESETS: Record<TrackingMode, { heartbeatMs: number; distanceFilter: number }> = {
  battery_saver:        { heartbeatMs: 15 * 60_000, distanceFilter: 500 },
  normal:               { heartbeatMs:  5 * 60_000, distanceFilter: 200 },
  approaching_target:   { heartbeatMs:  60_000,     distanceFilter:  60 },
  near_target:          { heartbeatMs:  20_000,     distanceFilter:  20 },
  clarification_boost:  { heartbeatMs:  15_000,     distanceFilter:  10 },
  active_work:          { heartbeatMs:  60_000,     distanceFilter:  50 },
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
  /** Reference time, defaults to now(). */
  now?: Date;
}

const LOW_BATTERY_THRESHOLD = 0.15; // 15 %

export function buildTrackingPolicy(input: BuildTrackingPolicyInput): TrackingPolicy {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  const legacy = {
    recommendedMode: input.hasActiveTimer
      ? "active_timer"
      : input.workdayOpen
      ? "workday_active"
      : "idle",
    hasActiveTimer: input.hasActiveTimer,
    workdayOpen: input.workdayOpen,
  } as const;

  // 1. Active timer always wins — no AI boost can override real work.
  if (input.hasActiveTimer) {
    return { mode: "active_work", ...PRESETS.active_work, ...legacy };
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
    return {
      mode: top.mode,
      heartbeatMs: preset.heartbeatMs,
      distanceFilter: preset.distanceFilter,
      expiresAt: top.expires_at,
      reason: top.reason,
      targetId: top.target_id,
      targetType: top.target_type,
      ...legacy,
    };
  }

  // 4. Workday open without active timer → normal
  if (input.workdayOpen) {
    return {
      mode: "normal",
      ...PRESETS.normal,
      reason: lowBattery
        ? "low_battery_suppress_boost"
        : cooldown
        ? "dismissed_cooldown_active"
        : null,
      ...legacy,
    };
  }

  // 5. Default — battery saver
  return {
    mode: "battery_saver",
    ...PRESETS.battery_saver,
    reason: lowBattery ? "low_battery" : null,
    ...legacy,
  };
}
