import {
  canonicalHiredEvidence,
  hiredPublicationFingerprint,
  hiredSourceIdentity,
  validateHiredAssignmentCommand,
  validateHiredBasisCommand,
  validateHiredPublishedSourceMetadata,
} from "./hired-personnel-authority.ts";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const basis = {
  schema_version: "operations-hired-basis.v1",
  project_id: id(1),
  obligation_id: id(2),
  baseline_event_id: id(3),
  expected_obligation_revision: 1,
  expected_basis_revision: 0,
  cost_basis: "invoice",
  evidence_sha256: "a".repeat(64),
  idempotency_key: "hired-basis-test-1",
  reason: "Explicit source classification",
};
const assignment = {
  schema_version: "operations-hired-operational-source-assign.v1",
  project_id: id(1),
  obligation_id: id(2),
  basis_event_id: id(4),
  expected_assignment_revision: 0,
  source_kind: "time",
  source_stream_id: "time:worker:day",
  source_revision: 1,
  source_line_id: "actual-line-1",
  expected_source_fingerprint: "b".repeat(64),
  invoice_binding_event_id: id(5),
  replaces_estimate_minor: 0,
  consumes_commitment_minor: 0,
  idempotency_key: "hired-assignment-test-1",
  reason: "Keep actual invoice and operational time separate",
};
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error("Expected equality");
}
function denies(f: () => unknown) {
  let denied = false;
  try {
    f();
  } catch {
    denied = true;
  }
  if (!denied) throw new Error("Expected strict denial");
}
Deno.test(
  "hired basis exact ten fields and invoice/time baseline selectors",
  () => {
    equal(validateHiredBasisCommand(basis), basis);
    equal(
      validateHiredBasisCommand({ ...basis, cost_basis: "time" }).cost_basis,
      "time",
    );
    for (const extra of [
      { actor: id(9) },
      { organization_id: id(9) },
      { amount_minor: 60000 },
    ])
      denies(() => validateHiredBasisCommand({ ...basis, ...extra }));
    for (const bad of [null, "other", ["invoice"], true])
      denies(() => validateHiredBasisCommand({ ...basis, cost_basis: bad }));
    for (const bad of [-1, 0, 1.1, Number.MAX_SAFE_INTEGER + 1, "1"])
      denies(() =>
        validateHiredBasisCommand({
          ...basis,
          expected_obligation_revision: bad,
        }),
      );
  },
);
Deno.test(
  "hired assignment exact fifteen fields, explicit integer zero and actual source selectors",
  () => {
    equal(validateHiredAssignmentCommand(assignment), assignment);
    equal(
      validateHiredAssignmentCommand({
        ...assignment,
        source_kind: "catering",
        source_line_id: id(7),
      }).source_line_id,
      id(7),
    );
    for (const key of ["replaces_estimate_minor", "consumes_commitment_minor"])
      for (const bad of [null, false, "0", 1, -1])
        denies(() =>
          validateHiredAssignmentCommand({ ...assignment, [key]: bad }),
        );
    denies(() =>
      validateHiredAssignmentCommand({
        ...assignment,
        source_kind: "catering",
      }),
    );
    for (const extra of [
      { actor: id(9) },
      { organization_id: id(9) },
      { worker_id: id(9) },
      { amount_minor: 60000 },
      { disposition: "charging" },
    ])
      denies(() => validateHiredAssignmentCommand({ ...assignment, ...extra }));
  },
);
Deno.test(
  "hired identity canonical array preserves arbitrary separators and normalizes UUIDs",
  async () => {
    const org = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    equal(
      await hiredSourceIdentity(org, "time", "stream:a", "b"),
      await hiredSourceIdentity(org.toLowerCase(), "time", "stream:a", "b"),
    );
    if (
      (await hiredSourceIdentity(org, "time", "stream:a", "b")) ===
      (await hiredSourceIdentity(org, "time", "stream", "a:b"))
    )
      throw new Error("Tuple collision");
    equal(
      canonicalHiredEvidence(["purpose", 'Å"\\\n😀']),
      '["purpose","Å\\\"\\\\\\n😀"]',
    );
  },
);
Deno.test(
  "hired canonical UTF8 object key ordering and whole-publication fingerprints",
  async () => {
    const a = {
      "😀": 2,
      "\ue000": 1,
      status: "preliminary",
      amount_minor: 60000,
      source_revision: 1,
    };
    const b = {
      source_revision: 1,
      amount_minor: 60000,
      status: "preliminary",
      "\ue000": 1,
      "😀": 2,
    };
    equal(
      canonicalHiredEvidence(a),
      '{"amount_minor":60000,"source_revision":1,"status":"preliminary","":1,"😀":2}',
    );
    equal(
      await hiredPublicationFingerprint("time", a),
      await hiredPublicationFingerprint("time", b),
    );
    for (const changed of [
      { ...a, status: "confirmed" },
      { ...a, amount_minor: 45000 },
      { ...a, source_revision: 2 },
    ])
      if (
        (await hiredPublicationFingerprint("time", a)) ===
        (await hiredPublicationFingerprint("time", changed))
      )
        throw new Error("Changed full publication not fingerprinted");
    if (
      (await hiredPublicationFingerprint("time", a)) ===
      (await hiredPublicationFingerprint("catering", a))
    )
      throw new Error("Purpose/source isolation lost");
  },
);
Deno.test(
  "hired canonical rejects unsafe numbers, NUL and malformed Unicode",
  () => {
    for (const bad of [
      1.1,
      Infinity,
      undefined,
      Number.MAX_SAFE_INTEGER + 1,
      "\u0000",
      "\ud800",
      "\udc00",
      () => {},
    ])
      denies(() => canonicalHiredEvidence(bad));
    for (const bad of [" leading", "trailing ", "\ud800", "\u0000"])
      denies(() =>
        validateHiredAssignmentCommand({ ...assignment, source_line_id: bad }),
      );
  },
);
Deno.test(
  "hired metadata exact copied source, missing rate null and global rejection",
  () => {
    const v = {
      source_status: "pending",
      project_cost_status: "preliminary",
      currency: "SEK",
      minutes: 120,
      amount_minor: null,
      coverage: "missing_rate",
      source_kind: "catering",
      source_stream_id: "actual-native-stream",
      source_line_id: id(7),
      source_revision: 1,
      publication_fingerprint: "c".repeat(64),
      worker_id: id(8),
      project_id: id(1),
      source_currentness: "saved_publication_head_only",
    };
    equal(validateHiredPublishedSourceMetadata(v), v);
    denies(() =>
      validateHiredPublishedSourceMetadata({ ...v, amount_minor: 0 }),
    );
    for (const bad of [
      { ...v, source_line_id: "actual-line-not-a-uuid" },
      { ...v, source_line_id: [id(7)] },
      { ...v, source_status: "rejected" },
      { ...v, project_cost_status: "rejected" },
      { ...v, hourly_rate_minor: 30000 },
      { ...v, source_currentness: "verified_live" },
    ])
      denies(() => validateHiredPublishedSourceMetadata(bad));
  },
);

Deno.test("hired text boundaries count Unicode scalars like PostgreSQL", () => {
  equal(
    validateHiredBasisCommand({
      ...basis,
      reason: "😀".repeat(3),
      idempotency_key: "😀".repeat(12),
    }).reason,
    "😀".repeat(3),
  );
  equal(
    validateHiredBasisCommand({
      ...basis,
      reason: "😀".repeat(1000),
      idempotency_key: "😀".repeat(200),
    }).idempotency_key,
    "😀".repeat(200),
  );
  for (const bad of [
    { reason: "😀".repeat(2) },
    { reason: "😀".repeat(1001) },
    { idempotency_key: "😀".repeat(11) },
    { idempotency_key: "😀".repeat(201) },
  ])
    denies(() => validateHiredBasisCommand({ ...basis, ...bad }));
  equal(
    validateHiredAssignmentCommand({
      ...assignment,
      source_stream_id: "😀".repeat(256),
      source_line_id: "😀",
    }).source_stream_id,
    "😀".repeat(256),
  );
  denies(() =>
    validateHiredAssignmentCommand({
      ...assignment,
      source_stream_id: "😀".repeat(257),
    }),
  );
});
