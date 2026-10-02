import { assertRemainingReaderParity, type RemainingReaderFamily, type ReaderOutcome } from "./remaining-six-compatible-reader-vectors.ts";

const schemas: Record<RemainingReaderFamily, [string, string, string | null]> = {
  parent: ["schema", "operations-scope-obligation-evidence.v1", "generatedAt"],
  drilldown: ["schema", "operations-scope-obligation-drilldown.v1", "asOf"],
  composition: ["schema_version", "operations-scope-obligation-composition-read.v1", null],
  kernel: ["schema_version", "operations-invoice-obligation-kernel-evidence.v1", "as_of"],
  original: ["schema_version", "operations-obligation-original-evidence.v1", null],
  policy: ["schema_version", "operations-obligation-source-policy-projection.v1", null],
};
// Deliberately synthetic comparison fixtures; genuine SQL old/new vectors are a separate gate.
function fixture(family: RemainingReaderFamily): ReaderOutcome {
  const [key, schema, clock] = schemas[family];
  return { kind: "reply", value: {
    [key]: schema, ...(clock === null ? {} : { [clock]: "2026-10-02T13:00:00.123456+00:00" }),
    state: "unresolved", reason: "missing_source_binding", estimate_minor: null,
    observed_amount_minor: 181, committed_minor: Number.MAX_SAFE_INTEGER,
    eac_minor: null, coverage: "unavailable", rows: [
      { id: "00000000-0000-4000-8000-000000001017", revision: 2, amount_minor: null,
        fingerprint: "a".repeat(64), saved_at: "2026-10-02T12:59:00.000000+00:00" },
      { id: "quote\"slash\\Å", revision: 1, amount_minor: 0, quantity: "1.00" },
    ],
  } };
}
function clone<T>(value: T): T { return structuredClone(value); }
function rejects(action: () => void): void {
  try { action(); } catch (error) {
    if (error instanceof Error && error.message === "remaining_reader_parity_failed") return;
    throw new Error("unexpected_private_diagnostic");
  }
  throw new Error("negative_parity_vector_accepted");
}
function reply(outcome: ReaderOutcome): Record<string, unknown> {
  if (outcome.kind !== "reply") throw new Error("synthetic_fixture_error");
  return outcome.value as Record<string, unknown>;
}
for (const family of Object.keys(schemas) as RemainingReaderFamily[]) {
  Deno.test(`${family}: exact reply and JSON key reordering remain equal`, () => {
    const old = fixture(family), next = clone(old);
    next.kind === "reply" && (next.value = Object.fromEntries(Object.entries(reply(next)).reverse()));
    assertRemainingReaderParity(family, old, next);
  });
  Deno.test(`${family}: saved money nulls IDs timestamps and row order stay exact`, () => {
    const old = fixture(family);
    for (const change of [
      (v: Record<string, unknown>) => { v.estimate_minor = 0; },
      (v: Record<string, unknown>) => { v.observed_amount_minor = 182; },
      (v: Record<string, unknown>) => { delete v.eac_minor; },
      (v: Record<string, unknown>) => { (v.rows as Record<string, unknown>[])[0].revision = 3; },
      (v: Record<string, unknown>) => { (v.rows as Record<string, unknown>[])[0].id = "removed-leaf"; },
      (v: Record<string, unknown>) => { (v.rows as Record<string, unknown>[])[0].fingerprint = "b".repeat(64); },
      (v: Record<string, unknown>) => { (v.rows as Record<string, unknown>[])[0].saved_at = "2026-10-02T13:00:00Z"; },
      (v: Record<string, unknown>) => { (v.rows as unknown[]).reverse(); },
      (v: Record<string, unknown>) => { (v.rows as Record<string, unknown>[])[1].quantity = "1"; },
    ]) {
      const next = clone(old); change(reply(next));
      rejects(() => assertRemainingReaderParity(family, old, next));
    }
  });
  Deno.test(`${family}: exact SQLSTATE and fixed message preserve error priority`, () => {
    const old: ReaderOutcome = { kind: "error", sqlstate: "42501", message: "scope_evidence_root_denied" };
    assertRemainingReaderParity(family, old, clone(old));
    rejects(() => assertRemainingReaderParity(family, old, { ...old, sqlstate: "55P03" }));
    rejects(() => assertRemainingReaderParity(family, old, { ...old, message: "invoice_kernel_read_gate_disabled" }));
    rejects(() => assertRemainingReaderParity(family, old, fixture(family)));
  });
}
Deno.test("only original root observation clocks may differ", () => {
  for (const family of ["parent", "drilldown", "kernel"] as const) {
    const old = fixture(family), next = clone(old), clock = schemas[family][2]!;
    reply(next)[clock] = "2026-10-02T14:00:00Z";
    assertRemainingReaderParity(family, old, next);
    for (const bad of [null, "2026-02-30T14:00:00Z", "2026-10-02", "2026-10-02T14:00:00", "2026-10-02T24:00:00Z"]) {
      reply(next)[clock] = bad;
      rejects(() => assertRemainingReaderParity(family, old, next));
    }
    delete reply(next)[clock];
    rejects(() => assertRemainingReaderParity(family, old, next));
  }
  for (const family of ["composition", "original", "policy"] as const) {
    const old = fixture(family), next = clone(old);
    reply(next).as_of = "2026-10-02T14:00:00Z";
    rejects(() => assertRemainingReaderParity(family, old, next));
  }
});
Deno.test("no fields are stripped recursively", () => {
  const old = fixture("parent"), next = clone(old);
  (reply(next).rows as Record<string, unknown>[])[0].generatedAt = "2026-10-02T14:00:00Z";
  rejects(() => assertRemainingReaderParity("parent", old, next));
});
Deno.test("200/201/10000 source service captures are compared without new caps", () => {
  for (const count of [200, 201, 10000]) {
    const old = fixture("composition");
    reply(old).document = { baseline_events: [], source_inventory: Array.from({ length: count }, (_, i) => ({ source_anchor: String(i).padStart(64, "0"), observed_amount_minor: null })) };
    const next = clone(old); assertRemainingReaderParity("composition", old, next);
    ((reply(next).document as Record<string, unknown>).source_inventory as unknown[]).pop();
    rejects(() => assertRemainingReaderParity("composition", old, next));
  }
});
Deno.test("reject unsafe/coerced/non-JSON values and private diagnostics", () => {
  const old = fixture("original");
  for (const bad of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, new Date(), () => 1]) {
    const next = clone(old); reply(next).observed_amount_minor = bad;
    rejects(() => assertRemainingReaderParity("original", old, next));
  }
  const cycle = fixture("original"); reply(cycle).cycle = reply(cycle);
  rejects(() => assertRemainingReaderParity("original", cycle, cycle));
  rejects(() => assertRemainingReaderParity("original", { kind: "error", sqlstate: "22023", message: "x".repeat(16385) }, old));
});

