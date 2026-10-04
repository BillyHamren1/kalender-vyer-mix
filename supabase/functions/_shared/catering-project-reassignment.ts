/** Operations allocation authority over an already saved native cost.
 * No provider input, rates, time or money are calculated here. The authenticated
 * database command resolves all saved records and current authority itself. */
import type { CateringPersonnelEvidence } from "./catering-project-evidence.ts";

export interface CateringReassignmentCommand {
  schema_version: "operations-catering-reassignment-command.v2";
  source_stream_id: string;
  expected_source_revision: number;
  expected_allocation_revision: number;
  expected_observation_id: string;
  expected_source_fingerprint: string;
  from_project_id: string;
  from_obligation_id: string;
  target_project_id: string;
  target_obligation_id: string;
  expected_target_obligation_revision: number;
  idempotency_key: string;
  reason: string;
}
export interface CateringAllocationEvent {
  schema_version: "operations-catering-allocation-authority.v2";
  event_id: string;
  organization_id: string;
  source_stream_id: string;
  allocation_revision: number;
  actor_system_user_id: string;
  reason: string;
  idempotency_key: string;
  created_at: string;
  base_publication_revision: number;
  allocated_publication_revision: number;
  source_observation_id: string;
  source_entry_version: number;
  raw_entry_sha256: string;
  raw_review_sha256: string | null;
  source_cost_fingerprint: string;
  previous_mapping_id: string;
  previous_mapping_revision: string;
  next_mapping_id: string;
  next_mapping_revision: string;
  from_project_id: string;
  from_obligation_id: string;
  to_project_id: string;
  to_obligation_id: string;
  target_obligation_revision: number;
  fingerprint: string;
}
export interface SavedCateringPublication {
  source_stream_id: string;
  source_revision: number;
  observation_id: string;
  mapping_id: string;
  raw_entry_sha256: string;
  raw_review_sha256: string | null;
  snapshot: CateringPersonnelEvidence;
}
export interface ResolvedCateringAllocationAuthority {
  organization_id: string;
  actor_system_user_id: string;
  allocation_revision: number;
  event_id: string;
  next_mapping_id: string;
  next_mapping_revision: string;
  created_at: string;
  target_obligation: {
    organization_id: string;
    project_id: string;
    obligation_id: string;
    currency: string;
    cost_basis: "time";
    current_revision: number;
  };
}
export const CATERING_ALLOCATION_EVENT_KEYS = [
  "schema_version",
  "event_id",
  "organization_id",
  "source_stream_id",
  "allocation_revision",
  "actor_system_user_id",
  "reason",
  "idempotency_key",
  "created_at",
  "base_publication_revision",
  "allocated_publication_revision",
  "source_observation_id",
  "source_entry_version",
  "raw_entry_sha256",
  "raw_review_sha256",
  "source_cost_fingerprint",
  "previous_mapping_id",
  "previous_mapping_revision",
  "next_mapping_id",
  "next_mapping_revision",
  "from_project_id",
  "from_obligation_id",
  "to_project_id",
  "to_obligation_id",
  "target_obligation_revision",
  "fingerprint",
] as const;
const COMMAND_KEYS = [
  "schema_version",
  "source_stream_id",
  "expected_source_revision",
  "expected_allocation_revision",
  "expected_observation_id",
  "expected_source_fingerprint",
  "from_project_id",
  "from_obligation_id",
  "target_project_id",
  "target_obligation_id",
  "expected_target_obligation_revision",
  "idempotency_key",
  "reason",
];
const SNAPSHOT_KEYS = [
  "schema_version",
  "calculation_version",
  "organization_id",
  "worker_id",
  "project_id",
  "obligation_id",
  "currency",
  "work_date",
  "time_zone",
  "mapping_revision",
  "source_organization_id",
  "source_person_id",
  "source_time_entry_id",
  "source_time_entry_version",
  "source_fingerprint",
  "source_review_id",
  "source_review_fingerprint",
  "source_status",
  "publication_revision",
  "project_review_status",
  "minutes",
  "rate_revision",
  "hourly_rate_minor",
  "amount_minor",
  "coverage",
];
const OMIT_COST = new Set([
  "project_id",
  "obligation_id",
  "mapping_revision",
  "publication_revision",
  "project_review_status",
]);
const fail = (): never => {
  throw new Error("invalid_catering_allocation_authority");
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const int = (v: unknown, min = 0): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v === v.trim() && Array.from(v).length >= min &&
  Array.from(v).length <= max;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (
  v: unknown,
  keys: readonly string[],
): v is Record<string, unknown> =>
  object(v) && Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const stream = (v: unknown): v is string =>
  typeof v === "string" &&
  /^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    .test(v);
const date = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const iso = (v: unknown): v is string => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
      .test(v) ||
    !date(v.slice(0, 10))
  ) return false;
  return Number.isFinite(Date.parse(v)) && Number(v.slice(11, 13)) < 24 &&
    Number(v.slice(14, 16)) < 60 && Number(v.slice(17, 19)) < 60;
};

