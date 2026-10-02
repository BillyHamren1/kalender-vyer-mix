/** Protected native Catering evidence → Operations shadow publication.
 * No caller-supplied source document, Time identity conversion or rate engine.
 * Source routes/maps are server-resolved and immutable observations persist later. */
import {
  calculateCateringPersonnelEvidence,
  fingerprintCateringSource,
  type CateringPersonnelEvidence,
  type CateringProjectBinding,
  type CateringTimeEntry,
  type CateringTimeReview,
} from "./catering-project-evidence.ts";
import { type HistoricalPersonnelRate } from "./project-personnel-cost.ts";
import { deriveSigningKeyFromSeed, base64url } from "./timeServiceProof.ts";
import {
  rawBodySha256,
  readBoundedBody,
} from "./project-personnel-ingestion-transport.ts";
export interface CateringSourceBinding {
  organization_id: string;
  worker_id: string;
  catering_organization_id: string;
  catering_person_id: string;
  endpoint_url: string;
  key_id: string;
  enabled: boolean;
}
export interface CateringEntryRead {
  schema: "catering-project-economy-read-response.v1";
  entry: CateringTimeEntry;
  review: CateringTimeReview | null;
  rawEntry: string;
  rawEntrySha256: string;
  rawReview: string | null;
  rawReviewSha256: string | null;
  metadata: {
    organizationId: string;
    personId: string;
    timeEntryId: string;
    entryVersion: number;
    currentVersion: number;
    workplaceId: string;
  };
  proofReceipt: {
    issuer: "eventflow-operations";
    audience: "eventflow-catering-project-economy-read";
    keyId: string;
    nonce: string;
    requestBodySha256: string;
  };
}
export interface CateringResolvedAllocation {
  organization_id: string;
  catering_organization_id: string;
  catering_person_id: string;
  time_entry_id: string;
  workplace_id: string;
  work_date: string;
  time_zone: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  mapping_revision: string;
  /** Each source entry is mapped explicitly, never inferred from workplace/name. */
  enabled: boolean;
}
export interface CateringCurrentPublication {
  current_revision: number;
  evidence: CateringPersonnelEvidence | null;
  raw_entry: string | null;
  raw_review: string | null;
}
const fail: (code: string) => never = (code) => {
  throw new Error(code);
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const int = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function trustedCateringReadEndpoint(value: string): string {
  if (typeof value !== "string") fail("invalid_catering_endpoint");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/project-economy-read"
  )
    fail("invalid_catering_endpoint");
  return url.href;
}
export async function verifyCateringEntryRead(
  value: unknown,
  binding: CateringSourceBinding,
  entryId: string,
  version: number,
  attempt: { key_id: string; nonce: string; request_body_sha256: string },
): Promise<CateringEntryRead> {
  if (
    !object(value) ||
    binding.enabled !== true ||
    ![
      binding.organization_id,
      binding.worker_id,
      binding.catering_organization_id,
      binding.catering_person_id,
      entryId,
    ].every(uuid) ||
    !int(version, 1)
  )
    fail("invalid_catering_source_binding");
  const r = value as unknown as CateringEntryRead,
    m = r.metadata,
    p = r.proofReceipt;
  if (
    r.schema !== "catering-project-economy-read-response.v1" ||
    !object(r.entry) ||
    !object(m) ||
    !object(p) ||
    r.entry.organization_id !== binding.catering_organization_id ||
    r.entry.person_id !== binding.catering_person_id ||
    r.entry.id !== entryId ||
    r.entry.version !== version ||
    m.organizationId !== binding.catering_organization_id ||
    m.personId !== binding.catering_person_id ||
    m.timeEntryId !== entryId ||
    m.entryVersion !== version ||
    m.currentVersion !== version ||
    !uuid(m.workplaceId) ||
    m.workplaceId !== r.entry.workplace_id ||
    p.issuer !== "eventflow-operations" ||
    p.audience !== "eventflow-catering-project-economy-read" ||
    p.keyId !== binding.key_id ||
    p.keyId !== attempt.key_id ||
    p.nonce !== attempt.nonce ||
    p.requestBodySha256 !== attempt.request_body_sha256 ||
    typeof r.rawEntry !== "string" ||
    new TextEncoder().encode(r.rawEntry).byteLength > 1048576 ||
    !hash(r.rawEntrySha256) ||
    (await rawBodySha256(r.rawEntry)) !== r.rawEntrySha256 ||
    (await fingerprintCateringSource(JSON.parse(r.rawEntry))) !==
      (await fingerprintCateringSource(r.entry))
  )
    fail("unauthorized_or_stale_catering_read");
  if (r.review === null) {
    if (
      r.rawReview !== null ||
      r.rawReviewSha256 !== null ||
      r.entry.status === "approved"
    )
      fail("catering_review_evidence_missing");
  } else if (
    !object(r.review) ||
    r.review.organization_id !== binding.catering_organization_id ||
    r.review.time_entry_id !== entryId ||
    typeof r.rawReview !== "string" ||
    new TextEncoder().encode(r.rawReview).byteLength > 1048576 ||
    !hash(r.rawReviewSha256) ||
    (await rawBodySha256(r.rawReview)) !== r.rawReviewSha256 ||
    (await fingerprintCateringSource(JSON.parse(r.rawReview))) !==
      (await fingerprintCateringSource(r.review))
  )
    fail("catering_review_evidence_mismatch");
  return r;
}
export async function readAuthenticatedCateringEntry(
  binding: CateringSourceBinding,
  entryId: string,
  version: number,
  config: { endpoint: string; keyId: string; signingSeed: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CateringEntryRead> {
  if (
    trustedCateringReadEndpoint(config.endpoint) !==
      trustedCateringReadEndpoint(binding.endpoint_url) ||
    config.keyId !== binding.key_id ||
    typeof config.keyId !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(config.keyId) ||
    ![
      binding.organization_id,
      binding.worker_id,
      binding.catering_organization_id,
      binding.catering_person_id,
      entryId,
    ].every(uuid) ||
    binding.enabled !== true ||
    !int(version, 1)
  )
    fail("catering_source_route_mismatch");
  // Dedicated Catering signing seed; never pass TIME_ADAPTER_SIGNING_SEED here.
  const signer = await deriveSigningKeyFromSeed(config.signingSeed),
    iat = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    schema: "catering-project-economy-read.v1",
    operation: "time-entry.read",
    organizationId: binding.catering_organization_id,
    personId: binding.catering_person_id,
    timeEntryId: entryId,
    expectedVersion: version,
  });
  const nonce = crypto.randomUUID(),
    bodyHash = await rawBodySha256(body);
  const claims = {
    schema: "catering-project-economy-service-proof.v1",
    iss: "eventflow-operations",
    aud: "eventflow-catering-project-economy-read",
    purpose: "time-entry.read",
    operation: "time-entry.read",
    organizationId: binding.catering_organization_id,
    personId: binding.catering_person_id,
    timeEntryId: entryId,
    expectedVersion: version,
    method: "POST",
    route: "project-economy-read",
    iat,
    exp: iat + 60,
    nonce,
    bodySha256: bodyHash,
  };
  const part = (v: unknown) =>
    base64url(new TextEncoder().encode(JSON.stringify(v)));
  const unsigned =
    part({ alg: "ES256", typ: "JWT", kid: config.keyId }) + "." + part(claims);
  const proof =
    unsigned +
    "." +
    base64url(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        signer.key,
        new TextEncoder().encode(unsigned),
      ),
    );
  const response = await fetchImpl(config.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-project-economy-service-proof": proof,
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => {});
    fail("catering_read_http_" + response.status);
  }
  const bytes = await readBoundedBody(response.body, 2097152, 15000);
  return await verifyCateringEntryRead(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    binding,
    entryId,
    version,
    { key_id: config.keyId, nonce, request_body_sha256: bodyHash },
  );
}
/** Source payroll metadata/version is deliberately excluded from economic authority. */
export async function cateringEconomicFingerprint(
  evidence: CateringPersonnelEvidence,
): Promise<string> {
  return await rawBodySha256(
    JSON.stringify([
      evidence.organization_id,
      evidence.worker_id,
      evidence.project_id,
      evidence.obligation_id,
      evidence.currency,
      evidence.work_date,
      evidence.time_zone,
      evidence.source_organization_id,
      evidence.source_person_id,
      evidence.source_time_entry_id,
      evidence.minutes,
      evidence.rate_revision,
      evidence.hourly_rate_minor,
      evidence.amount_minor,
      evidence.coverage,
    ]),
  );
}
export async function buildCateringPublication(input: {
  read: CateringEntryRead;
  binding: CateringSourceBinding;
  allocation: CateringResolvedAllocation;
  current: CateringCurrentPublication;
  rates: readonly HistoricalPersonnelRate[];
}): Promise<{
  stream_id: string;
  evidence: CateringPersonnelEvidence;
  raw_entry: string;
  raw_review: string | null;
  expected_revision: number;
  idempotency_key: string;
} | null> {
  const { read, binding, allocation, current } = input;
  await verifyCateringEntryRead(
    read,
    binding,
    read.entry.id,
    read.entry.version,
    {
      key_id: read.proofReceipt.keyId,
      nonce: read.proofReceipt.nonce,
      request_body_sha256: read.proofReceipt.requestBodySha256,
    },
  );
  if (
    !int(current.current_revision) ||
    current.current_revision >= Number.MAX_SAFE_INTEGER
  )
    fail("publication_revision_exhausted");
  if (
    allocation.enabled !== true ||
    allocation.organization_id !== binding.organization_id ||
    allocation.catering_organization_id !== binding.catering_organization_id ||
    allocation.catering_person_id !== binding.catering_person_id ||
    allocation.time_entry_id !== read.entry.id ||
    allocation.workplace_id !== read.entry.workplace_id ||
    !uuid(allocation.project_id) ||
    !uuid(allocation.obligation_id)
  )
    fail("native_allocation_missing_or_foreign");
  const stream = `catering:${binding.catering_organization_id}:${read.entry.id}`,
    saved = current.evidence;
  if (saved) {
    if (
      saved.organization_id !== binding.organization_id ||
      saved.worker_id !== binding.worker_id ||
      saved.source_organization_id !== binding.catering_organization_id ||
      saved.source_person_id !== binding.catering_person_id ||
      saved.source_time_entry_id !== read.entry.id ||
      saved.currency !== allocation.currency
    )
      fail("native_stream_identity_changed");
    if (saved.source_time_entry_version > read.entry.version)
      fail("stale_native_entry_version");
    if (saved.source_time_entry_version === read.entry.version) {
      if (
        current.raw_entry !== read.rawEntry ||
        current.raw_review !== read.rawReview
      )
        fail("same_native_version_changed");
      if (
        saved.mapping_revision !== allocation.mapping_revision ||
        saved.project_id !== allocation.project_id ||
        saved.obligation_id !== allocation.obligation_id ||
        saved.work_date !== allocation.work_date ||
        saved.time_zone !== allocation.time_zone
      )
        fail("native_allocation_changed_requires_review");
      return null; // Review is separately persisted; polling must not overwrite it.
    }
  } else if (
    current.current_revision !== 0 ||
    current.raw_entry !== null ||
    current.raw_review !== null
  )
    fail("native_head_evidence_missing");
  const bindingForCost: CateringProjectBinding = {
    ...binding,
    ...allocation,
    publication_revision: current.current_revision + 1,
    project_review_status:
      read.entry.status === "rejected" ? "rejected" : "preliminary",
  };
  // Native payroll review increments the entry version too. It must not
  // silently adopt a newer rate for the same original working date.
  let costRates = input.rates;
  if (saved && saved.work_date === allocation.work_date) {
    if (saved.coverage === "missing_rate") costRates = [];
    else {
      const captured = input.rates.filter(
        (rate) =>
          rate.organization_id === binding.organization_id &&
          rate.worker_id === binding.worker_id &&
          rate.category === "work" &&
          rate.currency === saved.currency &&
          rate.rate_revision === saved.rate_revision &&
          rate.hourly_rate_minor === saved.hourly_rate_minor,
      );
      if (captured.length !== 1) fail("captured_native_rate_unavailable");
      costRates = captured;
    }
  }
  const evidence = await calculateCateringPersonnelEvidence(
    read.entry,
    read.review,
    bindingForCost,
    costRates,
  );
  if (
    saved &&
    read.entry.status !== "rejected" &&
    saved.source_status !== "rejected" &&
    (await cateringEconomicFingerprint(saved)) ===
      (await cateringEconomicFingerprint(evidence))
  ) {
    evidence.project_review_status = saved.project_review_status;
  }
  return {
    stream_id: stream,
    evidence,
    raw_entry: read.rawEntry,
    raw_review: read.rawReview,
    expected_revision: current.current_revision,
    idempotency_key:
      "ops-catering:" +
      (await rawBodySha256(
        JSON.stringify([
          stream,
          read.entry.version,
          read.rawEntrySha256,
          read.rawReviewSha256,
          allocation.mapping_revision,
        ]),
      )),
  };
}
