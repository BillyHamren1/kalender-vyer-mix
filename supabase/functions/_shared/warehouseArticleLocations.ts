// Shared (Deno + Vite) contract for warehouse-article-locations.v1.
// Root-owned contract: Bundle time-wms-outbound/outbound/article-locations.
// Pure module: no Deno/browser globals besides fetch + WebCrypto.
import { hmacSha256Hex, type TimeWmsActor } from './timeWmsProjection.ts';

export const ARTICLE_LOCATIONS_URL =
  'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/time-wms-outbound/outbound/article-locations';
export const ARTICLE_LOCATIONS_REQUEST_SCHEMA = 'warehouse-article-locations-request.v1' as const;
export const ARTICLE_LOCATIONS_RESPONSE_SCHEMA = 'warehouse-article-locations.v1' as const;

/** Hard caps — exceeding any of these fails visibly (never silently truncated). */
export const ARTICLE_LOCATIONS_LIMITS = {
  placements: 500,
  maps: 20,
  racksPerMap: 600,
  areasPerMap: 200,
  portalsPerMap: 100,
  baysPerRack: 200,
  levelsPerBay: 50,
  maxPositions: 500,
  maxMeters: 10_000,
  maxStringLength: 300,
  maxRawBytes: 2_000_000,
} as const;

export type ArticleLocationStatus = 'PLACED' | 'UNPLACED' | 'UNKNOWN';
export type PlacementState = 'EXACT' | 'PALLET_UNPLACED' | 'SLOT_MISSING';

export interface ArticleSlot {
  mapId: string; rackId: string; bayId: string; level: number; position: number; depth: number;
}
export interface ArticlePlacement {
  palletId: string; palletCode: string; palletName: string; quantity: number;
  instanceId: string | null; state: PlacementState; slot: ArticleSlot | null;
  address: string | null; rackName: string | null; bayLabel: string | null;
}
export interface RectGeometry { xM: number; yM: number; widthM: number; depthM: number }
export interface RackStorage {
  version: 1; status: 'provisional' | 'verified';
  bays: { id: string; label: string; levels: { level: number; positions: number; depths: number }[] }[];
}
export interface WarehouseRack {
  id: string; name: string; color: string; geometry: RectGeometry | null; storage?: RackStorage;
}
export interface WarehouseMap {
  id: string; name: string; hall: { widthM: number; depthM: number };
  racks: WarehouseRack[];
  areas: { id: string; name: string; geometry: RectGeometry }[];
  portals: { id: string; name: string; xM: number; yM: number; widthM: number; axis: 'x' | 'y' }[];
}
export interface ArticleLocationsResponse {
  schema: typeof ARTICLE_LOCATIONS_RESPONSE_SCHEMA;
  organizationId: string; itemTypeId: string; instanceId: string | null;
  article: { name: string; sku: string | null };
  status: ArticleLocationStatus;
  placements: ArticlePlacement[];
  maps: WarehouseMap[];
  serverTimestamp: string;
}

export interface ArticleLocationsRequest {
  schema: typeof ARTICLE_LOCATIONS_REQUEST_SCHEMA;
  deviceId: string;
  actor: TimeWmsActor;
  itemTypeId: string;
  instanceId?: string;
}

export type ArticleLocationsErrorCode =
  | 'invalid_request'
  | 'wms_not_configured'
  | 'wms_unavailable'
  | 'wms_forbidden'
  | 'not_found'
  | 'wms_bad_response'
  | 'response_too_large'
  | 'organization_mismatch';

