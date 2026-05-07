/**
 * Time Engine — Legacy Leak Guard
 *
 * The new Time Engine MUST NOT consume legacy sources as ground truth.
 * Legacy systems (workday, time_reports, location_time_entries, travel_time_logs,
 * assistant_events, workday_flags, old snapshots, legacy active timers) may still
 * exist in the rest of the app, but they must never flow INTO the new engine's
 * pure layers (buildGpsDayTimeline / resolveWorkTargets / decideAutoStart /
 * processGpsTimelineForAutoStart / get-active-time-registration-status).
 *
 * This helper inspects an input object (shallow + one level deep) and reports
 * any forbidden keys. It never throws — it returns a structured result so
 * callers can decide whether to log, warn, or hard-fail in debug mode.
 */

export const LEGACY_SOURCE_KEYS = [
  "workday",
  "workdays",
  "timeReports",
  "time_reports",
  "timeReport",
  "time_report",
  "locationEntries",
  "location_time_entries",
  "locationTimeEntries",
  "travelLogs",
  "travel_time_logs",
  "travelTimeLogs",
  "assistantEvents",
  "assistant_events",
  "flags",
  "workday_flags",
  "workdayFlags",
  "oldSnapshots",
  "old_snapshots",
  "legacySnapshots",
  "activeTimers",
  "active_timers",
  "legacyActiveTimers",
  "current_time_registration",
  "currentTimeRegistration",
] as const;

export type LegacySourceKey = (typeof LEGACY_SOURCE_KEYS)[number];

export interface LegacyLeakResult {
  legacySourceLeakDetected: boolean;
  legacySources: string[];
  /** dot-paths where the legacy keys were found (e.g. "input.workday", "input.context.timeReports") */
  paths: string[];
}

const FORBIDDEN_SET = new Set<string>(LEGACY_SOURCE_KEYS as readonly string[]);

function inspect(
  value: unknown,
  path: string,
  depth: number,
  hits: { key: string; path: string }[],
): void {
  if (value === null || typeof value !== "object") return;
  if (depth > 2) return; // shallow scan — Time Engine inputs are flat by contract

  if (Array.isArray(value)) {
    // Arrays of pings/targets/segments are legitimate — don't dig into payload shape.
    return;
  }

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_SET.has(k)) {
      // Only flag if there's actually data attached (truthy / non-empty)
      const hasData =
        v !== undefined &&
        v !== null &&
        !(Array.isArray(v) && v.length === 0) &&
        !(typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);
      if (hasData) {
        hits.push({ key: k, path: `${path}.${k}` });
      }
    }
    if (v && typeof v === "object") {
      inspect(v, `${path}.${k}`, depth + 1, hits);
    }
  }
}

export function assertNoLegacySources(
  input: unknown,
  options?: { debug?: boolean; label?: string },
): LegacyLeakResult {
  const hits: { key: string; path: string }[] = [];
  inspect(input, "input", 0, hits);

  const result: LegacyLeakResult = {
    legacySourceLeakDetected: hits.length > 0,
    legacySources: Array.from(new Set(hits.map((h) => h.key))),
    paths: hits.map((h) => h.path),
  };

  if (result.legacySourceLeakDetected && options?.debug) {
    const label = options.label ?? "time-engine";
    // eslint-disable-next-line no-console
    console.warn(
      `[${label}] ⚠️ LEGACY SOURCE LEAK DETECTED — the new Time Engine must not consume legacy sources as truth.`,
      {
        legacySources: result.legacySources,
        paths: result.paths,
      },
    );
  }

  return result;
}