Deno.test("array evidence is captured from own indexed data without caller code", () => {
  const old = fixture("composition");
  let invoked = 0;
  const malicious = [
    (rows: Record<string, unknown>[]) => { Object.defineProperty(rows, "0", { get: () => { invoked++; return reply(old).rows; }, enumerable: true }); },
    (rows: Record<string, unknown>[]) => { Object.defineProperty(rows, Symbol.iterator, { value: function* () { invoked++; yield (reply(old).rows as unknown[])[0]; } }); },
    (rows: Record<string, unknown>[]) => { rows.map = (() => { invoked++; return []; }) as typeof rows.map; },
    (rows: Record<string, unknown>[]) => { Object.setPrototypeOf(rows, { map: () => { invoked++; return []; } }); },
    (rows: Record<string, unknown>[]) => { Object.defineProperty(rows, "secret", { value: 1, enumerable: false }); },
    (rows: Record<string, unknown>[]) => { delete rows[0]; },
  ];
  for (const modify of malicious) {
    const next = clone(old), rows = reply(next).rows as Record<string, unknown>[];
    rows[1].amount_minor = 182; modify(rows);
    rejects(() => assertRemainingReaderParity("composition", old, next));
  }
  if (invoked !== 0) throw new Error("caller_array_code_was_invoked");
});
Deno.test("native strict-select and cast errors compare exact private bytes", () => {
  for (const [sqlstate, message] of [
    ["P0002", "query returned no rows"],
    ["22P02", 'invalid input syntax for type uuid: "synthetic-Å"'],
    ["22003", "bigint out of range"],
  ]) {
    const old: ReaderOutcome = { kind: "error", sqlstate, message };
    assertRemainingReaderParity("kernel", old, clone(old));
    rejects(() => assertRemainingReaderParity("kernel", old, { ...old, message: message + " " }));
  }
});
