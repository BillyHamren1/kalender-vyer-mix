/** Authenticated validating copy only. Operations owns all economic arithmetic. */
import {
  validateOperationsCateringPersonnelEvidence,
  type OperationsCateringPersonnelEvidence,
} from "./cateringProjectEvidence.ts";
export interface CateringDeliveryDestination {
  project_id: string;
  obligation_id: string;
}
export interface CateringFinanceDestinationMap {
  mapping_id: string;
  mapping_revision: string;
  source_project_id: string;
  source_obligation_id: string;
  destination_project_id: string;
  currency: string;
}
export interface OperationsCateringDelivery {
  schema_version: "operations-catering-delivery.v1";
  operations_organization_id: string;
  destination_organization_id: string;
  route_id: string;
  route_revision: string;
  key_id: string;
  source_stream_id: string;
  source_outbox_id: string;
  source_observation_id: string;
  source_mapping_id: string;
  destinations: CateringDeliveryDestination[];
  destination_mappings: CateringFinanceDestinationMap[];
  snapshot: OperationsCateringPersonnelEvidence;
  raw_entry: string;
  raw_review: string | null;
  raw_entry_sha256: string;
  raw_review_sha256: string | null;
  source_request_hash: string;
}
const fail = (): never => {
  throw new Error("Invalid Operations Catering delivery");
};
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail();
const exact = (v: unknown, keys: readonly string[]) => {
  const x = object(v);
  if (Object.keys(x).length !== keys.length || keys.some((k) => !Object.hasOwn(x, k))) fail();
  return x;
};
const uuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
const revision = (v: unknown): v is string =>
  typeof v === "string" && v === v.trim() && v.length > 0 && v.length <= 200;
