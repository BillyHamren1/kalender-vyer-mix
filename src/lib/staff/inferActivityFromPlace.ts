/**
 * inferActivityFromPlace — försiktig tolkning av vad ett GPS-kluster kan ha
 * varit, baserat på POI-kategori, vistelselängd och om det matchade en
 * intern känd plats. UI ska aldrig låtsas veta säkert — orden "Trolig",
 * "Möjlig" och "Kräver granskning" är medvetet valda.
 */

export type InferredActivityType =
  | 'warehouse'        // Trolig lageraktivitet
  | 'project_visit'    // Troligt projektbesök / kundbesök
  | 'break_stop'       // Möjligt stopp/paus (mat, bensin, kafé)
  | 'short_stop'       // Kort stopp (parkering / väg / under några minuter)
  | 'travel'           // Möjlig resa (mellan två arbetsplatser)
  | 'long_unknown'     // Okänd vistelse — kräver granskning
  | 'unknown';

export type InferredConfidence = 'low' | 'medium' | 'high';

export interface PlaceInferenceInput {
  knownSiteId: string | null;
  /** Kategori-sträng från Mapbox (kan vara "fuel,gas_station" mm). */
  poiCategory: string | null;
  poiName: string | null;
  durationMin: number;
  /** Är klustret omgivet av andra arbetsplatser (true → travel-hint)? */
  betweenWorkplaces?: boolean;
}

export interface PlaceInference {
  type: InferredActivityType;
  /** Försiktig svensk text, t.ex. "troligt projektbesök". */
  label: string;
  confidence: InferredConfidence;
  /** Källa: 'known_site' | 'poi' | 'duration' | 'travel_context' | 'fallback'. */
  source: string;
}

const BREAK_CATEGORIES = [
  'fuel', 'gas', 'gas_station', 'petrol',
  'fast_food', 'restaurant', 'cafe', 'food', 'food_and_drink',
  'grocery', 'supermarket', 'convenience',
];

const SHORT_STOP_CATEGORIES = [
  'parking', 'parking_lot', 'rest_area',
];

function categoryMatches(cat: string | null, needles: string[]): boolean {
  if (!cat) return false;
  const lc = cat.toLowerCase();
  return needles.some(n => lc.includes(n));
}

export function inferActivityFromPlace(input: PlaceInferenceInput): PlaceInference {
  const { knownSiteId, poiCategory, poiName, durationMin, betweenWorkplaces } = input;

  // 1. Intern matchning vinner alltid.
  if (knownSiteId) {
    if (knownSiteId.startsWith('location:') || knownSiteId === 'lager' || /lager/i.test(knownSiteId)) {
      return { type: 'warehouse', label: 'trolig lageraktivitet', confidence: 'high', source: 'known_site' };
    }
    if (knownSiteId.startsWith('booking:') || knownSiteId.startsWith('large_project:')) {
      return { type: 'project_visit', label: 'troligt projektbesök', confidence: 'high', source: 'known_site' };
    }
    return { type: 'project_visit', label: 'troligt projektbesök', confidence: 'medium', source: 'known_site' };
  }

  // 2. POI-kategori.
  if (categoryMatches(poiCategory, BREAK_CATEGORIES)) {
    return {
      type: 'break_stop',
      label: poiName ? `möjligt stopp/paus (${poiName})` : 'möjligt stopp/paus',
      confidence: 'medium',
      source: 'poi',
    };
  }
  if (categoryMatches(poiCategory, SHORT_STOP_CATEGORIES)) {
    return { type: 'short_stop', label: 'kort stopp', confidence: 'medium', source: 'poi' };
  }

  // 3. Travel-kontext (mellan två arbetsplatser och kort).
  if (betweenWorkplaces && durationMin <= 20) {
    return { type: 'travel', label: 'möjlig resa', confidence: 'low', source: 'travel_context' };
  }

  // 4. Varaktighetsbaserad fallback.
  if (durationMin < 10) {
    return { type: 'short_stop', label: 'kort okänd vistelse', confidence: 'low', source: 'duration' };
  }
  if (durationMin >= 30) {
    return {
      type: 'long_unknown',
      label: 'okänd vistelse – kräver granskning',
      confidence: 'low',
      source: 'duration',
    };
  }

  return { type: 'unknown', label: 'okänd vistelse', confidence: 'low', source: 'fallback' };
}
