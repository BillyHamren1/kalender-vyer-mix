import assert from "node:assert/strict";
import test from "node:test";
import { projectHiredObligationCoverage } from "./hired-obligation-coverage.ts";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const h = (c: string) => c.repeat(64);
const metadata = (
  kind: "time" | "catering",
  project = id(3),
  revision = 1,
  amount: number | null = 60000,
) => ({
  source_status: "submitted",
  project_cost_status: "preliminary",
  currency: "SEK",
  minutes: 120,
  amount_minor: amount,
  coverage: amount === null ? "missing_rate" : "complete",
  source_kind: kind,
  source_stream_id: `${kind}:stream:one`,
  source_line_id: kind === "catering" ? id(91) : "line-one",
  source_revision: revision,
  publication_fingerprint: h(kind === "time" ? "a" : "b"),
  worker_id: id(90),
  project_id: project,
  source_currentness: "saved_publication_head_only",
});
const authority = ({
  identity = h("1"),
  project = id(3),
  obligation = id(4),
  assignment = id(5),
  binding = id(6),
  current = metadata("time", project),
  historical = current,
  state = "current_operational_only",
  reason = null as string | null,
} = {}) => ({
  schema_version: "operations-hired-source-authority.v1",
  organization_id: id(1),
  project_id: project,
  obligation_id: obligation,
  source_identity: identity,
  state,
  reason,
  current_source: state === "current_operational_only" ? current : null,
  historical_source: historical,
  assignment_event_id: assignment,
  assignment_revision: 1,
  assignment_fingerprint: h("2"),
  basis_event_id: id(7),
  invoice_binding_event_id: binding,
  disposition: "operational_only",
  replaces_estimate_minor: 0,
  consumes_commitment_minor: 0,
  category_coverage: "unavailable",
  source_coverage: "unavailable",
  eac_minor: null,
  remaining_minor: null,
  shadow_only: true,
  credit_eligible: false,
});
const invoice = ({
  anchor = h("3"),
  project = id(3),
  obligation = id(4),
  binding = id(6),
  mapping = "charging" as "charging" | "excluded" | "unsupported_basis",
  reason = null as string | null,
} = {}) => ({
  source_anchor: anchor,
  project_id: project,
  obligation_id: obligation,
  binding_event_id: binding,
  source_economic_revision: 1,
  source_economic_fingerprint: h("4"),
  mapping_state: mapping,
  reason,
});
const input = () => ({
  schema_version: "operations-hired-scope-coverage-input.v1",
  organization_id: id(1),
  economic_scope_id: id(2),
  root_kind: "large_project",
  root_id: id(20),
  scope_snapshot_id: id(21),
  scope_revision: 3,
  membership_fingerprint: h("5"),
  composition_snapshot_id: id(22),
  composition_revision: 4,
  composition_fingerprint: h("6"),
  captured_inventory_fingerprint: h("7"),
  membership_currentness: "as_of_graph",
  source_currentness: "saved_receiver_heads_only",
  source_project_ids: [id(3), id(30)],
  local_booking_ids: ["Booking-A", "Booking-B"],
  hired_sources: [] as Array<{ authority: unknown; invoice_inventory: unknown }>,
});

test("two operational sources share one existing invoice charge without another total", () => {
  const value = input();
  value.hired_sources = [
    { authority: authority(), invoice_inventory: invoice() },
    {
      authority: authority({
        identity: h("8"),
        assignment: id(8),
        current: metadata("catering", id(3), 2, null),
        historical: metadata("catering", id(3), 2, null),
      }),
      invoice_inventory: invoice(),
    },
  ];
  const result = projectHiredObligationCoverage(value);
  assert.equal(result.localBookingCount, 2);
  assert.equal(result.sourceProjectCount, 2);
  assert.equal(result.operationalSources.length, 2);
  assert.equal(result.economicChargeReferences.length, 1);
  assert.equal(result.economicChargeReferences[0].countedBy, "scope_invoice_capture");
  assert.equal(result.additional_cost_minor, null);
  assert.equal(result.operationalSources[0].sourceCurrency, "SEK");
  assert.equal(result.operationalSources[1].sourceCalculatedAmountMinor, null);
  assert.equal(result.operationalSources[1].economicCostAuthority, "existing_invoice_allocation_only");
  assert.equal(result.eac_minor, null);
  assert.equal(result.budget_minor, null);
  assert.equal(result.margin_minor, null);
  assert.equal(result.source_coverage, "unavailable");
  assert.equal(result.runtime_admission, false);
  assert(!Object.hasOwn(result, "currency"));
  assert(result.diagnostics.some((x) => x.startsWith("hired_source_rate_unavailable:")));
});

test("a corrected or withdrawn source remains historical and never becomes zero", () => {
  for (const reason of [
    "source_or_invoice_changed",
    "saved_source_line_unavailable",
  ]) {
    const value = input();
    value.hired_sources = [{
      authority: authority({
        state: "unresolved",
        reason,
        historical: metadata("time", id(3), 1, 60000),
      }),
      invoice_inventory: invoice(),
    }];
    const result = projectHiredObligationCoverage(value);
    assert.equal(result.operationalSources[0].state, "unresolved");
    assert.equal(result.operationalSources[0].sourceCalculatedAmountMinor, 60000);
    assert.equal(result.operationalSources[0].additionalCostMinor, null);
    assert.equal(result.economicChargeReferences.length, 1);
    assert(result.diagnostics.some((x) => x.includes(reason)));
  }
});

