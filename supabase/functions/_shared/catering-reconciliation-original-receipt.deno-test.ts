import {
  ORIGINAL_RECEIPT_KEYS,
  ORIGINAL_RECEIPT_PROOF_SCHEMA,
  ORIGINAL_RECEIPT_REQUEST_SCHEMA,
  originalReceiptSigningMessage,
  parseOriginalReceiptRequest,
  signOriginalReceiptProof,
  validateOriginalReceiptResponse,
  verifyOriginalReceiptProofSignature,
} from "./catering-reconciliation-original-receipt.ts";
import {
  reconciliationRawHash,
  signReconciliationProof,
} from "./catering-reconciliation-contract.ts";
const id = (n: number) =>
  `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = {
  schema_version: ORIGINAL_RECEIPT_REQUEST_SCHEMA as typeof ORIGINAL_RECEIPT_REQUEST_SCHEMA,
  operations_organization_id: id(1),
  finance_organization_id: id(2),
  source_stream_id: `catering:${id(3)}:${id(4)}`,
  cursor_id: id(5),
  cursor_sha256: "a".repeat(64),
};
const expected = {
  snapshot_id: id(6),
  publication_revision: 4,
  snapshot_body_sha256: "b".repeat(64),
  original_receipt_schema: "operations-catering-receipt.v2" as const,
  expires_at: "2026-10-02T11:00:30.000001Z",
};
const receipt = {
  schema: expected.original_receipt_schema,
  outcome: "accepted",
  source_organization_id: request.operations_organization_id,
  source_stream_id: request.source_stream_id,
  requested_source_revision: 4,
  applied_source_revision: 4,
  current_source_revision: 4,
  request_body_sha256: expected.snapshot_body_sha256,
  snapshot_receipt_id: expected.snapshot_id,
  snapshot_fingerprint: expected.snapshot_body_sha256,
  receipt_id: id(7),
  destination_organization_id: request.finance_organization_id,
  shadow_only: true,
};
const proof = {
  schema_version: ORIGINAL_RECEIPT_PROOF_SCHEMA,
  cursor_id: request.cursor_id,
  cursor_sha256: request.cursor_sha256,
  receipt,
  issued_at: "2026-10-02T11:00:01.000001Z",
  expires_at: expected.expires_at,
};
const now = Date.parse("2026-10-02T11:00:02Z"),
  secret = "receipt-test-secret-not-production-".repeat(2),
  key = "original_receipt_key",
  nonce = "receipt_lookup_nonce_01",
  timestamp = String(Math.floor(now / 1000));
function assert(v: unknown) {
  if (!v) throw Error("assertion failed");
}
function denied(f: () => unknown) {
  let hit = false;
  try {
    f();
  } catch {
    hit = true;
  }
  assert(hit);
}
Deno.test("syntactic exact6/6/all13 control is integrity only", () => {
  assert(
    parseOriginalReceiptRequest(JSON.stringify(request)).cursor_id ===
      request.cursor_id,
  );
  assert(
    validateOriginalReceiptResponse(
      JSON.stringify(proof),
      request,
      expected,
      receipt,
      now,
    )["receipt"],
  );
});
Deno.test("every local receipt primitive including UUID must match signed response", () => {
  for (const key of ORIGINAL_RECEIPT_KEYS) {
    const wrong = { ...receipt, [key]: null };
    denied(() =>
      validateOriginalReceiptResponse(
        JSON.stringify(proof),
        request,
        expected,
        wrong,
        now,
      )
    );
  }
});
Deno.test("response selectors, array fields, expiry/calendar and extra keys fail closed", () => {
  for (
    const changed of [
      { ...proof, cursor_id: [request.cursor_id] },
      { ...proof, cursor_sha256: "c".repeat(64) },
      { ...proof, receipt: { ...receipt, receipt_id: [id(7)] } },
      { ...proof, receipt: { ...receipt, outcome: ["accepted"] } },
      { ...proof, expires_at: "2026-10-02T11:01:30.000001Z" },
      { ...proof, issued_at: "2026-02-30T11:00:01.000001Z" },
      { ...proof, extra: true },
    ]
  ) {
    denied(() =>
      validateOriginalReceiptResponse(
        JSON.stringify(changed),
        request,
        expected,
        receipt,
        now,
      )
    );
  }
  denied(() =>
    validateOriginalReceiptResponse(
      JSON.stringify(proof),
      request,
      expected,
      receipt,
      now + 30000,
    )
  );
});
Deno.test("duplicate request/proof keys and unsafe lexical numbers rejected", () => {
  denied(() =>
    parseOriginalReceiptRequest(
      '{"cursor_id":"' + id(5) + '",' + JSON.stringify(request).slice(1),
    )
  );
  denied(() =>
    validateOriginalReceiptResponse(
      '{"cursor_id":"' + id(5) + '",' + JSON.stringify(proof).slice(1),
      request,
      expected,
      receipt,
      now,
    )
  );
  denied(() =>
    validateOriginalReceiptResponse(
      JSON.stringify(proof).replace(
        '"current_source_revision":4',
        '"current_source_revision":4e0',
      ),
      request,
      expected,
      receipt,
      now,
    )
  );
});
Deno.test("response HMAC binds exact request bytes/key/nonce/domain and clock", async () => {
  const req = JSON.stringify(request),
    raw = JSON.stringify(proof),
    sha = await reconciliationRawHash(req),
    sig = await signOriginalReceiptProof(
      "response",
      secret,
      key,
      timestamp,
      nonce,
      raw,
      sha,
    );
  assert(
    await verifyOriginalReceiptProofSignature(
      secret,
      key,
      timestamp,
      nonce,
      req,
      raw,
      sig,
      Number(timestamp),
    ),
  );
  for (
    const [k, n, r, b, s, t] of [
      [key, nonce, req + " ", raw, sig, Number(timestamp)],
      [key, nonce, req, raw + " ", sig, Number(timestamp)],
      [key, "other_receipt_nonce_02", req, raw, sig, Number(timestamp)],
      ["other_key", nonce, req, raw, sig, Number(timestamp)],
      [key, nonce, req, raw, sig, Number(timestamp) + 121],
    ] as const
  ) {
    assert(
      !await verifyOriginalReceiptProofSignature(
        secret,
        k,
        timestamp,
        n,
        r,
        b,
        s,
        t,
      ),
    );
  }
  const wrong = await signReconciliationProof(
    "cursor_response",
    secret,
    key,
    timestamp,
    nonce,
    raw,
  );
  assert(
    !await verifyOriginalReceiptProofSignature(
      secret,
      key,
      timestamp,
      nonce,
      req,
      raw,
      wrong,
      Number(timestamp),
    ),
  );
});
Deno.test("request7/response8 message positions are exact and no trailing LF", async () => {
  const raw = JSON.stringify(request),
    response = JSON.stringify(proof),
    sha = await reconciliationRawHash(raw);
  assert(
    originalReceiptSigningMessage("request", key, timestamp, nonce, raw) ===
      [
        "POST",
        "operations-catering-original-receipt-read",
        ORIGINAL_RECEIPT_REQUEST_SCHEMA,
        key,
        timestamp,
        nonce,
        raw,
      ].join("\n"),
  );
  assert(
    originalReceiptSigningMessage(
      "response",
      key,
      timestamp,
      nonce,
      response,
      sha,
    ) ===
      [
        "RESPONSE",
        "operations-catering-original-receipt-read",
        ORIGINAL_RECEIPT_PROOF_SCHEMA,
        key,
        timestamp,
        nonce,
        sha,
        response,
      ].join("\n"),
  );
  denied(() =>
    originalReceiptSigningMessage("response", key, timestamp, nonce, response)
  );
  denied(() =>
    originalReceiptSigningMessage("request", key, timestamp, nonce, raw, sha)
  );
});