export type ArticleLocationsResult =
  | { ok: true; data: ArticleLocationsResponse }
  | { ok: false; code: ArticleLocationsErrorCode; error: string; status: number; upstreamCode?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export function buildArticleLocationsRequest(input: {
  deviceId: string; actor: TimeWmsActor; itemTypeId: string; instanceId?: string | null;
}): ArticleLocationsRequest {
  const req: ArticleLocationsRequest = {
    schema: ARTICLE_LOCATIONS_REQUEST_SCHEMA,
    deviceId: input.deviceId,
    actor: {
      organizationId: input.actor.organizationId,
      personnelId: input.actor.personnelId,
      label: input.actor.label,
    },
    itemTypeId: input.itemTypeId,
  };
  if (input.instanceId) req.instanceId = input.instanceId;
  return req;
}

export function validateArticleLocationsRequest(req: ArticleLocationsRequest): string | null {
  if (!isUuid(req.itemTypeId)) return 'itemTypeId måste vara ett giltigt UUID';
  if (req.instanceId !== undefined && !isUuid(req.instanceId)) return 'instanceId måste vara ett giltigt UUID';
  if (!req.deviceId || req.deviceId.length > 128) return 'deviceId saknas eller är för långt';
  if (!req.actor.organizationId || !req.actor.personnelId || !req.actor.label) return 'Verifierad aktör saknas';
  return null;
}

// ─────────────────────────── response validation ───────────────────────────
class ContractError extends Error {
  constructor(message: string, public code: 'wms_bad_response' | 'response_too_large' | 'organization_mismatch' = 'wms_bad_response') {
    super(message);
  }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || v.length === 0 || v.length > ARTICLE_LOCATIONS_LIMITS.maxStringLength) {
    throw new ContractError(`${path} ogiltig text`);
  }
  return v;
};
const strOrNull = (v: unknown, path: string): string | null => (v === null || v === undefined ? null : str(v, path));
const num = (v: unknown, path: string, min = 0, max: number = ARTICLE_LOCATIONS_LIMITS.maxMeters): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ContractError(`${path} ogiltigt tal`);
  return v;
};
const int = (v: unknown, path: string, min: number, max: number): number => {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) throw new ContractError(`${path} måste vara heltal`);
  return n;
};
const arr = (v: unknown, path: string, cap: number): unknown[] => {
  if (!Array.isArray(v)) throw new ContractError(`${path} saknas`);
  if (v.length > cap) throw new ContractError(`${path} överskrider gränsen ${cap}`, 'response_too_large');
  return v;
};
const rect = (v: unknown, path: string): RectGeometry => {
  if (!isObj(v)) throw new ContractError(`${path} saknas`);
  return {
    xM: num(v.xM, `${path}.xM`), yM: num(v.yM, `${path}.yM`),
    widthM: num(v.widthM, `${path}.widthM`), depthM: num(v.depthM, `${path}.depthM`),
  };
};

function parseRack(v: unknown, p: string): WarehouseRack {
  if (!isObj(v)) throw new ContractError(`${p} ogiltig`);
  const rack: WarehouseRack = {
    id: str(v.id, `${p}.id`), name: str(v.name, `${p}.name`), color: str(v.color, `${p}.color`),
    geometry: v.geometry === null || v.geometry === undefined ? null : rect(v.geometry, `${p}.geometry`),
  };
  if (v.storage !== undefined && v.storage !== null) {
    const s = v.storage;
    if (!isObj(s) || s.version !== 1 || (s.status !== 'provisional' && s.status !== 'verified')) {
      throw new ContractError(`${p}.storage ogiltig`);
    }
    rack.storage = {
      version: 1, status: s.status,
      bays: arr(s.bays, `${p}.storage.bays`, ARTICLE_LOCATIONS_LIMITS.baysPerRack).map((b, bi) => {
        if (!isObj(b)) throw new ContractError(`${p}.bays[${bi}] ogiltig`);
        return {
          id: str(b.id, `${p}.bays[${bi}].id`), label: str(b.label, `${p}.bays[${bi}].label`),
          levels: arr(b.levels, `${p}.bays[${bi}].levels`, ARTICLE_LOCATIONS_LIMITS.levelsPerBay).map((l, li) => {
            if (!isObj(l)) throw new ContractError(`${p}.levels[${li}] ogiltig`);
            return {
              level: int(l.level, `${p}.level`, 1, ARTICLE_LOCATIONS_LIMITS.levelsPerBay),
              positions: int(l.positions, `${p}.positions`, 1, ARTICLE_LOCATIONS_LIMITS.maxPositions),
              depths: int(l.depths, `${p}.depths`, 1, ARTICLE_LOCATIONS_LIMITS.maxPositions),
            };
          }),
        };
      }),
    };
  }
  return rack;
}

