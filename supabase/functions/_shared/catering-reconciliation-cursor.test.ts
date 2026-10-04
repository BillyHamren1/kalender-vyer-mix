/** Serialization/signature controls only. No cursor is presented as persisted Finance evidence. */
import {
  reconciliationHash,
  signReconciliationProof,
} from "./catering-reconciliation-contract.ts";
import {
  cateringReconciliationTimestampMicros,
  validateCateringReconciliationCursorProof,
  verifySignedCateringReconciliationCursor,
} from "./catering-reconciliation-cursor.ts";
const id = (n: number) =>
  `97000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  operations_organization_id: id(1),
  finance_organization_id: id(2),
  source_stream_id: `catering:${id(3)}:${id(4)}`,
};
const now = Date.parse("2026-10-02T00:00:00.001Z");
async function control() {
  const cursor = {
    schema_version: "operations-catering-reconciliation-cursor.v1",
    cursor_id: id(5),
    ...scope,
    snapshot_id: id(6),
    publication_revision: 2,
    allocation_event_id: null,
    allocation_revision: 0,
    snapshot_body_sha256: "a".repeat(64),
  };
  return {
    cursor,
    cursor_sha256: await reconciliationHash("cursor", cursor),
    issued_at: "2026-10-02T00:00:00.000001Z",
    expires_at: "2026-10-02T00:01:00.000001Z",
  };
}
async function rejects(action: () => unknown | Promise<unknown>) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("invalid cursor accepted");
}
Deno.test("exact initial0/null and adopted cursor hashes validate as integrity controls", async () => {
  const c = await control();
  await validateCateringReconciliationCursorProof(
    JSON.stringify(c),
    scope,
    now,
  );
  const adopted = {
    ...c,
    cursor: {
      ...c.cursor,
      allocation_event_id: id(7) as string | null,
      allocation_revision: 1,
    },
  };
  adopted.cursor_sha256 = await reconciliationHash("cursor", adopted.cursor);
  await validateCateringReconciliationCursorProof(
    JSON.stringify(adopted),
    scope,
    now,
  );
});
Deno.test("future/expired and submillisecond duration mismatches deny", async () => {
  const c = await control();
  await rejects(() =>
    validateCateringReconciliationCursorProof(JSON.stringify(c), scope, now - 1)
  );
  await rejects(() =>
    validateCateringReconciliationCursorProof(
      JSON.stringify(c),
      scope,
      now + 60000,
    )
  );
  await rejects(() =>
    validateCateringReconciliationCursorProof(
      JSON.stringify({ ...c, expires_at: "2026-10-02T00:01:00.000002Z" }),
      scope,
      now,
    )
  );
});
Deno.test("full calendar and exact timestamp grammar reject normalization", async () => {
  for (
    const s of [
      "2026-02-30T00:00:00.000000Z",
      "2026-10-02T24:00:00.000000Z",
      "2026-10-02T00:00:00.001Z",
      "2026-10-02T00:00:00.000000+00:00",
    ]
  ) await rejects(() => cateringReconciliationTimestampMicros(s));
  if (
    cateringReconciliationTimestampMicros("2026-10-02T00:00:00.000002Z") -
        cateringReconciliationTimestampMicros("2026-10-02T00:00:00.000001Z") !==
      1n
  ) throw new Error("microseconds truncated");
});
Deno.test("own server scope, exact key counts and revision/event relationships bind", async () => {
  const c = await control();
  await rejects(() =>
    validateCateringReconciliationCursorProof(JSON.stringify(c), {
      ...scope,
      finance_organization_id: id(9),
    }, now)
  );
  for (
    const patch of [
      { allocation_revision: 1 },
      { allocation_event_id: id(7) },
      { publication_revision: ["2"] },
      { snapshot_body_sha256: ["a".repeat(64)] },
    ]
  ) {
    const changed = { ...c, cursor: { ...c.cursor, ...patch } };
    await rejects(() =>
      validateCateringReconciliationCursorProof(
        JSON.stringify(changed),
        scope,
        now,
      )
    );
  }
  await rejects(() =>
    validateCateringReconciliationCursorProof(
      JSON.stringify({ ...c, enabled: true }),
      scope,
      now,
    )
  );
});
Deno.test("signed response binds exact raw bytes, key, nonce and purpose", async () => {
  const c = await control(),
    raw = JSON.stringify(c),
    timestamp = String(Math.floor(now / 1000)),
    secret = "synthetic_cursor_secret_".repeat(2),
    keyId = "synthetic-cursor-key",
    requestNonce = "synthetic_cursor_nonce_1";
  const signature = await signReconciliationProof(
    "cursor_response",
    secret,
    keyId,
    timestamp,
    requestNonce,
    raw,
  );
  const input = {
    raw,
    secret,
    keyId,
    timestamp,
    requestNonce,
    signature,
    scope,
    nowMilliseconds: now,
  };
  await verifySignedCateringReconciliationCursor(input);
  await rejects(() =>
    verifySignedCateringReconciliationCursor({
      ...input,
      requestNonce: "synthetic_cursor_nonce_2",
    })
  );
  await rejects(() =>
    verifySignedCateringReconciliationCursor({ ...input, raw: raw + " " })
  );
  const requestSignature = await signReconciliationProof(
    "cursor_request",
    secret,
    keyId,
    timestamp,
    requestNonce,
    raw,
  );
  await rejects(() =>
    verifySignedCateringReconciliationCursor({
      ...input,
      signature: requestSignature,
    })
  );
});
Deno.test("raw duplicate keys and noncanonical number lexemes denied before hash", async () => {
  const c = await control(), raw = JSON.stringify(c);
  await rejects(() =>
    validateCateringReconciliationCursorProof(
      raw.replace(
        '"publication_revision":2',
        '"publication_revision":2,"publication_revision":2',
      ),
      scope,
      now,
    )
  );
  await rejects(() =>
    validateCateringReconciliationCursorProof(
      raw.replace('"allocation_revision":0', '"allocation_revision":-0'),
      scope,
      now,
    )
  );
});
