// Location batch compressor
// ------------------------------------------------------------------
// Smart komprimering INNAN upload till backend. Telefonen får
// fortsätta observera GPS högfrekvent, men backend ska bara få
// representativa, bevisande punkter.
//
// Regler (kort):
//   1. Stillastående (≤50 m mellan flera punkter):
//      → behåll första + sista, samt en "heartbeat" max var 10:e minut.
//   2. Rörelse (>50 m mellan punkter):
//      → behåll första + sista i rörelsen,
//        representativa punkter ungefär var 5:e minut,
//        samt punkter vid större positionshopp (>200 m).
//   3. Manuella/geofence/foreground-punkter behålls alltid
//      (de är användardrivna och kostar inget extra).
//
// Komprimeringen rör ALDRIG den lokala kön. Den väljer bara vilka
// id:n som ska skickas i nästa batch. Resten markeras som
// "covered" och rensas ur kön när servern accepterat batchen.
// ------------------------------------------------------------------

export interface CompressInput {
  id: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  source: string;
}

export interface CompressResult {
  /** ids att faktiskt skicka till backend. */
  selectedIds: Set<string>;
  /** ids vars bevis täcks av batchen (= alla input-ids). */
  coveredIds: Set<string>;
  /** Per-id source-override som beskriver komprimeringsklassen. */
  sourceOverrides: Map<string, 'compressed_stay' | 'compressed_move'>;
  stats: {
    inputCount: number;
    outputCount: number;
    stayGroups: number;
    moveGroups: number;
    compressionRatio: number;
  };
}

const STAY_RADIUS_M = 50;
const MOVE_REP_INTERVAL_MS = 5 * 60_000;
const STAY_HEARTBEAT_MS = 10 * 60_000;
/** När upload-policy är batch_inside_geofence vill vi bevara fler punkter. */
const STAY_HEARTBEAT_INSIDE_GEOFENCE_MS = 2 * 60_000;
const LARGE_JUMP_M = 200;

/**
 * Källor som ALDRIG får komprimeras bort — antingen användardrivna eller
 * explicita signal-händelser (geofence enter/exit, location_ping, gps_pulse,
 * heartbeat). Att smälla bort en av dessa skulle förstöra bevisspåret.
 */
const PRESERVE_SOURCES = new Set([
  'manual',
  'geofence',
  'foreground',
  'location_ping',
  'gps_pulse',
  'heartbeat',
]);


function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function tsMs(iso: string): number {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export interface CompressOptions {
  /** Aktuell upload-policy. Påverkar hur tätt stay-punkter bevaras. */
  uploadMode?:
    | 'batch_inside_geofence'
    | 'boundary_guard'
    | 'moving_outside_known_geofence'
    | 'outside_idle'
    | 'default';
}

export function compressLocationBatch(
  points: CompressInput[],
  options: CompressOptions = {},
): CompressResult {
  const sourceOverrides = new Map<string, 'compressed_stay' | 'compressed_move'>();
  const selected = new Set<string>();
  let stayGroups = 0;
  let moveGroups = 0;

  if (points.length === 0) {
    return {
      selectedIds: selected,
      coveredIds: new Set(),
      sourceOverrides,
      stats: { inputCount: 0, outputCount: 0, stayGroups: 0, moveGroups: 0, compressionRatio: 1 },
    };
  }

  const sorted = [...points].sort((a, b) => tsMs(a.recordedAt) - tsMs(b.recordedAt));
  const covered = new Set(sorted.map(p => p.id));

  let i = 0;
  while (i < sorted.length) {
    const anchor = sorted[i];

    // Försök sträcka en stay-grupp så långt som efterföljande punkter
    // ligger inom STAY_RADIUS_M från ankaret.
    let j = i;
    while (
      j + 1 < sorted.length &&
      haversineMeters(
        anchor.latitude, anchor.longitude,
        sorted[j + 1].latitude, sorted[j + 1].longitude,
      ) <= STAY_RADIUS_M
    ) {
      j++;
    }

    if (j > i) {
      // STAY-grupp [i..j]
      stayGroups++;
      selected.add(sorted[i].id);
      sourceOverrides.set(sorted[i].id, 'compressed_stay');
      selected.add(sorted[j].id);
      sourceOverrides.set(sorted[j].id, 'compressed_stay');

      // När appen är inom geofence och samlar batch ska fler
      // mellanpunkter bevaras (2 min) så vi ser rörelsen inne på
      // platsen. Annars klassisk 10-min-heartbeat.
      const stayHeartbeatMs =
        options.uploadMode === 'batch_inside_geofence'
          ? STAY_HEARTBEAT_INSIDE_GEOFENCE_MS
          : STAY_HEARTBEAT_MS;
      let lastHeartbeat = tsMs(sorted[i].recordedAt);
      for (let k = i + 1; k < j; k++) {
        const t = tsMs(sorted[k].recordedAt);
        if (t - lastHeartbeat >= stayHeartbeatMs) {
          selected.add(sorted[k].id);
          sourceOverrides.set(sorted[k].id, 'compressed_stay');
          lastHeartbeat = t;
        }
      }
      i = j + 1;
    } else {
      // MOVE — minst ett tydligt hopp mellan i och i+1.
      moveGroups++;
      selected.add(anchor.id);
      sourceOverrides.set(anchor.id, 'compressed_move');
      let lastRep = tsMs(anchor.recordedAt);
      let k = i;
      while (k + 1 < sorted.length) {
        const d = haversineMeters(
          sorted[k].latitude, sorted[k].longitude,
          sorted[k + 1].latitude, sorted[k + 1].longitude,
        );
        if (d <= STAY_RADIUS_M) break;
        k++;
        const t = tsMs(sorted[k].recordedAt);
        if (d >= LARGE_JUMP_M || t - lastRep >= MOVE_REP_INTERVAL_MS) {
          selected.add(sorted[k].id);
          sourceOverrides.set(sorted[k].id, 'compressed_move');
          lastRep = t;
        }
      }
      // Slutpunkt i rörelsen behålls alltid.
      selected.add(sorted[k].id);
      if (!sourceOverrides.has(sorted[k].id)) {
        sourceOverrides.set(sorted[k].id, 'compressed_move');
      }
      i = k + 1;
    }
  }

  // Användardrivna källor är aldrig brusiga — behåll alltid.
  for (const p of sorted) {
    if (PRESERVE_SOURCES.has(p.source)) {
      selected.add(p.id);
    }
  }

  return {
    selectedIds: selected,
    coveredIds: covered,
    sourceOverrides,
    stats: {
      inputCount: sorted.length,
      outputCount: selected.size,
      stayGroups,
      moveGroups,
      compressionRatio: sorted.length === 0 ? 1 : selected.size / sorted.length,
    },
  };
}