function parseMap(v: unknown, p: string): WarehouseMap {
  if (!isObj(v) || !isObj(v.hall)) throw new ContractError(`${p} ogiltig`);
  return {
    id: str(v.id, `${p}.id`), name: str(v.name, `${p}.name`),
    hall: { widthM: num(v.hall.widthM, `${p}.hall.widthM`, 0.1), depthM: num(v.hall.depthM, `${p}.hall.depthM`, 0.1) },
    racks: arr(v.racks, `${p}.racks`, ARTICLE_LOCATIONS_LIMITS.racksPerMap).map((r, i) => parseRack(r, `${p}.racks[${i}]`)),
    areas: arr(v.areas, `${p}.areas`, ARTICLE_LOCATIONS_LIMITS.areasPerMap).map((a, i) => {
      if (!isObj(a)) throw new ContractError(`${p}.areas[${i}] ogiltig`);
      return { id: str(a.id, 'area.id'), name: str(a.name, 'area.name'), geometry: rect(a.geometry, 'area.geometry') };
    }),
    portals: arr(v.portals, `${p}.portals`, ARTICLE_LOCATIONS_LIMITS.portalsPerMap).map((o, i) => {
      if (!isObj(o) || (o.axis !== 'x' && o.axis !== 'y')) throw new ContractError(`${p}.portals[${i}] ogiltig`);
      return {
        id: str(o.id, 'portal.id'), name: str(o.name, 'portal.name'),
        xM: num(o.xM, 'portal.xM'), yM: num(o.yM, 'portal.yM'), widthM: num(o.widthM, 'portal.widthM'), axis: o.axis,
      };
    }),
  };
}

function parsePlacement(v: unknown, p: string): ArticlePlacement {
  if (!isObj(v)) throw new ContractError(`${p} ogiltig`);
  const state = v.state;
  if (state !== 'EXACT' && state !== 'PALLET_UNPLACED' && state !== 'SLOT_MISSING') throw new ContractError(`${p}.state ogiltig`);
  let slot: ArticleSlot | null = null;
  if (v.slot !== null && v.slot !== undefined) {
    const s = v.slot;
    if (!isObj(s)) throw new ContractError(`${p}.slot ogiltig`);
    slot = {
      mapId: str(s.mapId, 'slot.mapId'), rackId: str(s.rackId, 'slot.rackId'), bayId: str(s.bayId, 'slot.bayId'),
      level: int(s.level, 'slot.level', 1, ARTICLE_LOCATIONS_LIMITS.levelsPerBay),
      position: int(s.position, 'slot.position', 1, ARTICLE_LOCATIONS_LIMITS.maxPositions),
      depth: int(s.depth, 'slot.depth', 1, ARTICLE_LOCATIONS_LIMITS.maxPositions),
    };
  }
  if (state === 'EXACT' && !slot) throw new ContractError(`${p}: EXACT kräver slot`);
  const instanceId = v.instanceId === null || v.instanceId === undefined ? null : v.instanceId;
  if (instanceId !== null && !isUuid(instanceId)) throw new ContractError(`${p}.instanceId ogiltig`);
  return {
    palletId: str(v.palletId, 'palletId'), palletCode: str(v.palletCode, 'palletCode'),
    palletName: str(v.palletName, 'palletName'),
    quantity: num(v.quantity, 'quantity', 0, 10_000_000),
    instanceId, state, slot,
    address: strOrNull(v.address, 'address'), rackName: strOrNull(v.rackName, 'rackName'),
    bayLabel: strOrNull(v.bayLabel, 'bayLabel'),
  };
}

/** Status per contract: PLACED ≥1 EXACT; UNKNOWN only invalid/missing; else UNPLACED. */
export function deriveArticleStatus(placements: Pick<ArticlePlacement, 'state'>[]): ArticleLocationStatus {
  if (placements.some((p) => p.state === 'EXACT')) return 'PLACED';
  if (placements.some((p) => p.state === 'SLOT_MISSING')) return 'UNKNOWN';
  return 'UNPLACED';
}

