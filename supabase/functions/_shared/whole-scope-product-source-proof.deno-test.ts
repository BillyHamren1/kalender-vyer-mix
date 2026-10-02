import {
  parseWholeScopeProductPublicationCommand,
  wholeScopeProductCanonicalJson,
  wholeScopeProductCaptureFingerprint,
  wholeScopeProductCaptureCurrentnessBytes,
} from "./whole-scope-product-source-proof.ts";
import { scopeInvoiceInventoryFingerprint } from "./project-scope-invoice-kernel-evidence.ts";

function assert(value: unknown): asserts value {
  if (!value) throw new Error("product source encoding assertion");
}
async function deny(action: () => unknown) {
  let denied = false;
  try {
    await action();
  } catch {
    denied = true;
  }
  assert(denied);
}
const id = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
const hash = "a".repeat(64);
const command = () => ({
  schema_version: "operations-whole-scope-product-publication-command.v1",
  economic_scope_id: id(1),
  expected_scope_revision: 1,
  expected_membership_fingerprint: hash,
  expected_composition_revision: 1,
  expected_composition_fingerprint: hash,
  expected_publication_revision: 0,
  idempotency_key: "synthetic-product-command",
  reason: "Synthetic prerequisite only",
});
async function capture() {
  const child = {
    schema_version: "operations-invoice-obligation-kernel-evidence.v1",
    state: "captured",
    authority_scope: "local_project_only",
    source_currentness: "saved_receiver_heads_only",
    organization_id: id(1),
    project_id: id(2),
    obligation_id: id(3),
    category_coverage: "unavailable",
    source_coverage: "unavailable",
    as_of: "2026-10-02T00:00:00.000Z",
    baseline: {
      event_id: id(4),
      revision: 1,
      fingerprint: hash,
      evidence_basis: "operations_manual",
      currency: "SEK",
      category: "supplier",
      cost_basis: "invoice",
      estimate_minor: null as number | null,
      committed_minor: null,
    },
    sources: [],
    diagnostics: ['synthetic Unicode 😀 "quote"\nline'],
    credit_eligible: false,
    shadow_only: true,
    eac_minor: null,
    remaining_minor: null,
  };
  return {
    schema_version: "operations-scope-invoice-kernel-evidence.v1",
    organization_id: id(1),
    economic_scope_id: id(5),
    scope_snapshot_id: id(6),
    scope_revision: 1,
    membership_fingerprint: hash,
    composition_snapshot_id: id(7),
    composition_revision: 1,
    composition_fingerprint: hash,
    root_kind: "project",
    root_id: id(2),
    currency: "SEK",
    membership_currentness: "as_of_graph",
    source_currentness: "saved_receiver_heads_only",
    captured_inventory_matches_current: true,
    captured_inventory_fingerprint: await scopeInvoiceInventoryFingerprint([]),
    as_of: "2026-10-02T00:00:00.000Z",
    members: [
      {
        project_id: id(2),
        obligation_id: id(3),
        captured_baseline_event_id: id(4),
        captured_baseline_revision: 1,
        captured_baseline_fingerprint: hash,
        kernel_evidence: child,
      },
    ],
    source_inventory: [],
    saved_source_references: [],
    diagnostics: ["synthetic source coverage unavailable"],
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
Deno.test(
  "exact identity-only command never accepts money actor grant or service success",
  async () => {
    const parsed = parseWholeScopeProductPublicationCommand(
      JSON.stringify(command()),
    );
    assert(parsed.expected_publication_revision === 0);
    for (const extra of [
      { actor_id: id(2) },
      { amount_minor: 0 },
      { projection: {} },
      { export_grant: {} },
      { verified: true },
    ])
      await deny(() =>
        parseWholeScopeProductPublicationCommand(
          JSON.stringify({ ...command(), ...extra }),
        ),
      );
  },
);
Deno.test(
  "strict safe revisions and fingerprints reject coercion negative zero overflow",
  async () => {
    for (const value of ["1", -1, 1.5, Number.MAX_SAFE_INTEGER, Infinity, null])
      await deny(() =>
        parseWholeScopeProductPublicationCommand(
          JSON.stringify({
            ...command(),
            expected_publication_revision: value,
          }),
        ),
      );
    await deny(() =>
      parseWholeScopeProductPublicationCommand(
        JSON.stringify(command()).replace(
          '"expected_publication_revision":0',
          '"expected_publication_revision":-0',
        ),
      ),
    );
    await deny(() =>
      parseWholeScopeProductPublicationCommand(
        JSON.stringify({
          ...command(),
          expected_membership_fingerprint: hash.toUpperCase(),
        }),
      ),
    );
  },
);
Deno.test(
  "Unicode scalar audit limits match SQL with supplementary characters",
  async () => {
    assert(
      parseWholeScopeProductPublicationCommand(
        JSON.stringify({
          ...command(),
          idempotency_key: "😀".repeat(200),
          reason: "😀".repeat(3),
        }),
      ).reason === "😀".repeat(3),
    );
    for (const patch of [
      { idempotency_key: "😀".repeat(201) },
      { reason: "😀".repeat(2) },
      { reason: "😀".repeat(1001) },
      { reason: " leading" },
      { reason: "trailing\u00a0" },
    ])
      await deny(() =>
        parseWholeScopeProductPublicationCommand(
          JSON.stringify({ ...command(), ...patch }),
        ),
      );
  },
);
Deno.test(
  "duplicate keys malformed Unicode BOM hostile objects and body bounds fail closed",
  async () => {
    let touched = 0;
    await deny(() =>
      parseWholeScopeProductPublicationCommand({
        toString() {
          touched++;
          return JSON.stringify(command());
        },
      } as unknown as string),
    );
    assert(touched === 0);
    await deny(() => wholeScopeProductCanonicalJson('["x",{"x":1,"x":2}]'));
    await deny(() => wholeScopeProductCanonicalJson('"\ud800"'));
    await deny(() => wholeScopeProductCanonicalJson("\ufeff{}"));
    await deny(() =>
      wholeScopeProductCanonicalJson(JSON.stringify("x".repeat(4194304))),
    );
  },
);
Deno.test(
  "canonical UTF8 C order and escaping independent expected bytes",
  () => {
    const actual = wholeScopeProductCanonicalJson(
      JSON.stringify({
        "😀": 'line\n"quote"',
        "\ue000": null,
        z: true,
        a: 9007199254740991,
      }),
    );
    assert(
      actual ===
        '{"a":9007199254740991,"z":true,"":null,"😀":"line\\n\\"quote\\""}',
    );
  },
);
Deno.test(
  "full original observations enter purpose hash while comparison omits only two locations",
  async () => {
    const a = await capture(),
      b = structuredClone(a);
    b.as_of = "2026-10-02T00:00:01.000Z";
    b.members[0].kernel_evidence.as_of = "2026-10-02T00:00:01.000Z";
    assert(
      (await wholeScopeProductCaptureFingerprint(JSON.stringify(a))) !==
        (await wholeScopeProductCaptureFingerprint(JSON.stringify(b))),
    );
    assert(
      (await wholeScopeProductCaptureCurrentnessBytes(JSON.stringify(a))) ===
        (await wholeScopeProductCaptureCurrentnessBytes(JSON.stringify(b))),
    );
    const canonical = wholeScopeProductCanonicalJson(
      JSON.stringify(["operations-whole-scope-product-evidence-v1", a]),
    );
    const independent = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(canonical),
        ),
      ),
      (v) => v.toString(16).padStart(2, "0"),
    ).join("");
    assert(
      (await wholeScopeProductCaptureFingerprint(JSON.stringify(a))) ===
        independent,
    );
  },
);
Deno.test(
  "currentness cannot erase null status baseline source tokens or diagnostics",
  async () => {
    const a = await capture();
    const expected = await wholeScopeProductCaptureCurrentnessBytes(
      JSON.stringify(a),
    );
    const b = structuredClone(a);
    b.members[0].kernel_evidence.baseline.estimate_minor = 1;
    assert(
      (await wholeScopeProductCaptureCurrentnessBytes(JSON.stringify(b))) !==
        expected,
    );
    const c = structuredClone(a);
    c.diagnostics.push("genuine advance must remain visible");
    assert(
      (await wholeScopeProductCaptureCurrentnessBytes(JSON.stringify(c))) !==
        expected,
    );
    const d = structuredClone(a);
    d.members[0].kernel_evidence.diagnostics.push(
      "as_of is only a diagnostic string",
    );
    assert(
      (await wholeScopeProductCaptureCurrentnessBytes(JSON.stringify(d))) !==
        expected,
    );
    await deny(() =>
      wholeScopeProductCaptureCurrentnessBytes(
        JSON.stringify({ ...a, shadow_only: false }),
      ),
    );
  },
);

Deno.test(
  "raw numeric exactness denies rounded fraction and nonzero underflow before JS Number",
  async () => {
    const raw = JSON.stringify(command());
    for (const token of [
      "9007199254740990.2",
      "0.000000000000000000001",
      "1e-999",
      "9007199254740991.1",
      "-1e-999",
    ])
      await deny(() =>
        parseWholeScopeProductPublicationCommand(
          raw.replace(
            '"expected_publication_revision":0',
            '"expected_publication_revision":' + token,
          ),
        ),
      );
    for (const token of ["1.0", "10e-1", "0.1e1", "1e0", "0.00", "0e1"]) {
      const parsed = parseWholeScopeProductPublicationCommand(
        raw.replace(
          '"expected_publication_revision":0',
          '"expected_publication_revision":' + token,
        ),
      );
      assert(
        parsed.expected_publication_revision ===
          (token === "0.00" || token === "0e1" ? 0 : 1),
      );
    }
  },
);
