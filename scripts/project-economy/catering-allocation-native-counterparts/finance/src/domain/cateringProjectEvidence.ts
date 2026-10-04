/** Finance copies Operations' native Catering calculation, never time/rate math. */
export interface OperationsCateringPersonnelEvidence {
  schema_version: "operations-catering-personnel-v1";
  calculation_version: "operations-personnel-cost.v1.half-up";
  organization_id: string;
  worker_id: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  work_date: string;
  time_zone: string;
  mapping_revision: string;
  source_organization_id: string;
  source_person_id: string;
  source_time_entry_id: string;
  source_time_entry_version: number;
  source_fingerprint: string;
  source_review_id: string | null;
  source_review_fingerprint: string | null;
  source_status: "pending" | "approved" | "rejected";
  publication_revision: number;
  project_review_status: "preliminary" | "confirmed" | "rejected";
  minutes: number;
  rate_revision: string | null;
  hourly_rate_minor: number | null;
  amount_minor: number | null;
  coverage: "complete" | "missing_rate";
}
export function validateOperationsCateringPersonnelEvidence(
  value: unknown,
  binding: {
    organization_id: string;
    worker_id: string;
    project_id: string;
    obligation_id: string;
    currency: string;
    source_organization_id: string;
    source_person_id: string;
  },
): OperationsCateringPersonnelEvidence {
  const fail = (): never => {
    throw new Error("Invalid Operations Catering evidence");
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const x = value as Record<string, unknown>;
  const keys = [
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
  if (
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !(k in x)) ||
    x["schema_version"] !== "operations-catering-personnel-v1" ||
    x["calculation_version"] !== "operations-personnel-cost.v1.half-up"
  )
    return fail();
  const uuid = (v: unknown) =>
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const int = (v: unknown, min = 0) => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
  const hash = (v: unknown) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
  for (const key of [
    "organization_id",
    "worker_id",
    "project_id",
    "obligation_id",
    "source_organization_id",
    "source_person_id",
  ] as const) {
    if (!uuid(x[key]) || x[key] !== binding[key]) return fail();
  }
  if (
    !uuid(x["source_time_entry_id"]) ||
    x["currency"] !== binding.currency ||
    typeof binding.currency !== "string" ||
    !/^[A-Z]{3}$/.test(binding.currency) ||
    !int(x["source_time_entry_version"], 1) ||
    !int(x["publication_revision"], 1) ||
    !int(x["minutes"]) ||
    !hash(x["source_fingerprint"]) ||
    !["pending", "approved", "rejected"].includes(x["source_status"] as string) ||
    !["preliminary", "confirmed", "rejected"].includes(x["project_review_status"] as string) ||
    !["complete", "missing_rate"].includes(x["coverage"] as string)
  )
    return fail();
  const date = x["work_date"];
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    return fail();
  if (
    typeof x["time_zone"] !== "string" ||
    !x["time_zone"] ||
    typeof x["mapping_revision"] !== "string" ||
    !x["mapping_revision"].trim() ||
    x["mapping_revision"].length > 200
  )
    return fail();
  try {
    new Intl.DateTimeFormat("en", { timeZone: x["time_zone"] });
  } catch {
    return fail();
  }
  if (
    (x["source_review_id"] === null) !== (x["source_review_fingerprint"] === null) ||
    (x["source_review_id"] !== null &&
      (!uuid(x["source_review_id"]) || !hash(x["source_review_fingerprint"]))) ||
    (x["source_status"] === "approved" && x["source_review_id"] === null) ||
    (x["source_status"] === "rejected" && x["project_review_status"] !== "rejected")
  )
    return fail();
  if (x["coverage"] === "missing_rate") {
    if (["rate_revision", "hourly_rate_minor", "amount_minor"].some((k) => x[k] !== null))
      return fail();
  } else if (
    typeof x["rate_revision"] !== "string" ||
    !x["rate_revision"].trim() ||
    !int(x["hourly_rate_minor"]) ||
    !int(x["amount_minor"])
  )
    return fail();
  // Deliberately no multiplication: Operations owns the supplied calculation.
  return JSON.parse(JSON.stringify(x)) as OperationsCateringPersonnelEvidence;
}