export function validateCateringReassignmentCommand(
  value: unknown,
): CateringReassignmentCommand {
  if (
    !exact(value, COMMAND_KEYS) ||
    value["schema_version"] !== "operations-catering-reassignment-command.v2" ||
    !stream(value["source_stream_id"])
  ) return fail();
  for (
    const key of [
      "expected_observation_id",
      "from_project_id",
      "from_obligation_id",
      "target_project_id",
      "target_obligation_id",
    ]
  ) if (!uuid(value[key])) return fail();
  for (
    const key of [
      "expected_source_revision",
      "expected_target_obligation_revision",
    ]
  ) if (!int(value[key], 1)) return fail();
  if (
    !int(value["expected_allocation_revision"]) ||
    !hash(value["expected_source_fingerprint"]) ||
    !text(value["idempotency_key"], 12, 200) ||
    !text(value["reason"], 3, 1000) ||
    (value["from_project_id"] === value["target_project_id"] &&
      value["from_obligation_id"] === value["target_obligation_id"])
  ) return fail();
  return { ...value } as unknown as CateringReassignmentCommand;
}

/** No multiplication or historical lookup: validates the immutable saved shape. */
export function validateSavedCateringAllocationCost(
  value: unknown,
): CateringPersonnelEvidence {
  if (
    !exact(value, SNAPSHOT_KEYS) ||
    value["schema_version"] !== "operations-catering-personnel-v1" ||
    value["calculation_version"] !== "operations-personnel-cost.v1.half-up"
  ) return fail();
  for (
    const key of [
      "organization_id",
      "worker_id",
      "project_id",
      "obligation_id",
      "source_organization_id",
      "source_person_id",
      "source_time_entry_id",
    ]
  ) if (!uuid(value[key])) return fail();
  for (const key of ["source_time_entry_version", "publication_revision"]) {
    if (!int(value[key], 1)) return fail();
  }
  if (
    !int(value["minutes"]) || !hash(value["source_fingerprint"]) ||
    !date(value["work_date"]) || !text(value["time_zone"], 1, 100) ||
    !text(value["mapping_revision"], 1, 200) ||
    typeof value["currency"] !== "string" ||
    !/^[A-Z]{3}$/.test(value["currency"])
  ) return fail();
  if (
    typeof value["source_status"] !== "string" ||
    !["pending", "approved", "rejected"].includes(value["source_status"]) ||
    typeof value["project_review_status"] !== "string" ||
    !["preliminary", "confirmed", "rejected"].includes(
      value["project_review_status"],
    )
  ) return fail();
  if (
    (value["source_review_id"] === null) !==
      (value["source_review_fingerprint"] === null) ||
    (value["source_review_id"] !== null &&
      (!uuid(value["source_review_id"]) ||
        !hash(value["source_review_fingerprint"]))) ||
    (value["source_status"] === "approved" &&
      value["source_review_id"] === null) ||
    (value["source_status"] === "rejected" &&
      value["project_review_status"] !== "rejected")
  ) return fail();
  if (value["coverage"] === "missing_rate") {
    if (
      value["rate_revision"] !== null || value["hourly_rate_minor"] !== null ||
      value["amount_minor"] !== null
    ) return fail();
  } else if (
    value["coverage"] !== "complete" || !text(value["rate_revision"], 1, 200) ||
    !int(value["hourly_rate_minor"]) || !int(value["amount_minor"])
  ) return fail();
  return { ...value } as unknown as CateringPersonnelEvidence;
}
async function fingerprint(value: Record<string, unknown>): Promise<string> {
  // All contract keys are ASCII snake_case, matching PostgreSQL C ordering.
  for (const [key, scalar] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) return fail();
    if (typeof scalar === "string") {
      for (const c of scalar) {
        const point = c.codePointAt(0)!;
        if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) return fail();
      }
    } else if (
      scalar !== null && typeof scalar !== "boolean" &&
      !(typeof scalar === "number" && Number.isSafeInteger(scalar))
    ) return fail();
  }
  const canonical = JSON.stringify(
    Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])),
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function fingerprintCateringAllocationCost(
  value: unknown,
): Promise<string> {
  const snapshot = validateSavedCateringAllocationCost(value);
  return await fingerprint(
    Object.fromEntries(
      Object.entries(snapshot).filter(([key]) => !OMIT_COST.has(key)),
    ),
  );
}
export async function fingerprintCateringAllocationEvent(
  value: Omit<CateringAllocationEvent, "fingerprint"> | CateringAllocationEvent,
): Promise<string> {
  const copy: Record<string, unknown> = { ...value };
  delete copy["fingerprint"];
  return await fingerprint(copy);
}
export async function buildCateringReassignment(
  input: unknown,
  saved: SavedCateringPublication,
  resolved: ResolvedCateringAllocationAuthority,
): Promise<
  { event: CateringAllocationEvent; snapshot: CateringPersonnelEvidence }
