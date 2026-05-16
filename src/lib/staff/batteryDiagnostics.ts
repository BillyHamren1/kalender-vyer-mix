/**
 * Pure battery diagnostics for a staff's raw GPS pings.
 *
 * Input: raw ping rows that already include the (optional) battery_* columns
 *        from `staff_location_history`, sorted ascending by recorded_at.
 *
 * Output: per-staff battery summary used purely by the Raw GPS debug UI.
 *         NEVER feeds the Time Engine, Gantt or report logic.
 *
 * Rules:
 *   - likelyBatteryRelatedSignalLoss = true when the LAST ping with battery
 *     data is <=10% AND either there are no further pings before the window
 *     ends OR the gap after that ping is >= 30 min.
 *   - batteryDroppedFast = true when the battery drops > 30 pp across the
 *     covered span OR > 15 pp inside any 60-minute rolling window.
 *   - All thresholds are intentionally conservative — false positives here
 *     would only show diagnostics text, never block or alter time data.
 */

export interface BatteryPingInput {
  recorded_at: string;
  battery_percent: number | null;
  battery_level: number | null;
  is_charging: boolean | null;
  battery_source: string | null;
}

export interface BatteryDiagnostics {
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

export const EMPTY_BATTERY_DIAGNOSTICS: BatteryDiagnostics = {
  firstBatteryPercent: null,
  lastBatteryPercent: null,
  minBatteryPercent: null,
  maxBatteryPercent: null,
  latestIsCharging: null,
  batterySamplesCount: 0,
  missingBatterySamplesCount: 0,
  batteryDroppedFast: false,
  likelyBatteryRelatedSignalLoss: false,
};

const LOW_BATTERY_THRESHOLD_PERCENT = 10;
const SIGNAL_LOSS_GAP_AFTER_LOW_MS = 30 * 60_000;
const FAST_DROP_TOTAL_PP = 30;
const FAST_DROP_WINDOW_MS = 60 * 60_000;
const FAST_DROP_WINDOW_PP = 15;

function coerceBatteryPercent(
  level: number | null | undefined,
  percent: number | null | undefined,
): number | null {
  if (typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100) {
    return Math.round(percent);
  }
  if (typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 1) {
    return Math.round(level * 100);
  }
  return null;
}

export function computeBatteryDiagnostics(
  pingsAscending: BatteryPingInput[],
  /** End of the inspection window — used to evaluate "gap after last low". */
  intervalEndMs: number,
): BatteryDiagnostics {
  if (pingsAscending.length === 0) return { ...EMPTY_BATTERY_DIAGNOSTICS };

  // Normalize once.
  type Sample = { ts: number; pct: number; charging: boolean | null };
  const samples: Sample[] = [];
  let missing = 0;
  let latestIsCharging: boolean | null = null;

  for (const p of pingsAscending) {
    const ts = new Date(p.recorded_at).getTime();
    if (!Number.isFinite(ts)) {
      missing++;
      continue;
    }
    const pct = coerceBatteryPercent(p.battery_level, p.battery_percent);
    const charging = typeof p.is_charging === 'boolean' ? p.is_charging : null;
    if (pct === null) {
      missing++;
      continue;
    }
    samples.push({ ts, pct, charging });
    // Always reflect the most recent ping that *has* a charging reading.
    if (charging !== null) latestIsCharging = charging;
  }

  if (samples.length === 0) {
    return {
      ...EMPTY_BATTERY_DIAGNOSTICS,
      missingBatterySamplesCount: missing,
    };
  }

  samples.sort((a, b) => a.ts - b.ts);
  const first = samples[0];
  const last = samples[samples.length - 1];

  let minPct = first.pct;
  let maxPct = first.pct;
  for (const s of samples) {
    if (s.pct < minPct) minPct = s.pct;
    if (s.pct > maxPct) maxPct = s.pct;
  }

  // Fast-drop detection.
  const totalDrop = first.pct - last.pct;
  let batteryDroppedFast = totalDrop > FAST_DROP_TOTAL_PP;
  if (!batteryDroppedFast) {
    // Rolling 60-min window — any window where (maxPct - minPct) > 15 pp counts.
    let left = 0;
    for (let right = 0; right < samples.length; right++) {
      while (samples[right].ts - samples[left].ts > FAST_DROP_WINDOW_MS) left++;
      let winMax = samples[left].pct;
      let winMin = samples[left].pct;
      for (let i = left; i <= right; i++) {
        if (samples[i].pct > winMax) winMax = samples[i].pct;
        if (samples[i].pct < winMin) winMin = samples[i].pct;
      }
      if (winMax - winMin > FAST_DROP_WINDOW_PP) {
        batteryDroppedFast = true;
        break;
      }
    }
  }

  // Likely battery-related signal loss.
  let likelyBatteryRelatedSignalLoss = false;
  if (last.pct <= LOW_BATTERY_THRESHOLD_PERCENT) {
    const gapAfterLastMs = intervalEndMs - last.ts;
    // Either no more pings (we already established this is the last) plus a
    // big remaining window, or the last battery sample is followed by a long
    // silence inside the window.
    if (gapAfterLastMs >= SIGNAL_LOSS_GAP_AFTER_LOW_MS) {
      likelyBatteryRelatedSignalLoss = true;
    }
  }

  // If we have a fresher overall is_charging reading from the last sample,
  // prefer that. Otherwise fall back to the most recent non-null we found.
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
