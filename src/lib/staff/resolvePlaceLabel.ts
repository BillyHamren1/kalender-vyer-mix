/**
 * resolvePlaceLabel — single source of truth för plats-label i UI.
 *
 * Reglerna (i ordning):
 *   1. Internal target match → använd `internalLabel`.
 *   2. Reverse-geocode resultat finns (address/poi) → använd det.
 *   3. Lat/lng finns men lookup ej körd än → "Slår upp adress…".
 *   4. Lookup misslyckades → "Okänd plats – adress kunde inte hämtas".
 *   5. Inga koordinater alls → "Okänd plats – saknar koordinat".
 *
 * UI får ALDRIG fallbacka till råa "okänd plats" själv — all label-logik
 * ska gå genom denna funktion.
 */

export type PlaceLookupState = 'ok' | 'loading' | 'error' | 'idle';

export interface ResolvePlaceInput {
  /** Intern matchning (känd arbetsplats / location / projekt) — vinner alltid om satt. */
  internalLabel?: string | null;
  /** Reverse-geocode-resultat när det finns (address/POI). */
  resolvedLabel?: string | null;
  /** Status från reverse-geocode-hook. */
  lookupState?: PlaceLookupState;
  /** Koordinater. Sätts till null om ingen position alls finns. */
  lat?: number | null;
  lng?: number | null;
}

export interface ResolvedPlaceLabel {
  label: string;
  /** För UI-tone/badge: 'matched' | 'lookup' | 'pending' | 'failed' | 'no_coords' */
  source: 'matched' | 'lookup' | 'pending' | 'failed' | 'no_coords';
}

export function resolvePlaceLabel(input: ResolvePlaceInput): ResolvedPlaceLabel {
  const { internalLabel, resolvedLabel, lookupState, lat, lng } = input;

  // 1) Intern match vinner alltid.
  if (internalLabel && internalLabel.trim()) {
    return { label: internalLabel.trim(), source: 'matched' };
  }

  const hasCoords = typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng);

  // 2) Reverse-geocode klar och har label.
  if (resolvedLabel && resolvedLabel.trim() && lookupState !== 'error') {
    return { label: resolvedLabel.trim(), source: 'lookup' };
  }

  // 5) Inga koordinater alls.
  if (!hasCoords) {
    return { label: 'Okänd plats – saknar koordinat', source: 'no_coords' };
  }

  // 4) Lookup misslyckades.
  if (lookupState === 'error') {
    return { label: 'Okänd plats – adress kunde inte hämtas', source: 'failed' };
  }

  // 3) Koordinater finns men inget svar än → pending.
  return { label: 'Slår upp adress…', source: 'pending' };
}
