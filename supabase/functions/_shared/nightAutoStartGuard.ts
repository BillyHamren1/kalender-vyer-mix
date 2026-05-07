// Hard backend guard mot auto-start av tid mellan 00:00–05:00 lokal tid.
//
// Regel:
//   1) Mellan 00:00 och 05:00 (lokal tid) får ingen kodväg auto-starta:
//        - workday
//        - location_time_entries
//        - time_reports
//        - assistant start_activity
//        - geofence arrival auto-start
//        - background GPS processor
//   2) Undantag: en redan aktiv user-startad timer (current_time_registration
//      med status='active' OCH source='user_timer') får leva vidare även om
//      klockan passerar midnatt. Användaren får också MANUELLT starta nytt
//      via mobile-app-api.start_location_timer (det är inte "auto-start").
//
// Detta är EXTRA säkerhet ovanpå huvudregeln att bara user-started timer
// får starta tid. Anrop:
//
//   const guard = await checkNightAutoStartGuard(admin, { staffId, nowIso, tz });
//   if (guard.blocked) return jsonGuardResponse(guard);

const DEFAULT_TZ = "Europe/Stockholm";

export interface NightGuardInput {
  staffId: string;
  nowIso?: string;          // default: new Date().toISOString()
  timeZone?: string;        // default: Europe/Stockholm
}

export interface NightGuardResult {
  blocked: boolean;
  reason: "blocked_night_auto_start_no_active_timer" | "ok";
  isNightLocal: boolean;
  localHour: number;
  hasActiveUserTimer: boolean;
  timeZone: string;
}

function getLocalHour(nowIso: string, timeZone: string): number {
  try {
    const d = new Date(nowIso);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
    const h = Number(hourPart);
    return Number.isFinite(h) ? h % 24 : 0;
  } catch {
    return new Date(nowIso).getUTCHours();
  }
}

/**
 * Returns whether auto-start MUST be blocked right now for this staff member.
 * Reads current_time_registration to detect a still-active user-started timer.
 */
export async function checkNightAutoStartGuard(
  // deno-lint-ignore no-explicit-any
  admin: any,
  input: NightGuardInput,
): Promise<NightGuardResult> {
  const tz = input.timeZone || DEFAULT_TZ;
  const nowIso = input.nowIso || new Date().toISOString();
  const localHour = getLocalHour(nowIso, tz);
  const isNightLocal = localHour >= 0 && localHour < 5;

  if (!isNightLocal) {
    return {
      blocked: false,
      reason: "ok",
      isNightLocal: false,
      localHour,
      hasActiveUserTimer: false,
      timeZone: tz,
    };
  }

  // Active user-started timer is the ONLY override during night hours.
  let hasActiveUserTimer = false;
  try {
    const { data } = await admin
      .from("current_time_registration")
      .select("id, source, status")
      .eq("staff_id", input.staffId)
      .eq("status", "active")
      .eq("source", "user_timer")
      .limit(1)
      .maybeSingle();
    hasActiveUserTimer = !!data;
  } catch {
    // Defensive: if we cannot prove an active user timer, BLOCK.
    hasActiveUserTimer = false;
  }

  if (hasActiveUserTimer) {
    return {
      blocked: false,
      reason: "ok",
      isNightLocal: true,
      localHour,
      hasActiveUserTimer: true,
      timeZone: tz,
    };
  }

  return {
    blocked: true,
    reason: "blocked_night_auto_start_no_active_timer",
    isNightLocal: true,
    localHour,
    hasActiveUserTimer: false,
    timeZone: tz,
  };
}

/**
 * Sync version for callsites that already know whether a user timer is
 * active (e.g. background processor that already loaded current registration).
 */
export function nightAutoStartBlocked(
  nowIso: string,
  hasActiveUserTimer: boolean,
  timeZone: string = DEFAULT_TZ,
): NightGuardResult {
  const localHour = getLocalHour(nowIso, timeZone);
  const isNightLocal = localHour >= 0 && localHour < 5;
  if (!isNightLocal) {
    return {
      blocked: false,
      reason: "ok",
      isNightLocal: false,
      localHour,
      hasActiveUserTimer,
      timeZone,
    };
  }
  if (hasActiveUserTimer) {
    return {
      blocked: false,
      reason: "ok",
      isNightLocal: true,
      localHour,
      hasActiveUserTimer: true,
      timeZone,
    };
  }
  return {
    blocked: true,
    reason: "blocked_night_auto_start_no_active_timer",
    isNightLocal: true,
    localHour,
    hasActiveUserTimer: false,
    timeZone,
  };
}