> {
  const command = validateCateringReassignmentCommand(input);
  const previous = validateSavedCateringAllocationCost(saved.snapshot);
  const target = resolved.target_obligation;
  if (
    !uuid(resolved.organization_id) || !uuid(resolved.actor_system_user_id) ||
    !uuid(resolved.event_id) || !uuid(resolved.next_mapping_id) ||
    !int(resolved.allocation_revision) ||
    resolved.allocation_revision !== command.expected_allocation_revision ||
    !text(resolved.next_mapping_revision, 1, 200) || !iso(resolved.created_at)
  ) return fail();
  if (
    !uuid(saved.observation_id) || !uuid(saved.mapping_id) ||
    !hash(saved.raw_entry_sha256) ||
    (saved.raw_review_sha256 !== null && !hash(saved.raw_review_sha256)) ||
    (previous.source_review_id === null) !== (saved.raw_review_sha256 === null)
  ) return fail();
  if (
    saved.source_stream_id !== command.source_stream_id ||
    saved.source_stream_id !==
      `catering:${previous.source_organization_id}:${previous.source_time_entry_id}` ||
    saved.source_revision !== command.expected_source_revision ||
    previous.publication_revision !== saved.source_revision ||
    saved.observation_id !== command.expected_observation_id ||
    previous.source_fingerprint !== command.expected_source_fingerprint ||
    previous.organization_id !== resolved.organization_id ||
    previous.project_id !== command.from_project_id ||
    previous.obligation_id !== command.from_obligation_id
  ) return fail();
  if (
    !target || target.organization_id !== resolved.organization_id ||
    target.project_id !== command.target_project_id ||
    target.obligation_id !== command.target_obligation_id ||
    target.currency !== previous.currency || target.cost_basis !== "time" ||
    target.current_revision !== command.expected_target_obligation_revision
  ) return fail();
  if (
    !int(saved.source_revision, 1) ||
    saved.source_revision === Number.MAX_SAFE_INTEGER ||
    resolved.allocation_revision === Number.MAX_SAFE_INTEGER ||
    saved.mapping_id === resolved.next_mapping_id ||
    previous.mapping_revision === resolved.next_mapping_revision
  ) return fail();
  const snapshot: CateringPersonnelEvidence = {
    ...previous,
    project_id: command.target_project_id,
    obligation_id: command.target_obligation_id,
    mapping_revision: resolved.next_mapping_revision,
    publication_revision: saved.source_revision + 1,
    project_review_status: previous.source_status === "rejected"
      ? "rejected"
      : "preliminary",
  };
  const document: Omit<CateringAllocationEvent, "fingerprint"> = {
    schema_version: "operations-catering-allocation-authority.v2",
    event_id: resolved.event_id,
    organization_id: resolved.organization_id,
    source_stream_id: saved.source_stream_id,
    allocation_revision: resolved.allocation_revision + 1,
    actor_system_user_id: resolved.actor_system_user_id,
    reason: command.reason,
    idempotency_key: command.idempotency_key,
    created_at: resolved.created_at,
    base_publication_revision: saved.source_revision,
    allocated_publication_revision: snapshot.publication_revision,
    source_observation_id: saved.observation_id,
    source_entry_version: previous.source_time_entry_version,
    raw_entry_sha256: saved.raw_entry_sha256,
    raw_review_sha256: saved.raw_review_sha256,
    source_cost_fingerprint: await fingerprintCateringAllocationCost(previous),
    previous_mapping_id: saved.mapping_id,
    previous_mapping_revision: previous.mapping_revision,
    next_mapping_id: resolved.next_mapping_id,
    next_mapping_revision: resolved.next_mapping_revision,
    from_project_id: previous.project_id,
    from_obligation_id: previous.obligation_id,
    to_project_id: command.target_project_id,
    to_obligation_id: command.target_obligation_id,
    target_obligation_revision: target.current_revision,
  };
  return {
    event: {
      ...document,
      fingerprint: await fingerprintCateringAllocationEvent(document),
    },
    snapshot,
  };
}
