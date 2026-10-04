/** Operations is the sole calculator. Disabled shadow contract, no ledger mutation. */
export type CostBasis = "time" | "invoice" | "other";
export interface ObligationSource {
  source_id: string;
  organization_id: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  kind: "time" | "invoice" | "credit" | "other";
  status: "preliminary" | "confirmed" | "rejected";
  amount_minor: number | null;
  replaces_estimate_minor: number | null;
  consumes_commitment_minor: number | null;
  credited_source_id: string | null;
  relation_coverage: "complete" | "unresolved";
}
export interface CostObligationInput {
  organization_id: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  cost_basis: CostBasis;
  estimate_minor: number | null;
  committed_minor: number | null;
  relation_coverage: "complete" | "unresolved";
  sources: ObligationSource[];
}
export interface CostObligationResult {
  schema_version: "operations-cost-obligation-v1";
  calculation_version: "operations-obligation-replacement-v1";
  organization_id: string;
  project_id: string;
  obligation_id: string;
  currency: string;
  cost_basis: CostBasis;
  coverage: "complete" | "unavailable";
  issues: string[];
  source_ids: string[];
  confirmed_minor: number;
  preliminary_minor: number;
  known_cost_minor: number;
  estimate_remaining_minor: number | null;
  commitment_remaining_minor: number | null;
  remaining_minor: number | null;
  eac_minor: number | null;
}
function money(value: number | null, nonnegative = false) {
  if (
    value !== null &&
    (!Number.isSafeInteger(value) || (nonnegative && value < 0))
  )
    throw new Error("Invalid obligation money");
}
function minor(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Unsafe obligation aggregation");
  return n;
}
export function calculateProjectCostObligation(
  input: CostObligationInput,
): CostObligationResult {
  if (
    !input ||
    typeof input !== "object" ||
    !["time", "invoice", "other"].includes(input.cost_basis) ||
    !["complete", "unresolved"].includes(input.relation_coverage)
  )
    throw new Error("Explicit obligation authority required");
  for (const key of ["organization_id", "project_id", "obligation_id"] as const)
    if (
      typeof input[key] !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input[key],
      )
    )
      throw new Error("Exact obligation scope required");
  if (
    !/^[A-Z]{3}$/.test(input.currency) ||
    !Array.isArray(input.sources) ||
    input.sources.length > 10000
  )
    throw new Error("Invalid obligation envelope");
  money(input.estimate_minor, true);
  money(input.committed_minor, true);
  const issues: string[] = [];
  if (input.relation_coverage !== "complete")
    issues.push("unresolved_obligation_relation");
  if (input.estimate_minor === null) issues.push("missing_estimate");
  if (input.committed_minor === null) issues.push("missing_commitment");
  const seen = new Set<string>();
  const originals = new Map<string, ObligationSource>();
  let confirmed = 0n,
    preliminary = 0n,
    replaced = 0n,
    consumed = 0n;
  const credits = new Map<string, bigint>();
  for (const s of input.sources) {
    if (
      !s ||
      typeof s.source_id !== "string" ||
      !s.source_id.trim() ||
      seen.has(s.source_id)
    )
      throw new Error("Duplicate/missing obligation source identity");
    seen.add(s.source_id);
    if (
      s.organization_id !== input.organization_id ||
      s.project_id !== input.project_id ||
      s.obligation_id !== input.obligation_id ||
      s.currency !== input.currency
    )
      throw new Error("Cross-scope obligation relation");
    if (
      !["time", "invoice", "credit", "other"].includes(s.kind) ||
      !["preliminary", "confirmed", "rejected"].includes(s.status) ||
      !["complete", "unresolved"].includes(s.relation_coverage)
    )
      throw new Error("Invalid obligation source status");
    money(s.amount_minor);
    money(s.replaces_estimate_minor, true);
    money(s.consumes_commitment_minor, true);
    if (s.kind !== "credit" && s.credited_source_id !== null)
      throw new Error("Credit relationship on noncredit source");
    if (s.kind === "invoice") originals.set(s.source_id, s);
  }
  for (const s of input.sources) {
    if (s.status === "rejected") continue; // Rejected document never deletes its real commitment.
    if (s.relation_coverage !== "complete") {
      issues.push("unresolved_source_relation:" + s.source_id);
      continue;
    }
    if (input.cost_basis === "invoice" && s.kind === "time") {
      if (s.replaces_estimate_minor !== 0 || s.consumes_commitment_minor !== 0)
        throw new Error("Noncharging hired time cannot consume obligation");
      continue; // Explicit authority and exact relation are required to ignore hired time cost.
    }
    if (
      (input.cost_basis === "time" && s.kind !== "time") ||
      (input.cost_basis === "invoice" &&
        !["invoice", "credit"].includes(s.kind)) ||
      (input.cost_basis === "other" && s.kind !== "other")
    )
      throw new Error("Competing obligation cost authorities");
    if (s.amount_minor === null) {
      issues.push("missing_source_amount:" + s.source_id);
      continue;
    }
    if (
      s.replaces_estimate_minor === null ||
      s.consumes_commitment_minor === null
    )
      issues.push("missing_source_replacement:" + s.source_id);
    if (s.kind === "credit") {
      if (
        s.amount_minor >= 0 ||
        s.replaces_estimate_minor !== 0 ||
        s.consumes_commitment_minor !== 0
      )
        throw new Error(
          "Credit cannot restore or consume estimated obligation",
        );
      const original =
        s.credited_source_id === null
          ? undefined
          : originals.get(s.credited_source_id);
      if (
        !original ||
        original.status === "rejected" ||
        original.amount_minor === null ||
        original.amount_minor <= 0 ||
        original.relation_coverage !== "complete"
      ) {
        issues.push("unresolved_credit_original:" + s.source_id);
        continue;
      }
      const total =
        (credits.get(original.source_id) ?? 0n) - BigInt(s.amount_minor);
      if (total > BigInt(original.amount_minor))
        throw new Error("Credit exceeds its exact original allocation");
      credits.set(original.source_id, total);
    } else if (s.amount_minor < 0) throw new Error("Negative noncredit source");
    if (s.replaces_estimate_minor !== null)
      replaced += BigInt(s.replaces_estimate_minor);
    if (s.consumes_commitment_minor !== null)
      consumed += BigInt(s.consumes_commitment_minor);
    if (s.status === "confirmed") confirmed += BigInt(s.amount_minor);
    else preliminary += BigInt(s.amount_minor);
  }
  if (input.estimate_minor !== null && replaced > BigInt(input.estimate_minor))
    throw new Error("Estimate replacement exceeds obligation");
  if (
    input.committed_minor !== null &&
    consumed > BigInt(input.committed_minor)
  )
    throw new Error("Commitment consumption exceeds obligation");
  const complete = issues.length === 0;
  const estimateRemaining =
    complete && input.estimate_minor !== null
      ? minor(BigInt(input.estimate_minor) - replaced)
      : null;
  const commitmentRemaining =
    complete && input.committed_minor !== null
      ? minor(BigInt(input.committed_minor) - consumed)
      : null;
  const remaining =
    estimateRemaining !== null && commitmentRemaining !== null
      ? Math.max(estimateRemaining, commitmentRemaining)
      : null;
  const known = minor(confirmed + preliminary);
  return {
    schema_version: "operations-cost-obligation-v1",
    calculation_version: "operations-obligation-replacement-v1",
    organization_id: input.organization_id,
    project_id: input.project_id,
    obligation_id: input.obligation_id,
    currency: input.currency,
    cost_basis: input.cost_basis,
    coverage: complete ? "complete" : "unavailable",
    issues,
    source_ids: input.sources.map((s) => s.source_id),
    confirmed_minor: minor(confirmed),
    preliminary_minor: minor(preliminary),
    known_cost_minor: known,
    estimate_remaining_minor: estimateRemaining,
    commitment_remaining_minor: commitmentRemaining,
    remaining_minor: remaining,
    eac_minor:
      remaining === null
        ? null
        : minor(confirmed + preliminary + BigInt(remaining)),
  };
}
