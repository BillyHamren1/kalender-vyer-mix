/** Planning pass-through for Bundle's signed, read-only Scanner projection. */
export const SCANNER_BUNDLE_PROJECTION_REQUEST_SCHEMA =
  "eventflow-scanner-bundle-projection-request.v1" as const;
export const SCANNER_BUNDLE_PROJECTION_SCHEMA =
  "eventflow-scanner-bundle-projection.v1" as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_RE = /^[0-9a-f]{64}$/i;
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const uuid = (value: unknown) => typeof value === "string" && UUID_RE.test(value)
  ? value.toLowerCase() : null;
const nonNegative = (value: unknown) => typeof value === "number" &&
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const hex = (bytes: Uint8Array) => Array.from(bytes)
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function signature(secret: string, timestamp: string, nonce: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return `v1=${hex(new Uint8Array(await crypto.subtle.sign(
    "HMAC", key, new TextEncoder().encode(`${timestamp}.${nonce}.${body}`)
  )))}`;
}

export interface ScannerBundleProjectionDeps {
  readonly baseUrl: string;
  readonly secret: string;
  readonly organizationId: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly nonce?: () => string;
}

export type ScannerBundleProjection =
  | { ok: false; code: string; error: string }
  | {
      ok: true;
      reservationId: string;
      bookingId: string;
      snapshotFingerprint: string;
      snapshotMonotonic: false;
      operationalStatus: { rawReservationStatus: string | null; active: null; released: null };
      returnState: { authoritative: false; returnedQuantity: null };
      blockers: Array<{ code: string; entityId: string | null }>;
      lines: Array<{
        reservationLineId: string | null;
        parentReservationLineId: string;
        packageId: string | null;
        packageComponentId: string | null;
        inventoryTypeId: string;
        quantityReserved: number;
        quantityPicked: number;
        quantityReturned: null;
        allocatedInstanceIds: string[];
      }>;
    };

const failure = (code: string, error: string): ScannerBundleProjection => ({ ok: false, code, error });

export async function fetchScannerBundleProjection(
  bookingIdInput: string,
  deps: ScannerBundleProjectionDeps,
): Promise<ScannerBundleProjection> {
  const bookingId = uuid(bookingIdInput);
  const organizationId = uuid(deps.organizationId);
  if (!bookingId || !organizationId) return failure("invalid_canonical_id", "Canonical Booking/tenant ID required");
  if (!deps.secret || deps.secret.length < 32) return failure("bundle_signing_unavailable", "Bundle signing secret unavailable");
  if (!/^https:\/\//.test(deps.baseUrl)) return failure("bundle_url_invalid", "Bundle URL must use HTTPS");

  const rawBody = JSON.stringify({
    schema: SCANNER_BUNDLE_PROJECTION_REQUEST_SCHEMA,
    organizationId,
    bookingId,
  });
  const timestamp = String((deps.now ?? Date.now)());
  const nonce = (deps.nonce ?? (() => crypto.randomUUID()))();
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(
      `${deps.baseUrl.replace(/\/$/, "")}/eventflow-scanner-projection-v1`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-scanner-timestamp": timestamp,
          "x-scanner-nonce": nonce,
          "x-scanner-signature": await signature(deps.secret, timestamp, nonce, rawBody),
        },
        body: rawBody,
      },
    );
  } catch (error) {
    return failure("bundle_unavailable", error instanceof Error ? error.message : "network_error");
  }
  const text = await response.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return failure("bundle_bad_response", "Bundle returned invalid JSON"); }
  const body = record(parsed);
  if (!response.ok || !body) {
    return failure("bundle_unavailable", typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
  }
  const identity = record(body.canonicalIdentity);
  const snapshot = record(body.snapshot);
  const operational = record(body.operationalStatus);
  const returnState = record(body.returnState);
  const reservationId = uuid(identity?.reservationId);
  if (body.schema !== SCANNER_BUNDLE_PROJECTION_SCHEMA ||
      uuid(identity?.organizationId) !== organizationId || uuid(identity?.bookingId) !== bookingId ||
      !reservationId || snapshot?.kind !== "CONTENT_SHA256" || snapshot?.monotonic !== false ||
      typeof snapshot.fingerprint !== "string" || !SHA_RE.test(snapshot.fingerprint) ||
      operational?.active !== null || operational?.released !== null ||
      returnState?.authoritative !== false || returnState?.returnedQuantity !== null ||
      !Array.isArray(body.lines) || !Array.isArray(body.blockers)) {
    return failure("bundle_bad_response", "Bundle projection contract mismatch");
  }

  const blockers: Array<{ code: string; entityId: string | null }> = [];
  for (const value of body.blockers) {
    const blocker = record(value);
    if (!blocker || typeof blocker.code !== "string" ||
        !(blocker.entityId === null || uuid(blocker.entityId))) {
      return failure("bundle_bad_response", "Invalid Bundle blocker");
    }
    blockers.push({ code: blocker.code, entityId: blocker.entityId === null ? null : uuid(blocker.entityId)! });
  }

  const lines: Extract<ScannerBundleProjection, { ok: true }>["lines"] = [];
  const seen = new Set<string>();
  for (const value of body.lines) {
    const line = record(value);
    const parentReservationLineId = uuid(line?.reservationLineId);
    const packageId = line?.packageId === null ? null : uuid(line?.packageId);
    if (!line || !parentReservationLineId || !Array.isArray(line.physicalLines) ||
        !(line.packageId === null || packageId)) {
      return failure("bundle_bad_response", "Invalid Bundle reservation line");
    }
    for (const physicalValue of line.physicalLines) {
      const physical = record(physicalValue);
      const componentId = physical?.packageComponentId === null ? null : uuid(physical?.packageComponentId);
      const inventoryTypeId = uuid(physical?.inventoryTypeId);
      const required = nonNegative(physical?.requiredQuantity);
      const picked = nonNegative(physical?.packedQuantity);
      if (!physical || !inventoryTypeId || required === null || picked === null || picked > required ||
          physical.returnedQuantity !== null || !Array.isArray(physical.allocatedInstanceIds) ||
          !(physical.packageComponentId === null || componentId)) {
        return failure("bundle_bad_response", "Invalid Bundle physical line");
      }
      const instanceIds = physical.allocatedInstanceIds.map(uuid);
      if (instanceIds.some((id) => !id)) return failure("bundle_bad_response", "Invalid allocated instance identity");
      const reservationLineId = componentId === null ? parentReservationLineId : null;
      const key = JSON.stringify([parentReservationLineId, componentId, inventoryTypeId]);
      if (seen.has(key)) return failure("bundle_duplicate_physical_identity", "Duplicate Bundle physical identity");
      seen.add(key);
      lines.push({
        reservationLineId,
        parentReservationLineId,
        packageId,
        packageComponentId: componentId,
        inventoryTypeId,
        quantityReserved: required,
        quantityPicked: picked,
        quantityReturned: null,
        allocatedInstanceIds: instanceIds as string[],
      });
    }
  }
  return {
    ok: true,
    reservationId,
    bookingId,
    snapshotFingerprint: String(snapshot.fingerprint).toLowerCase(),
    snapshotMonotonic: false,
    operationalStatus: {
      rawReservationStatus: typeof operational.rawReservationStatus === "string"
        ? operational.rawReservationStatus : null,
      active: null,
      released: null,
    },
    returnState: { authoritative: false, returnedQuantity: null },
    blockers,
    lines,
  };
}
