/** Validating copy of Operations allocation authority. No rates or costs are calculated. */
import {
  canonicalCateringDeliverySource,
  cateringDeliveryHash,
} from "./cateringProjectDelivery.ts";
import type { OperationsCateringPersonnelEvidence } from "./cateringProjectEvidence.ts";

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
export interface CateringAllocationAuthority {
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
const fail = (): never => {
  throw new Error("Invalid Catering allocation authority");
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const text = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" &&
  v === v.trim() &&
  Array.from(v).length >= min &&
  Array.from(v).length <= max;
const iso = (v: unknown): v is string => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    return false;
  const day = v.slice(0, 10);
  return (
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day &&
    Number(v.slice(0, 4)) > 0 &&
    Number(v.slice(11, 13)) < 24 &&
    Number(v.slice(14, 16)) < 60 &&
    Number(v.slice(17, 19)) < 60
  );
};
export async function fingerprintFinanceCateringAllocationEvent(
  value: Omit<CateringAllocationAuthority, "fingerprint"> | CateringAllocationAuthority,
): Promise<string> {
  const copy: Record<string, unknown> = { ...value };
  delete copy["fingerprint"];
  return cateringDeliveryHash(canonicalCateringDeliverySource(copy));
}
/** Called only after the unchanged native25 snapshot validator. Projection changes are excluded; economics and source evidence are retained. */
export async function fingerprintFinanceCateringAllocationCost(
  snapshot: OperationsCateringPersonnelEvidence,
): Promise<string> {
  const copy: Record<string, unknown> = { ...snapshot };
  for (const key of [
    "project_id",
    "obligation_id",
    "mapping_revision",
    "publication_revision",
    "project_review_status",
  ])
    delete copy[key];
  return cateringDeliveryHash(canonicalCateringDeliverySource(copy));
}
/** Shape/hash validation does not authorize reassignment. Receiver SQL must resolve its own accepted predecessor, enrolled maps and exact current allocation lineage. */
export async function validateFinanceCateringAllocationAuthority(
  value: unknown,
): Promise<CateringAllocationAuthority> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail();
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).length !== CATERING_ALLOCATION_EVENT_KEYS.length ||
    CATERING_ALLOCATION_EVENT_KEYS.some((k) => !Object.hasOwn(x, k)) ||
    x["schema_version"] !== "operations-catering-allocation-authority.v2"
  )
    return fail();
  for (const key of [
    "event_id",
    "organization_id",
    "actor_system_user_id",
    "source_observation_id",
    "previous_mapping_id",
    "next_mapping_id",
    "from_project_id",
    "from_obligation_id",
    "to_project_id",
    "to_obligation_id",
  ])
    if (!uuid(x[key])) return fail();
  for (const key of [
    "allocation_revision",
    "base_publication_revision",
    "allocated_publication_revision",
    "source_entry_version",
    "target_obligation_revision",
  ])
    if (!integer(x[key])) return fail();
  for (const key of ["raw_entry_sha256", "source_cost_fingerprint", "fingerprint"])
    if (!hash(x[key])) return fail();
  if (x["raw_review_sha256"] !== null && !hash(x["raw_review_sha256"])) return fail();
  if (
    !text(x["reason"], 3, 1000) ||
    !text(x["idempotency_key"], 12, 200) ||
    !text(x["previous_mapping_revision"], 1, 200) ||
    !iso(x["created_at"]) ||
    typeof x["source_stream_id"] !== "string" ||
    !/^catering:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      x["source_stream_id"],
    )
  )
    return fail();
  if (
    x["next_mapping_revision"] !== "native-allocation-v2:" + x["event_id"] ||
    x["previous_mapping_id"] === x["next_mapping_id"] ||
    x["allocated_publication_revision"] !== (x["base_publication_revision"] as number) + 1 ||
    (x["from_project_id"] === x["to_project_id"] &&
      x["from_obligation_id"] === x["to_obligation_id"])
  )
    return fail();
  const event = x as unknown as CateringAllocationAuthority;
  if ((await fingerprintFinanceCateringAllocationEvent(event)) !== event.fingerprint) return fail();
  return structuredClone(event);
}