export function parseArticleLocationsResponse(
  value: unknown,
  expected: { organizationId: string; itemTypeId: string; instanceId: string | null },
): ArticleLocationsResult {
  try {
    if (!isObj(value) || value.schema !== ARTICLE_LOCATIONS_RESPONSE_SCHEMA) {
      throw new ContractError('Fel schema i lagrets svar');
    }
    if (value.organizationId !== expected.organizationId) {
      throw new ContractError('Svaret tillhör en annan organisation', 'organization_mismatch');
    }
    if (value.itemTypeId !== expected.itemTypeId) throw new ContractError('Svaret gäller en annan artikel');
    const instanceId = value.instanceId ?? null;
    if (instanceId !== expected.instanceId) throw new ContractError('Svaret gäller en annan enhet');
    if (!isObj(value.article)) throw new ContractError('article saknas');
    const status = value.status;
    if (status !== 'PLACED' && status !== 'UNPLACED' && status !== 'UNKNOWN') throw new ContractError('status ogiltig');
    const placements = arr(value.placements, 'placements', ARTICLE_LOCATIONS_LIMITS.placements)
      .map((pl, i) => parsePlacement(pl, `placements[${i}]`));
    if (expected.instanceId && placements.some((pl) => pl.instanceId !== expected.instanceId)) {
      throw new ContractError('Svaret innehåller platser för andra enheter än den skannade');
    }
    const maps = arr(value.maps, 'maps', ARTICLE_LOCATIONS_LIMITS.maps).map((m, i) => parseMap(m, `maps[${i}]`));
    const mapIds = new Set(maps.map((m) => m.id));
    for (const pl of placements) {
      if (pl.state === 'EXACT' && !mapIds.has(pl.slot!.mapId)) throw new ContractError('EXACT-plats saknar karta');
    }
    if (deriveArticleStatus(placements) !== status) throw new ContractError('status stämmer inte med platserna');
    const ts = value.serverTimestamp;
    if (typeof ts !== 'string' || Number.isNaN(Date.parse(ts))) throw new ContractError('serverTimestamp ogiltig');
    return {
      ok: true,
      data: {
        schema: ARTICLE_LOCATIONS_RESPONSE_SCHEMA,
        organizationId: expected.organizationId,
        itemTypeId: expected.itemTypeId,
        instanceId,
        article: { name: str(value.article.name, 'article.name'), sku: strOrNull(value.article.sku, 'article.sku') },
        status, placements, maps, serverTimestamp: ts,
      },
    };
  } catch (e) {
    const err = e instanceof ContractError ? e : new ContractError('Lagrets svar kunde inte tolkas');
    return { ok: false, code: err.code, error: err.message, status: 502 };
  }
}

const UPSTREAM_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

export async function fetchArticleLocations(
  request: ArticleLocationsRequest,
  deps: { hmacSecret: string; fetchImpl?: typeof fetch; endpoint?: string; now?: () => Date; nonce?: () => string },
): Promise<ArticleLocationsResult> {
  if (!deps.hmacSecret) return { ok: false, code: 'wms_not_configured', error: 'Lagerkopplingen är inte konfigurerad', status: 503 };
  const invalid = validateArticleLocationsRequest(request);
  if (invalid) return { ok: false, code: 'invalid_request', error: invalid, status: 400 };

  const rawBody = JSON.stringify(request);
  const timestamp = (deps.now?.() ?? new Date()).toISOString();
  const nonce = (deps.nonce?.() ?? crypto.randomUUID()).replace(/-/g, '');
  const signature = await hmacSha256Hex(deps.hmacSecret, `${timestamp}.${nonce}.${rawBody}`);

  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(deps.endpoint ?? ARTICLE_LOCATIONS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        'x-time-timestamp': timestamp, 'x-time-nonce': nonce, 'x-time-signature': signature,
      },
      body: rawBody,
    });
  } catch {
    return { ok: false, code: 'wms_unavailable', error: 'Lagersystemet svarade inte', status: 503 };
  }
  const raw = await response.text().catch(() => '');
  if (raw.length > ARTICLE_LOCATIONS_LIMITS.maxRawBytes) {
    return { ok: false, code: 'response_too_large', error: 'Lagrets svar är för stort', status: 502 };
  }
  let parsed: unknown = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    const body = isObj(parsed) ? parsed : {};
    const upstreamCode = typeof body.code === 'string' && UPSTREAM_CODE_RE.test(body.code) ? body.code : undefined;
    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: 'wms_forbidden', error: 'Lagret nekade åtkomst', status: 403, upstreamCode };
    }
    if (response.status === 404) {
      return { ok: false, code: 'not_found', error: 'Artikeln eller enheten finns inte i din organisation', status: 404, upstreamCode };
    }
    if (response.status === 413) {
      return { ok: false, code: 'response_too_large', error: 'För många platser att visa', status: 502, upstreamCode };
    }
    if (response.status === 400 || response.status === 422) {
      return { ok: false, code: 'invalid_request', error: 'Lagret avvisade förfrågan', status: 400, upstreamCode };
    }
    return { ok: false, code: 'wms_unavailable', error: `Lagersystemet svarade med fel (${response.status})`, status: 503, upstreamCode };
  }
  return parseArticleLocationsResponse(parsed, {
    organizationId: request.actor.organizationId,
    itemTypeId: request.itemTypeId,
    instanceId: request.instanceId ?? null,
  });
}