test("an excluded invoice relation is visible but cannot become a charge reference", () => {
  const value = input();
  value.hired_sources = [{
    authority: authority(),
    invoice_inventory: invoice({ mapping: "excluded", reason: "source_changed" }),
  }];
  const result = projectHiredObligationCoverage(value);
  assert.equal(result.operationalSources[0].invoiceRelationState, "unavailable");
  assert.equal(result.economicChargeReferences.length, 0);
  assert(result.diagnostics.some((x) => x.startsWith("invoice_relation_unavailable:")));
});

test("empty evidence is not a complete or zero-valued project", () => {
  const result = projectHiredObligationCoverage(input());
  assert.equal(result.state, "no_evidence");
  assert.deepEqual(result.operationalSources, []);
  assert.deepEqual(result.economicChargeReferences, []);
  assert.equal(result.additional_cost_minor, null);
  assert.equal(result.source_coverage, "unavailable");
  assert.equal(result.economic_totals_admission, false);
});

test("cross-project and nonmember joins fail closed", () => {
  const cross = input();
  cross.hired_sources = [{
    authority: authority(),
    invoice_inventory: invoice({ project: id(30) }),
  }];
  assert.throws(() => projectHiredObligationCoverage(cross), /cross_scope_hired_evidence/);
  const foreign = input();
  foreign.hired_sources = [{
    authority: authority({ project: id(99), current: metadata("time", id(99)) }),
    invoice_inventory: invoice({ project: id(99) }),
  }];
  assert.throws(() => projectHiredObligationCoverage(foreign), /cross_scope_hired_evidence/);
});

test("a replay cannot introduce a second source row", () => {
  const value = input();
  const row = { authority: authority(), invoice_inventory: invoice() };
  value.hired_sources = [row, structuredClone(row)];
  assert.throws(() => projectHiredObligationCoverage(value), /duplicate_hired_source_identity/);
});

test("same anchor cannot silently point at another project or obligation", () => {
  const value = input();
  value.hired_sources = [
    { authority: authority(), invoice_inventory: invoice() },
    {
      authority: authority({
        identity: h("9"),
        project: id(30),
        obligation: id(40),
        assignment: id(9),
        binding: id(10),
        current: metadata("time", id(30)),
        historical: metadata("time", id(30)),
      }),
      invoice_inventory: invoice({
        project: id(30),
        obligation: id(40),
        binding: id(10),
      }),
    },
  ];
  assert.throws(
    () => projectHiredObligationCoverage(value),
    /conflicting_hired_invoice_charge_identity/,
  );
});

test("same anchor cannot mix stale revision, fingerprint or mapping evidence", () => {
  for (const changed of [
    { source_economic_revision: 2 },
    { source_economic_fingerprint: h("f") },
    { mapping_state: "excluded", reason: "stale_invoice" },
  ]) {
    const value = input();
    value.hired_sources = [
      { authority: authority(), invoice_inventory: invoice() },
      {
        authority: authority({ identity: h("9"), assignment: id(9) }),
        invoice_inventory: { ...invoice(), ...changed },
      },
    ];
    assert.throws(
      () => projectHiredObligationCoverage(value),
      /conflicting_hired_invoice_charge_identity/,
    );
  }
});

test("missing-rate evidence must remain null", () => {
  const value = input();
  const bad = metadata("time", id(3), 1, 1) as Record<string, unknown>;
  bad.coverage = "missing_rate";
  value.hired_sources = [{
    authority: authority({ current: bad as never, historical: bad as never }),
    invoice_inventory: invoice(),
  }];
  assert.throws(() => projectHiredObligationCoverage(value), /invalid_hired_source_metadata/);
});

test("basis, EAC and coverage fields cannot be promoted by a caller", () => {
  for (const [key, replacement] of [
    ["disposition", "charging"],
    ["replaces_estimate_minor", 1],
    ["consumes_commitment_minor", 1],
    ["category_coverage", "complete"],
    ["source_coverage", "complete"],
    ["eac_minor", 60000],
    ["remaining_minor", 0],
    ["credit_eligible", true],
  ] as const) {
    const value = input();
    const a = authority() as Record<string, unknown>;
    a[key] = replacement;
    value.hired_sources = [{ authority: a, invoice_inventory: invoice() }];
    assert.throws(() => projectHiredObligationCoverage(value));
  }
});

test("membership arrays are canonical, unique and bounded", () => {
  const unsorted = input();
  unsorted.source_project_ids.reverse();
  assert.throws(() => projectHiredObligationCoverage(unsorted), /noncanonical_hired_scope_membership/);
  const duplicate = input();
  duplicate.local_booking_ids = ["Booking-A", "Booking-A"];
  assert.throws(() => projectHiredObligationCoverage(duplicate), /noncanonical_hired_scope_membership/);
  const oversized = input();
  oversized.local_booking_ids = Array.from({ length: 1001 }, (_, n) => `Booking-${String(n).padStart(4, "0")}`);
  assert.throws(() => projectHiredObligationCoverage(oversized), /invalid_hired_scope_membership/);
});
