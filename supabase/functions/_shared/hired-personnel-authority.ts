/** Metadata integrity only. Authenticated database authority remains mandatory. */
export type HiredSourceKind = "time" | "catering";
export interface HiredBasisCommand {
  schema_version: "operations-hired-basis.v1";
  project_id: string;
  obligation_id: string;
  baseline_event_id: string;
  expected_obligation_revision: number;
  expected_basis_revision: number;
  cost_basis: "invoice" | "time";
  evidence_sha256: string;
  idempotency_key: string;
  reason: string;
}
export interface HiredAssignmentCommand {
  schema_version: "operations-hired-operational-source-assign.v1";
  project_id: string;
  obligation_id: string;
  basis_event_id: string;
  expected_assignment_revision: number;
  source_kind: HiredSourceKind;
  source_stream_id: string;
  source_revision: number;
  source_line_id: string;
  expected_source_fingerprint: string;
  invoice_binding_event_id: string;
  replaces_estimate_minor: 0;
  consumes_commitment_minor: 0;
  idempotency_key: string;
  reason: string;
}
/** Exact service metadata from the saved Operations Time/Catering publication. */
export interface HiredPublishedSourceMetadata {
  source_status: string;
  project_cost_status: "preliminary" | "confirmed";
  currency: string;
  minutes: number;
  amount_minor: number | null;
  coverage: "complete" | "missing_rate";
  source_kind: HiredSourceKind;
  source_stream_id: string;
  source_line_id: string;
  source_revision: number;
  publication_fingerprint: string;
  worker_id: string;
  project_id: string;
  source_currentness: "saved_publication_head_only";
}
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const revision = (v: unknown, min: number) =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= min &&
  v < Number.MAX_SAFE_INTEGER;