const iso = (v: unknown): v is string => {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) ||
    !Number.isFinite(Date.parse(v))
  )
    return false;
  const year = Number(v.slice(0, 4)),
    month = Number(v.slice(5, 7)),
    day = Number(v.slice(8, 10)),
    date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    Number(v.slice(11, 13)) < 24 &&
    Number(v.slice(14, 16)) < 60 &&
    Number(v.slice(17, 19)) < 60
  );
};
/** Restricted current native SQL JSON contract, shared source hashing not cost calculation. */
export function canonicalCateringDeliverySource(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v === null || typeof v === "boolean") return v;
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v)) return fail();
      return v;
    }
    if (typeof v === "string") {
      for (const c of v) {
        const cp = c.codePointAt(0)!;
        if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff)) return fail();
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(normalize);
    const x = object(v);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(x).sort()) {
      if (!/^[a-z][a-z0-9_]*$/.test(key)) return fail();
      Object.defineProperty(result, key, { value: normalize(x[key]), enumerable: true });
    }
    return result;
  };
  return JSON.stringify(normalize(value));
}
export async function cateringDeliveryHash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function validateOperationsCateringDelivery(
  value: unknown,
): Promise<OperationsCateringDelivery> {
  const x = exact(value, [
    "schema_version",
    "operations_organization_id",
    "destination_organization_id",
    "route_id",
    "route_revision",
    "key_id",
    "source_stream_id",
    "source_outbox_id",
    "source_observation_id",
    "source_mapping_id",
    "destinations",
    "destination_mappings",
    "snapshot",
    "raw_entry",
    "raw_review",
    "raw_entry_sha256",
    "raw_review_sha256",
    "source_request_hash",
  ]);
  if (
    x["schema_version"] !== "operations-catering-delivery.v1" ||
    !revision(x["route_revision"]) ||
    typeof x["key_id"] !== "string" ||
    !/^[A-Za-z0-9_-]{4,64}$/.test(x["key_id"])
  )
    return fail();
  for (const key of [
    "operations_organization_id",
    "destination_organization_id",
    "route_id",
    "source_outbox_id",
    "source_observation_id",
    "source_mapping_id",
  ])
    if (!uuid(x[key])) return fail();
  const supplied = object(x["snapshot"]);
  for (const key of [
    "organization_id",
    "worker_id",
    "project_id",
    "obligation_id",
    "source_organization_id",
    "source_person_id",
    "source_time_entry_id",
  ])
    if (!uuid(supplied[key])) return fail();
  if (supplied["source_review_id"] !== null && !uuid(supplied["source_review_id"])) return fail();
  const snapshot = validateOperationsCateringPersonnelEvidence(supplied, {
    organization_id: supplied["organization_id"] as string,
    worker_id: supplied["worker_id"] as string,
    project_id: supplied["project_id"] as string,
    obligation_id: supplied["obligation_id"] as string,
    currency: supplied["currency"] as string,
    source_organization_id: supplied["source_organization_id"] as string,
    source_person_id: supplied["source_person_id"] as string,
  });
  if (
    snapshot.organization_id !== x["operations_organization_id"] ||
    x["source_stream_id"] !==
      `catering:${snapshot.source_organization_id}:${snapshot.source_time_entry_id}`
  )
    return fail();
  if (
    !Array.isArray(x["destinations"]) ||
    x["destinations"].length < 1 ||
    x["destinations"].length > 2 ||
    !Array.isArray(x["destination_mappings"]) ||
    x["destination_mappings"].length !== x["destinations"].length
  )
    return fail();
  const pairs = new Set<string>();
  for (const d of x["destinations"]) {
    const row = exact(d, ["project_id", "obligation_id"]);
    if (!uuid(row["project_id"]) || !uuid(row["obligation_id"])) return fail();
    const pair = row["project_id"] + ":" + row["obligation_id"];
    if (pairs.has(pair)) return fail();
    pairs.add(pair);
  }
  if (!pairs.has(snapshot.project_id + ":" + snapshot.obligation_id)) return fail();
  const mapped = new Set<string>();
  const mapIds = new Set<string>();
  for (const d of x["destination_mappings"]) {
    const row = exact(d, [
      "mapping_id",
      "mapping_revision",
      "source_project_id",
      "source_obligation_id",
      "destination_project_id",
      "currency",
    ]);
    for (const key of [
      "mapping_id",
      "source_project_id",
      "source_obligation_id",
      "destination_project_id",
    ])
      if (!uuid(row[key])) return fail();
    if (!revision(row["mapping_revision"]) || row["currency"] !== snapshot.currency) return fail();
    const pair = row["source_project_id"] + ":" + row["source_obligation_id"];
    if (!pairs.has(pair) || mapped.has(pair) || mapIds.has(row["mapping_id"] as string))
      return fail();
    mapped.add(pair);
    mapIds.add(row["mapping_id"] as string);
  }
  if (
    typeof x["raw_entry"] !== "string" ||
    !hash(x["raw_entry_sha256"]) ||
    !hash(x["source_request_hash"]) ||
    (x["raw_review"] === null) !== (x["raw_review_sha256"] === null) ||
    (x["raw_review"] !== null &&
      (typeof x["raw_review"] !== "string" || !hash(x["raw_review_sha256"])))
  )
    return fail();
  if ((await cateringDeliveryHash(x["raw_entry"])) !== x["raw_entry_sha256"]) return fail();
  const entry = object(JSON.parse(x["raw_entry"]));
  if (
    entry["id"] !== snapshot.source_time_entry_id ||
    entry["organization_id"] !== snapshot.source_organization_id ||
    entry["person_id"] !== snapshot.source_person_id ||
    entry["version"] !== snapshot.source_time_entry_version ||
    entry["status"] !== snapshot.source_status ||
    !["ledger", "manual"].includes(entry["source"] as string) ||
    !uuid(entry["workplace_id"]) ||
    !iso(entry["started_at"]) ||
    !iso(entry["ended_at"]) ||
    typeof entry["break_minutes"] !== "number" ||
    !Number.isSafeInteger(entry["break_minutes"]) ||
    entry["break_minutes"] < 0
  )
    return fail();
  if (
    (await cateringDeliveryHash(canonicalCateringDeliverySource(entry))) !==
    snapshot.source_fingerprint
  )
    return fail();
  if (x["raw_review"] === null) {
    if (snapshot.source_review_id !== null || snapshot.source_review_fingerprint !== null)
      return fail();
  } else {
    if ((await cateringDeliveryHash(x["raw_review"] as string)) !== x["raw_review_sha256"])
      return fail();
    const review = object(JSON.parse(x["raw_review"] as string));
    const before = object(review["before_payload"]);
    if (
      review["id"] !== snapshot.source_review_id ||
      !uuid(review["id"]) ||
      review["organization_id"] !== snapshot.source_organization_id ||
      review["time_entry_id"] !== snapshot.source_time_entry_id ||
      review["to_status"] !== snapshot.source_status ||
      !["pending", "approved", "rejected"].includes(review["from_status"] as string) ||
      !uuid(review["reviewed_by"]) ||
      !iso(review["reviewed_at"]) ||
      before["id"] !== snapshot.source_time_entry_id ||
      before["organization_id"] !== snapshot.source_organization_id ||
      before["person_id"] !== snapshot.source_person_id ||
      before["version"] !== snapshot.source_time_entry_version - 1 ||
      before["status"] !== review["from_status"] ||
      canonicalCateringDeliverySource(review["after_payload"]) !==
        canonicalCateringDeliverySource(entry) ||
      (await cateringDeliveryHash(canonicalCateringDeliverySource(review))) !==
        snapshot.source_review_fingerprint
    )
      return fail();
    if (
      snapshot.source_status === "approved" &&
      (entry["approved_by"] !== review["reviewed_by"] ||
        !uuid(entry["approved_by"]) ||
        !iso(entry["approved_at"]))
    )
      return fail();
  }
  return JSON.parse(JSON.stringify({ ...x, snapshot })) as OperationsCateringDelivery;
}
