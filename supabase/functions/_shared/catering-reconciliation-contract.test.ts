import {
  canonicalReconciliationFlat,
  parseReconciliationJson,
  reconciliationHash,
  reconciliationSigningMessage,
  signReconciliationProof,
  verifyReconciliationProof,
} from "./catering-reconciliation-contract.ts";
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error("encoding control mismatch");
}
function rejects(action: () => unknown) {
  let rejected = false;
  try {
    action();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("invalid encoding accepted");
}
Deno.test("compact scalar canonicalization preserves exact Unicode/control bytes", async () => {
  const input = { step_count: 2, cursor_sha256: 'Å\n"é\\\u2028' };
  equal(
    canonicalReconciliationFlat("history", input),
    '{"cursor_sha256":"Å\\n\\"é\\\\\u2028","step_count":2}',
  );
  equal(
    await reconciliationHash("history", input),
    "852a37339b55843ec4b3776d851b45cc7cf079f7077a6a29f4a13b727924ac34",
  );
});
Deno.test("flat commitments reject extras, wrong primitive types and unsafe Unicode", () => {
  for (const value of [[], {}, -0, 1.5, 9007199254740992, "\0", "\ud800"]) {
    rejects(() =>
      canonicalReconciliationFlat("history", {
        cursor_sha256: value,
        step_count: 1,
      })
    );
  }
  rejects(() =>
    canonicalReconciliationFlat("history", {
      cursor_sha256: "x",
      step_count: 1,
      extra: true,
    })
  );
});
Deno.test("raw parser detects nested and escaped duplicate keys before last-key parsing", () => {
  for (
    const raw of [
      '{"a":1,"\\u0061":2}',
      '{"x":{"a":1,"a":2}}',
      '{"a":1e0}',
      '{"a":1.0}',
      '{"a":-0}',
      '{"a":9007199254740992}',
      '{"a":"\\ud800"}',
      '{"a":"\\u0000"}',
    ]
  ) rejects(() => parseReconciliationJson(raw));
  equal(
    JSON.stringify(parseReconciliationJson('{"x":{"price":1.25}}', false)),
    '{"x":{"price":1.25}}',
  );
  rejects(() => parseReconciliationJson('{"x":{"a":1,"a":2}}', false));
  rejects(() => parseReconciliationJson('{"price":1e999}', false));
});
Deno.test("bounded encoding rejects excessive recursion and body byte length", () => {
  rejects(() => parseReconciliationJson("[".repeat(66) + "0" + "]".repeat(66)));
  rejects(() => parseReconciliationJson(JSON.stringify("å".repeat(131073))));
});
Deno.test("cursor response HMAC cannot authorize request or delivery purpose", async () => {
  const secret = "x".repeat(32),
    key = "fixture-key",
    timestamp = "1790928000",
    nonce = "fixture_nonce_123456",
    raw = '{"control":"Å\\n"}';
  const signature = await signReconciliationProof(
    "cursor_response",
    secret,
    key,
    timestamp,
    nonce,
    raw,
  );
  equal(
    await verifyReconciliationProof(
      "cursor_response",
      secret,
      key,
      timestamp,
      nonce,
      raw,
      signature,
      1790928120,
    ),
    true,
  );
  equal(
    await verifyReconciliationProof(
      "cursor_response",
      secret,
      key,
      timestamp,
      nonce,
      raw,
      signature,
      1790928121,
    ),
    false,
  );
  equal(
    await verifyReconciliationProof(
      "cursor_request",
      secret,
      key,
      timestamp,
      nonce,
      raw,
      signature,
      1790928000,
    ),
    false,
  );
  equal(
    await verifyReconciliationProof(
      "delivery",
      secret,
      key,
      timestamp,
      nonce,
      raw,
      signature,
      1790928000,
    ),
    false,
  );
  equal(
    await verifyReconciliationProof(
      "cursor_response",
      secret,
      key,
      timestamp,
      nonce,
      raw + " ",
      signature,
      1790928000,
    ),
    false,
  );
});
Deno.test("wrong-type selectors cannot be coerced into signing scope", () => {
  for (
    const selector of [["fixture-key"], ["1790928000"], [
      "fixture_nonce_123456",
    ]]
  ) {
    const values: unknown[] = [
      "fixture-key",
      "1790928000",
      "fixture_nonce_123456",
    ];
    const index = selector[0].startsWith("179")
      ? 1
      : selector[0].startsWith("fixture_nonce")
      ? 2
      : 0;
    values[index] = selector;
    rejects(() =>
      reconciliationSigningMessage(
        "delivery",
        values[0] as string,
        values[1] as string,
        values[2] as string,
        "{}",
      )
    );
  }
});
