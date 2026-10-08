/** TEST ONLY: synthetic projection inputs, never persisted source authority. */
import {
  calculateProjectCostObligation,
  type CostObligationInput,
} from "../../supabase/functions/_shared/project-cost-obligations.ts";
import {
  projectLocalInvoiceKernelEvidence,
  type LocalInvoiceKernelEvidence,
} from "../../supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts";
import {
  projectScopeInvoiceKernelEvidence,
  scopeInvoiceInventoryFingerprint,
  type ScopeInvoiceKernelEvidence,
  type SavedScopeInvoiceReference,
} from "../../supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts";
import {
  calculateOperationalEAC,
  type OperationalEACInput,
  type ForecastCategory,
} from "../../supabase/functions/_shared/project-operational-eac.ts";
import { verifyInvoiceKernelVectors } from "./operations-invoice-kernel-vector-test.ts";
import { verifyScopeInvoiceKernelVectors } from "./operations-scope-invoice-kernel-vector-test.ts";
const id = (c: string) =>
  c === "5"
    ? "55555555-5555-4555-8555-555555555555"
    : `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
async function scopeFixture(): Promise<ScopeInvoiceKernelEvidence> {
  const members = ["5", "7"].map((c, i) => ({
    project_id: id(c),
    obligation_id: id(i ? "c" : "a"),
    captured_baseline_event_id: id(i ? "d" : "b"),
    captured_baseline_revision: 1,
    captured_baseline_fingerprint: "a".repeat(64),
    kernel_evidence: {
      schema_version:
        "operations-invoice-obligation-kernel-evidence.v1" as const,
      state: "captured" as const,
      authority_scope: "local_project_only" as const,
      source_currentness: "saved_receiver_heads_only" as const,
      organization_id: id("1"),
      project_id: id(c),
      obligation_id: id(i ? "c" : "a"),
      category_coverage: "unavailable" as const,
      source_coverage: "unavailable" as const,
      as_of: "2026-10-02T00:00:00Z",
      baseline: {
        event_id: id(i ? "d" : "b"),
        revision: 1,
        fingerprint: "a".repeat(64),
        evidence_basis: "operations_manual" as const,
        currency: "SEK",
        category: "supplier" as const,
        cost_basis: "invoice" as const,
        estimate_minor: 1000000,
        committed_minor: null,
      },
      sources: [
        {
          source_anchor: String(i).repeat(64),
          binding_event_id: id(i ? "3" : "2"),
          source_organization_id: id("9"),
          invoice_id: id("e"),
          source_snapshot_id: id("4"),
          source_economic_revision: 1,
          source_economic_fingerprint: "b".repeat(64),
          source_raw_sha256: "c".repeat(64),
          resolved: true,
          reason: null,
          current_snapshot_id: id("4"),
          current_raw_sha256: "c".repeat(64),
          status: (i ? "confirmed" : "preliminary") as
            "confirmed" | "preliminary",
          amount_minor: 270000,
          policy_state: "current" as const,
          policy_event_id: id(i ? "8" : "6"),
          policy_revision: 1,
          policy_fingerprint: "d".repeat(64),
          replaces_estimate_minor: 300000,
          consumes_commitment_minor: null,
        },
      ],
      diagnostics: [],
      credit_eligible: false as const,
      shadow_only: true as const,
      eac_minor: null,
      remaining_minor: null,
    },
  }));
  const inventory = members.map((m) => {
    const s = m.kernel_evidence.sources[0];
    return {
      source_anchor: s.source_anchor,
      project_id: m.project_id,
      obligation_id: m.obligation_id,
      binding_event_id: s.binding_event_id,
      source_organization_id: s.source_organization_id,
      invoice_id: s.invoice_id,
      source_snapshot_id: s.source_snapshot_id,
      source_economic_revision: s.source_economic_revision,
      source_economic_fingerprint: s.source_economic_fingerprint,
      source_raw_sha256: s.source_raw_sha256,
      current_snapshot_id: s.current_snapshot_id,
      current_raw_sha256: s.current_raw_sha256,
      policy_state: s.policy_state,
      policy_event_id: s.policy_event_id,
      policy_revision: s.policy_revision,
      policy_fingerprint: s.policy_fingerprint,
      mapping_state: "charging" as const,
      reason: null,
    };
  });
  const saved = inventory.map((s) => ({
    source_anchor: s.source_anchor,
    project_id: s.project_id,
    obligation_id: s.obligation_id,
    binding_event_id: s.binding_event_id,
    source_snapshot_id: s.current_snapshot_id,
    source_economic_revision: s.source_economic_revision,
    source_economic_fingerprint: s.source_economic_fingerprint,
    source_raw_sha256: s.current_raw_sha256,
    binding_state: "bound_original" as const,
    policy_state: s.policy_state,
    policy_event_id: s.policy_event_id,
    policy_revision: s.policy_revision,
    policy_fingerprint: s.policy_fingerprint,
  }));
  return {
    schema_version: "operations-scope-invoice-kernel-evidence.v1",
    organization_id: id("1"),
    economic_scope_id: id("f"),
    scope_snapshot_id: id("a"),
    scope_revision: 1,
    membership_fingerprint: "e".repeat(64),
    composition_snapshot_id: id("b"),
    composition_revision: 1,
    composition_fingerprint: "f".repeat(64),
    root_kind: "large_project",
    root_id: id("c"),
    currency: "SEK",
    membership_currentness: "as_of_graph",
    source_currentness: "saved_receiver_heads_only",
    captured_inventory_matches_current: true,
    captured_inventory_fingerprint:
      await scopeInvoiceInventoryFingerprint(inventory),
    as_of: "2026-10-02T00:00:00Z",
    members,
    source_inventory: inventory,
    saved_source_references: saved as SavedScopeInvoiceReference[],
    diagnostics: [],
    category_coverage: {
      personnel: "unavailable",
      supplier: "unavailable",
      catering: "unavailable",
      other: "unavailable",
    },
    source_coverage: "unavailable",
    credit_eligible: false,
    remaining_minor: null,
    eac_minor: null,
    budget_minor: null,
    shadow_only: true,
  };
}

type Vector = {
  label: string;
  function: "obligation" | "leaf" | "scope";
  input: unknown;
  expected: unknown;
  error: string | null;
};
const vectors: Vector[] = [];
async function add(label: string, fn: Vector["function"], input: unknown) {
  let expected: unknown = null,
    error: string | null = null;
  try {
    expected =
      fn === "obligation"
        ? calculateProjectCostObligation(input as CostObligationInput)
        : fn === "leaf"
          ? projectLocalInvoiceKernelEvidence(input)
          : await projectScopeInvoiceKernelEvidence(input);
  } catch (e) {
    error = (e as Error).message;
  }
  vectors.push({ label, function: fn, input, expected, error });
}
function leaf(): LocalInvoiceKernelEvidence {
  const e = structuredClone(baseScope.members[0].kernel_evidence);
  e.sources[0].amount_minor = 540000;
  e.sources[0].replaces_estimate_minor = 700000;
  return e;
}
const baseScope = await scopeFixture();
function exclude(e: LocalInvoiceKernelEvidence, reason = "source_changed") {
  for (const s of e.sources)
    Object.assign(s, {
      resolved: false,
      reason,
      current_snapshot_id: null,
      current_raw_sha256: null,
      status: null,
      amount_minor: null,
      policy_state: "stale",
      replaces_estimate_minor: null,
      consumes_commitment_minor: null,
    });
}
async function sync(e: ScopeInvoiceKernelEvidence) {
  for (const m of e.members)
    for (const s of m.kernel_evidence.sources) {
      const i = e.source_inventory.find(
        (i) => i.source_anchor === s.source_anchor,
      )!;
      Object.assign(i, {
        current_snapshot_id: s.current_snapshot_id,
        current_raw_sha256: s.current_raw_sha256,
        policy_state: s.policy_state,
        policy_event_id: s.policy_event_id,
        policy_revision: s.policy_revision,
        policy_fingerprint: s.policy_fingerprint,
        mapping_state: s.resolved ? "charging" : "excluded",
        reason: s.reason,
      });
    }
  e.captured_inventory_matches_current = false;
  e.diagnostics = ["captured_inventory_changed"];
  e.captured_inventory_fingerprint = await scopeInvoiceInventoryFingerprint(
    e.source_inventory,
  );
  return e;
}
// The exact original six/ five labels and assertions also run against these catalogs.
const invoiceCatalog = [];
for (const label of [
  "missing_policy",
  "current_policy",
  "coequal_v2",
  "newer_v2",
  "empty_catalog",
  "time_basis",
]) {
  const e = leaf();
  if (label === "missing_policy")
    Object.assign(e.sources[0], {
      policy_state: "missing",
      policy_event_id: null,
      policy_revision: null,
      policy_fingerprint: null,
      replaces_estimate_minor: null,
    });
  if (label === "coequal_v2") {
    e.sources[0].current_snapshot_id = id("6");
    e.sources[0].current_raw_sha256 = "f".repeat(64);
  }
  if (label === "newer_v2") exclude(e);
  if (label === "empty_catalog") e.sources = [];
  if (label === "time_basis") {
    e.state = "unsupported_basis";
    e.baseline.cost_basis = "time";
    e.sources = [];
    e.diagnostics = ["unsupported_cost_basis"];
  }
  invoiceCatalog.push({ label, evidence: JSON.stringify(e) });
  await add("invoice6_" + label, "leaf", e);
}
verifyInvoiceKernelVectors(invoiceCatalog);
const scopeCatalog = [];
for (const label of [
  "split_initial",
  "new_policy",
  "coequal_v2",
  "higher_v2",
  "empty_selection",
]) {
  const e = structuredClone(baseScope);
  for (const m of e.members)
    m.kernel_evidence.sources[0].status = "preliminary";
  const unsupported = structuredClone(e.members[0]);
  unsupported.project_id = id("8");
  unsupported.obligation_id = id("9");
  unsupported.captured_baseline_event_id = id("e");
  Object.assign(unsupported.kernel_evidence, {
    project_id: unsupported.project_id,
    obligation_id: unsupported.obligation_id,
    state: "unsupported_basis",
    sources: [],
    diagnostics: ["unsupported_cost_basis"],
  });
  Object.assign(unsupported.kernel_evidence.baseline, {
    event_id: id("e"),
    cost_basis: "time",
  });
  e.members.push(unsupported);
  if (label === "new_policy" || label === "coequal_v2") {
    const s = e.members[0].kernel_evidence.sources[0];
    s.replaces_estimate_minor = 350000;
    s.policy_revision = 2;
    s.policy_fingerprint = "e".repeat(64);
    if (label === "coequal_v2") {
      s.current_snapshot_id = id("6");
      s.current_raw_sha256 = "f".repeat(64);
    }
    await sync(e);
  }
  if (label === "higher_v2") {
    for (const m of e.members.filter(
      (m) => m.kernel_evidence.state === "captured",
    ))
      exclude(m.kernel_evidence);
    await sync(e);
  }
  if (label === "empty_selection") {
    e.members = [];
    e.source_inventory = [];
    e.saved_source_references = [];
    e.captured_inventory_fingerprint = await scopeInvoiceInventoryFingerprint(
      [],
    );
  }
  scopeCatalog.push({ label, evidence: JSON.stringify(e) });
  await add("scope5_" + label, "scope", e);
}
// Existing native vector assertions expect their exact real project selectors.
await verifyScopeInvoiceKernelVectors(scopeCatalog);
const obligation: CostObligationInput = {
  organization_id: id("1"),
  project_id: id("5"),
  obligation_id: id("a"),
  currency: "SEK",
  cost_basis: "invoice",
  estimate_minor: 1000,
  committed_minor: 900,
  relation_coverage: "complete",
  sources: [],
};
const source = {
  source_id: "original",
  organization_id: obligation.organization_id,
  project_id: obligation.project_id,
  obligation_id: obligation.obligation_id,
  currency: "SEK",
  kind: "invoice" as const,
  status: "confirmed" as const,
  amount_minor: 600,
  replaces_estimate_minor: 500,
  consumes_commitment_minor: 400,
  credited_source_id: null,
  relation_coverage: "complete" as const,
};
const variants: Array<[string, (e: CostObligationInput) => void]> = [
  ["empty", () => {}],
  [
    "confirmed",
    (e) => {
      e.sources = [{ ...source }];
    },
  ],
  [
    "partial",
    (e) => {
      e.relation_coverage = "unresolved";
      e.committed_minor = null;
      e.sources = [{ ...source, consumes_commitment_minor: null }];
    },
  ],
  [
    "unknown_baseline",
    (e) => {
      e.estimate_minor = null;
      e.committed_minor = null;
    },
  ],
  [
    "null_source",
    (e) => {
      e.sources = [{ ...source, amount_minor: null }];
    },
  ],
  [
    "rejected",
    (e) => {
      e.sources = [{ ...source, status: "rejected" }];
    },
  ],
  [
    "unresolved",
    (e) => {
      e.sources = [{ ...source, relation_coverage: "unresolved" }];
    },
  ],
  [
    "missing_policy",
    (e) => {
      e.sources = [
        {
          ...source,
          replaces_estimate_minor: null,
          consumes_commitment_minor: null,
        },
      ];
    },
  ],
  [
    "noncharging_time",
    (e) => {
      e.sources = [
        {
          ...source,
          kind: "time",
          amount_minor: null,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
        },
      ];
    },
  ],
  [
    "noncharging_time_consumes",
    (e) => {
      e.sources = [
        {
          ...source,
          kind: "time",
          replaces_estimate_minor: 1,
          consumes_commitment_minor: 0,
        },
      ];
    },
  ],
  [
    "credit_before_original",
    (e) => {
      e.sources = [
        {
          ...source,
          source_id: "credit",
          kind: "credit",
          amount_minor: -200,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: "original",
        },
        { ...source },
      ];
    },
  ],
  [
    "credit_unresolved",
    (e) => {
      e.sources = [
        {
          ...source,
          source_id: "credit",
          kind: "credit",
          amount_minor: -200,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: "missing",
        },
      ];
    },
  ],
  [
    "credit_numeric_reference",
    (e) => {
      e.sources = [
        { ...source, source_id: "1" },
        {
          ...source,
          source_id: "credit",
          kind: "credit",
          amount_minor: -200,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: 1 as unknown as string,
        },
      ];
    },
  ],
  [
    "credit_capacity",
    (e) => {
      e.sources = [
        { ...source },
        {
          ...source,
          source_id: "credit",
          kind: "credit",
          amount_minor: -601,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: "original",
        },
      ];
    },
  ],
  [
    "two_credit_capacity",
    (e) => {
      e.sources = [
        { ...source },
        ...["c1", "c2"].map((source_id) => ({
          ...source,
          source_id,
          kind: "credit" as const,
          amount_minor: -301,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: "original",
        })),
      ];
    },
  ],
  [
    "credit_rejected_original",
    (e) => {
      e.sources = [
        { ...source, status: "rejected" },
        {
          ...source,
          source_id: "credit",
          kind: "credit",
          amount_minor: -200,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
          credited_source_id: "original",
        },
      ];
    },
  ],
  [
    "negative_original",
    (e) => {
      e.sources = [{ ...source, amount_minor: -1 }];
    },
  ],
  [
    "replacement_overflow",
    (e) => {
      e.sources = [{ ...source, replaces_estimate_minor: 1001 }];
    },
  ],
  [
    "consumption_overflow",
    (e) => {
      e.sources = [{ ...source, consumes_commitment_minor: 901 }];
    },
  ],
  [
    "duplicate_source",
    (e) => {
      e.sources = [{ ...source }, { ...source }];
    },
  ],
  [
    "cross_currency",
    (e) => {
      e.sources = [{ ...source, currency: "EUR" }];
    },
  ],
  [
    "fraction",
    (e) => {
      e.estimate_minor = 0.5;
    },
  ],
  [
    "unsafe_input",
    (e) => {
      e.estimate_minor = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
  [
    "aggregate_overflow",
    (e) => {
      e.sources = [
        {
          ...source,
          amount_minor: Number.MAX_SAFE_INTEGER,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
        },
        {
          ...source,
          source_id: "second",
          amount_minor: 1,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
        },
      ];
    },
  ],
  [
    "eac_overflow",
    (e) => {
      e.estimate_minor = Number.MAX_SAFE_INTEGER;
      e.committed_minor = Number.MAX_SAFE_INTEGER;
      e.sources = [
        {
          ...source,
          amount_minor: 1,
          replaces_estimate_minor: 0,
          consumes_commitment_minor: 0,
        },
      ];
    },
  ],
  [
    "ecmascript_whitespace_id",
    (e) => {
      e.sources = [{ ...source, source_id: "\ufeff\u00a0\u2028" }];
    },
  ],
  [
    "unicode_id",
    (e) => {
      e.sources = [{ ...source, source_id: 'å😀\n"' }];
    },
  ],
];
for (const [label, change] of variants) {
  const e = structuredClone(obligation);
  change(e);
  await add("kernel_" + label, "obligation", e);
}
const unknown = leaf();
unknown.baseline.estimate_minor = null;
unknown.sources[0].replaces_estimate_minor = null;
await add("leaf_unknown_estimate", "leaf", unknown);
const partial = structuredClone(baseScope);
exclude(partial.members[0].kernel_evidence);
await sync(partial);
await add("scope_partial_excluded", "scope", partial);
const overflow = structuredClone(baseScope);
for (const m of overflow.members) {
  Object.assign(m.kernel_evidence.sources[0], {
    amount_minor: Number.MAX_SAFE_INTEGER,
    replaces_estimate_minor: 0,
    consumes_commitment_minor: null,
  });
}
await add("scope_aggregate_overflow", "scope", overflow);
// Version/budget authority boundary: genuine unchanged EAC contract rejects malformed
// source evidence; this is TS-only validation, not SQL authority parity or an EAC mapper.
const eac: OperationalEACInput = {
  schema_version: "operations-project-cost-forecast-input-v1",
  organization_id: obligation.organization_id,
  project_id: obligation.project_id,
  currency: "SEK",
  source_revision: 1,
  scope_coverage: "unresolved",
  scope_reference: "isolated-prototype",
  category_coverage: ["personnel", "supplier", "catering", "other"].map(
    (category) => ({
      category: category as ForecastCategory,
      coverage: "unavailable",
      source_reference: "not-covered",
    }),
  ),
  booking_budgets: [],
  obligations: [
    {
      category: "supplier",
      baseline_revision: 1,
      baseline_fingerprint: "a".repeat(64),
      input: { ...obligation, sources: [source] },
      source_evidence: [
        {
          source_id: "original",
          source_system: "finance",
          source_stream_id: "invoice",
          source_revision: 1,
          source_fingerprint: "b".repeat(64),
        },
      ],
    },
  ],
};
const eacOutput = await calculateOperationalEAC(eac);
if (
  eacOutput.eac_minor !== null ||
  eacOutput.budget_minor !== null ||
  eacOutput.budget_variance_minor !== null ||
  eacOutput.coverage !== "unavailable"
)
  throw new Error("isolated_eac_promoted_unknowns");
for (const value of [0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
  const bad = structuredClone(eac);
  bad.obligations[0].source_evidence[0].source_revision = value as number;
  let denied = false;
  try {
    await calculateOperationalEAC(bad);
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("bad_source_version_accepted");
}
// Optional original SQL-produced catalogs, validated with their existing exact tests.
if (Deno.args.length === 3) {
  for (const [path, fn, verify] of [
    [Deno.args[1], "leaf", verifyInvoiceKernelVectors],
    [Deno.args[2], "scope", verifyScopeInvoiceKernelVectors],
  ] as const) {
    const rows = JSON.parse(await Deno.readTextFile(path));
    await verify(rows);
    for (const row of rows)
      await add(
        "actual_catalog_" + fn + "_" + row.label,
        fn,
        JSON.parse(row.evidence),
      );
  }
} else if (Deno.args.length !== 1)
  throw new Error(
    "expected_private_output_and_optional_invoice_scope_catalogs",
  );
await Deno.writeTextFile(
  Deno.args[0],
  JSON.stringify({
    schema: "whole-scope-projection-prototype-vectors.v1",
    vectors,
    ts_only_source_version_denials: 5,
  }),
  { createNew: true, mode: 0o600 },
);
console.log("whole-scope-projection-ts-vectors PASS " + vectors.length);
