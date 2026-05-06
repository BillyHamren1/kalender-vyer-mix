/**
 * Per-target dismiss cooldown.
 *
 * When the user explicitly says "Inte arbete" / dismisses an arrival prompt
 * we record a cooldown for that specific target so the engine doesn't
 * immediately re-prompt while they're still inside (or repeatedly entering)
 * the geofence. Cooldown is per-target, never global.
 *
 * Defaults: 8 hours (within the requested 6–12h window).
 */

const KEY = 'eventflow-dismissed-target-cooldowns';
const DEFAULT_COOLDOWN_MS = 8 * 60 * 60 * 1000;

type CooldownMap = Record<string, number>; // targetKey → expiresAt epoch ms

function read(): CooldownMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CooldownMap;
    // Garbage-collect expired entries on read
    const now = Date.now();
    let dirty = false;
    for (const k of Object.keys(parsed)) {
      if (parsed[k] <= now) { delete parsed[k]; dirty = true; }
    }
    if (dirty) localStorage.setItem(KEY, JSON.stringify(parsed));
    return parsed;
  } catch {
    return {};
  }
}

function write(map: CooldownMap): void {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* noop */ }
}

export function recordDismissCooldown(targetKey: string, ttlMs: number = DEFAULT_COOLDOWN_MS): void {
  if (!targetKey) return;
  const map = read();
  map[targetKey] = Date.now() + ttlMs;
  write(map);
  // eslint-disable-next-line no-console
  console.info('[dismiss-cooldown] recorded', { targetKey, ttlMs });
}

export function isInDismissCooldown(targetKey: string): boolean {
  const map = read();
  const exp = map[targetKey];
  return !!exp && exp > Date.now();
}

export function getDismissCooldowns(): CooldownMap {
  return read();
}

export function clearDismissCooldown(targetKey: string): void {
  const map = read();
  if (map[targetKey]) {
    delete map[targetKey];
    write(map);
  }
}
