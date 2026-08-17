/**
 * Hjälpare för Map-baserad React Query-data i en persisterad cache.
 *
 * Persisterad cache (localStorage) går genom JSON.stringify, vilket gör att ett
 * `Map` rehydreras som ett vanligt objekt `{}` — utan `.get()`. Det kraschade
 * /warehouse/packing (`progressMap.get is not a function`).
 *
 * `toMap` normaliserar alltid tillbaka till ett riktigt Map.
 * `containsNonJsonSafeData` används för att aldrig persistera sådan data.
 */

export function toMap<V>(value: unknown): Map<string, V> {
  if (value instanceof Map) return value as Map<string, V>;
  if (Array.isArray(value)) {
    // JSON-serialiserat Map kan i vissa fall bli en array av par.
    const map = new Map<string, V>();
    for (const entry of value) {
      if (Array.isArray(entry) && entry.length === 2) {
        map.set(String(entry[0]), entry[1] as V);
      }
    }
    return map;
  }
  if (value && typeof value === 'object') {
    return new Map<string, V>(Object.entries(value as Record<string, V>));
  }
  return new Map<string, V>();
}

/** True om data innehåller Map/Set (icke JSON-säkert) — då får den inte persisteras. */
export function containsNonJsonSafeData(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (value instanceof Map || value instanceof Set) return true;
  if (Array.isArray(value)) {
    return value.some((item) => containsNonJsonSafeData(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsNonJsonSafeData(item, depth + 1),
    );
  }
  return false;
}