function unicode(v: string): boolean {
  for (let i = 0; i < v.length; i++) {
    const n = v.charCodeAt(i);
    if (n === 0) return false;
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = v.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" &&
  unicode(v) &&
  Array.from(v).length >= min &&
  Array.from(v).length <= max &&
  v.trim() === v;
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
function common(v: Record<string, unknown>) {
  return (
    uuid(v.project_id) &&
    uuid(v.obligation_id) &&
    text(v.idempotency_key, 12, 200) &&
    text(v.reason, 3, 1000)
  );
}
export function validateHiredBasisCommand(v: unknown): HiredBasisCommand {
  if (
    !exact(v, [
      "schema_version",
      "project_id",
      "obligation_id",
      "baseline_event_id",
      "expected_obligation_revision",
      "expected_basis_revision",
      "cost_basis",
      "evidence_sha256",
      "idempotency_key",
      "reason",
    ]) ||
    !common(v) ||
    v.schema_version !== "operations-hired-basis.v1" ||
    !uuid(v.baseline_event_id) ||
    !revision(v.expected_obligation_revision, 1) ||
    !revision(v.expected_basis_revision, 0) ||
    !["invoice", "time"].includes(v.cost_basis as string) ||
    !hash(v.evidence_sha256)
  )
    throw new Error("invalid_hired_basis_command");
  return {
    ...v,
    project_id: (v.project_id as string).toLowerCase(),
    obligation_id: (v.obligation_id as string).toLowerCase(),
    baseline_event_id: v.baseline_event_id.toLowerCase(),
  } as unknown as HiredBasisCommand;
}
export function validateHiredAssignmentCommand(
  v: unknown,
): HiredAssignmentCommand {
  if (
    !exact(v, [
      "schema_version",
      "project_id",
      "obligation_id",
      "basis_event_id",
      "expected_assignment_revision",
      "source_kind",
      "source_stream_id",
      "source_revision",
      "source_line_id",
      "expected_source_fingerprint",
      "invoice_binding_event_id",
      "replaces_estimate_minor",
      "consumes_commitment_minor",
      "idempotency_key",
      "reason",
    ]) ||
    !common(v) ||
    v.schema_version !== "operations-hired-operational-source-assign.v1" ||
    !uuid(v.basis_event_id) ||
    !uuid(v.invoice_binding_event_id) ||
    !revision(v.expected_assignment_revision, 0) ||
    !revision(v.source_revision, 1) ||
    !["time", "catering"].includes(v.source_kind as string) ||
    !text(v.source_stream_id, 1, 256) ||
    !text(v.source_line_id, 1, 256) ||
    !hash(v.expected_source_fingerprint) ||
    v.replaces_estimate_minor !== 0 ||
    v.consumes_commitment_minor !== 0 ||
    (v.source_kind === "catering" && !uuid(v.source_line_id))
  )
    throw new Error("invalid_hired_assignment_command");
  return {
    ...v,
    project_id: (v.project_id as string).toLowerCase(),
    obligation_id: (v.obligation_id as string).toLowerCase(),
    basis_event_id: v.basis_event_id.toLowerCase(),
    invoice_binding_event_id: v.invoice_binding_event_id.toLowerCase(),
    source_line_id:
      v.source_kind === "catering"
        ? (v.source_line_id as string).toLowerCase()
        : v.source_line_id,
  } as unknown as HiredAssignmentCommand;
}
function compareUTF8(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
export function canonicalHiredEvidence(v: unknown): string {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "string" && unicode(v)) return JSON.stringify(v);
  if (typeof v === "number" && Number.isSafeInteger(v)) return String(v);
  if (Array.isArray(v))
    return "[" + v.map(canonicalHiredEvidence).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort(compareUTF8)
        .map((k) => {
          if (!unicode(k)) throw new Error("invalid_hired_canonical_key");
          return (
            JSON.stringify(k) +
            ":" +
            canonicalHiredEvidence((v as Record<string, unknown>)[k])
          );
        })
        .join(",") +
      "}"
    );
  throw new Error("invalid_hired_canonical_value");
}
async function digest(v: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(canonicalHiredEvidence(v)),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hiredSourceIdentity(
  org: string,
  kind: HiredSourceKind,
  stream: string,
  line: string,
) {
  if (
    !uuid(org) ||
    !["time", "catering"].includes(kind) ||
    !text(stream, 1, 256) ||
    !text(line, 1, 256) ||
    (kind === "catering" && !uuid(line))
  )
    throw new Error("invalid_hired_source_identity");
  return digest([
    "operations-hired-personnel-source-identity-v1",
    org.toLowerCase(),
    kind,
    stream,
    kind === "catering" ? line.toLowerCase() : line,
  ]);
}
export async function hiredPublicationFingerprint(
  kind: HiredSourceKind,
  publication: Record<string, unknown>,
) {
  if (
    !["time", "catering"].includes(kind) ||
    !publication ||
    typeof publication !== "object" ||
    Array.isArray(publication)
  )
    throw new Error("invalid_hired_publication");
  return digest([
    "operations-hired-personnel-publication-fingerprint-v1",
    kind,
    publication,
  ]);
}
export function validateHiredPublishedSourceMetadata(
  v: unknown,
): HiredPublishedSourceMetadata {
  if (
    !exact(v, [
      "source_status",
      "project_cost_status",
      "currency",
      "minutes",
      "amount_minor",
      "coverage",
      "source_kind",
      "source_stream_id",
      "source_line_id",
      "source_revision",
      "publication_fingerprint",
      "worker_id",
      "project_id",
      "source_currentness",
    ]) ||
    !text(v.source_status, 1, 64) ||
    ["rejected", "voided"].includes(v.source_status) ||
    !["preliminary", "confirmed"].includes(v.project_cost_status as string) ||
    typeof v.currency !== "string" ||
    !/^[A-Z]{3}$/.test(v.currency) ||
    typeof v.minutes !== "number" ||
    !Number.isSafeInteger(v.minutes) ||
    v.minutes < 0 ||
    !["time", "catering"].includes(v.source_kind as string) ||
    !text(v.source_stream_id, 1, 256) ||
    !text(v.source_line_id, 1, 256) ||
    (v.source_kind === "catering" && !uuid(v.source_line_id)) ||
    !revision(v.source_revision, 1) ||
    !hash(v.publication_fingerprint) ||
    !uuid(v.worker_id) ||
    !uuid(v.project_id) ||
    v.source_currentness !== "saved_publication_head_only" ||
    (v.coverage === "missing_rate"
      ? v.amount_minor !== null
      : v.coverage !== "complete" ||
        typeof v.amount_minor !== "number" ||
        !Number.isSafeInteger(v.amount_minor) ||
        v.amount_minor < 0)
  )
    throw new Error("invalid_hired_source_metadata");
  return v as unknown as HiredPublishedSourceMetadata;
}
