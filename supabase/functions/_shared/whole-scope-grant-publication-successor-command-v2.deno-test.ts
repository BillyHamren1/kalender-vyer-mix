import {
  WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA,
  validateWholeScopeGrantedPublicationCommand,
  wholeScopeGrantedPublicationCommandBytes,
  wholeScopeGrantedPublicationCommandFingerprintBytes,
  wholeScopeGrantedPublicationCommandFingerprint,
} from "./whole-scope-grant-publication-successor-command-v2.ts";

function assert(value: unknown): asserts value {
  if (!value) throw new Error("successor command encoding assertion");
}
function deny(value: unknown) {
  let failed = false;
  try {
    validateWholeScopeGrantedPublicationCommand(value);
  } catch (error) {
    failed = true;
    assert(error instanceof Error);
    assert(error.message === "Invalid whole-scope granted publication command");
  }
  assert(failed);
}
const fixture = () => ({
  schema_version: WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA,
  economic_scope_id: "abcdefab-cdef-4abc-8def-abcdefabcdef",
  expected_scope_revision: 1,
  expected_membership_fingerprint: "b".repeat(64),
  expected_composition_revision: 1,
  expected_composition_fingerprint: "c".repeat(64),
  expected_publication_revision: 0,
  expected_grant_revision: 1,
  idempotency_key: "synthetic-successor-command",
  reason: "Encoding only Å 💡",
});

Deno.test("successor command exact10 conveys no authority", () => {
  const out = validateWholeScopeGrantedPublicationCommand(fixture());
  assert(Object.keys(out).length === 10 && Object.isFrozen(out));
  for (const absent of [
    "actor_id",
    "organization_id",
    "export_grant",
    "amount_minor",
    "authorised",
  ])
    assert(!Object.hasOwn(out, absent));
  const raw = wholeScopeGrantedPublicationCommandBytes(out);
  assert(
    Object.keys(JSON.parse(raw)).join(",") ===
      Object.keys(out).sort().join(","),
  );
  assert(
    wholeScopeGrantedPublicationCommandFingerprintBytes(out) ===
      `["operations-whole-scope-granted-product-publication-command-v2",${raw}]`,
  );
  assert(!raw.endsWith("\n") && raw.charCodeAt(0) !== 0xfeff);
});

Deno.test(
  "successor rejects caller grants money extras omissions and symbols",
  () => {
    for (const field of [
      "actor_id",
      "export_grant",
      "verified",
      "destination_scope_id",
      "amount_minor",
      "toJSON",
    ])
      deny({ ...fixture(), [field]: true });
    for (const field of Object.keys(fixture())) {
      const value: Record<string, unknown> = { ...fixture() };
      delete value[field];
      deny(value);
    }
    deny({ ...fixture(), [Symbol("private")]: 1 });
    deny(Object.assign(Object.create({ inherited: true }), fixture()));
    deny([]);
  },
);

Deno.test(
  "successor getter and inherited descriptor value are never consumed",
  () => {
    let reads = 0;
    const value = { ...fixture() };
    Object.defineProperty(value, "reason", {
      enumerable: true,
      get() {
        reads++;
        throw new Error("PRIVATE_SENTINEL");
      },
    });
    deny(value);
    const old = Object.getOwnPropertyDescriptor(Object.prototype, "value");
    try {
      Object.defineProperty(Object.prototype, "value", {
        configurable: true,
        get() {
          reads++;
          throw new Error("PRIVATE_SENTINEL");
        },
      });
      deny(value);
      validateWholeScopeGrantedPublicationCommand(fixture());
    } finally {
      if (old) Object.defineProperty(Object.prototype, "value", old);
      else delete (Object.prototype as Record<string, unknown>).value;
    }
    assert(reads === 0);
  },
);

Deno.test("successor closes all reflection trap errors", () => {
  for (const trap of [
    "getPrototypeOf",
    "ownKeys",
    "getOwnPropertyDescriptor",
  ] as const) {
    deny(
      new Proxy(fixture(), {
        [trap]: () => {
          throw new Error("PRIVATE_SENTINEL");
        },
      }),
    );
  }
  const revoked = Proxy.revocable(fixture(), {});
  revoked.revoke();
  deny(revoked.proxy);
});

Deno.test("successor revisions have distinct safe exact domains", () => {
  for (const field of [
    "expected_scope_revision",
    "expected_composition_revision",
    "expected_grant_revision",
  ] as const) {
    for (const value of [
      0,
      -0,
      -1,
      1.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
    ])
      deny({ ...fixture(), [field]: value });
    validateWholeScopeGrantedPublicationCommand({
      ...fixture(),
      [field]: Number.MAX_SAFE_INTEGER,
    });
  }
  for (const value of [
    -0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER,
    "0",
  ])
    deny({ ...fixture(), expected_publication_revision: value });
  validateWholeScopeGrantedPublicationCommand({
    ...fixture(),
    expected_publication_revision: Number.MAX_SAFE_INTEGER - 1,
  });
});

Deno.test("successor strict UUID fingerprint and schema versions", () => {
  assert(
    validateWholeScopeGrantedPublicationCommand({
      ...fixture(),
      economic_scope_id: fixture().economic_scope_id.toUpperCase(),
    }).economic_scope_id === fixture().economic_scope_id,
  );
  for (const economic_scope_id of [
    fixture().economic_scope_id.replaceAll("-", ""),
    [fixture().economic_scope_id],
    "foreign",
    null,
  ])
    deny({ ...fixture(), economic_scope_id });
  for (const field of [
    "expected_membership_fingerprint",
    "expected_composition_fingerprint",
  ]) {
    for (const value of [
      "A".repeat(64),
      "a".repeat(63),
      "g".repeat(64),
      ["a".repeat(64)],
    ])
      deny({ ...fixture(), [field]: value });
  }
  deny({
    ...fixture(),
    schema_version: "operations-whole-scope-product-publication-command.v1",
  });
});

Deno.test("successor Unicode scalar limits and malformed values", () => {
  for (const [field, minimum, maximum] of [
    ["idempotency_key", 12, 200],
    ["reason", 3, 1000],
  ] as const) {
    validateWholeScopeGrantedPublicationCommand({
      ...fixture(),
      [field]: "💡".repeat(minimum),
    });
    validateWholeScopeGrantedPublicationCommand({
      ...fixture(),
      [field]: "💡".repeat(maximum),
    });
    for (const value of [
      "a".repeat(minimum - 1),
      "💡".repeat(maximum + 1),
      "\ud800",
      "\udc00",
      "\0abc",
      " abcdefghijkl",
      "abcdefghijkl\u2028",
    ])
      deny({ ...fixture(), [field]: value });
  }
});

Deno.test(
  "successor immutable descriptor snapshot ignores property reread",
  () => {
    let reads = 0;
    const input = new Proxy(fixture(), {
      get() {
        reads++;
        throw new Error("PRIVATE_SENTINEL");
      },
    });
    assert(
      wholeScopeGrantedPublicationCommandBytes(input) ===
        wholeScopeGrantedPublicationCommandBytes(fixture()),
    );
    assert(reads === 0);
  },
);

Deno.test(
  "successor rejects excessive keys before later descriptor traps",
  () => {
    let descriptorReads = 0;
    const input = new Proxy(
      { ...fixture(), private_extra: true },
      {
        getOwnPropertyDescriptor() {
          descriptorReads++;
          throw new Error("PRIVATE_SENTINEL");
        },
      },
    );
    deny(input);
    assert(descriptorReads === 0);
    const unknown = { ...fixture() } as Record<string, unknown>;
    delete unknown.reason;
    unknown.private_extra = true;
    deny(
      new Proxy(unknown, {
        getOwnPropertyDescriptor() {
          descriptorReads++;
          throw new Error("PRIVATE_SENTINEL");
        },
      }),
    );
    assert(descriptorReads === 0);
  },
);

Deno.test("successor oversized strings stop before scanning", () => {
  const includes = String.prototype.includes;
  const trim = String.prototype.trim;
  const scalar = String.prototype.charCodeAt;
  let calls = 0;
  try {
    String.prototype.includes = function () {
      calls++;
      throw new Error("PRIVATE_SENTINEL");
    };
    String.prototype.trim = function () {
      calls++;
      throw new Error("PRIVATE_SENTINEL");
    };
    String.prototype.charCodeAt = function () {
      calls++;
      throw new Error("PRIVATE_SENTINEL");
    };
    deny({ ...fixture(), idempotency_key: "x".repeat(1_000_000) });
  } finally {
    String.prototype.includes = includes;
    String.prototype.trim = trim;
    String.prototype.charCodeAt = scalar;
  }
  assert(calls === 0);
  deny({ ...fixture(), reason: "x".repeat(1_000_000) });
});

Deno.test("successor purpose fingerprint independent SHA vector", async () => {
  const input = fixture();
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort())
    sorted[key] = input[key as keyof typeof input];
  const bytes = new TextEncoder().encode(
    JSON.stringify([
      "operations-whole-scope-granted-product-publication-command-v2",
      sorted,
    ]),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const expected = Array.from(digest, (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  assert(
    (await wholeScopeGrantedPublicationCommandFingerprint(input)) === expected,
  );
  // Independently generated Python json.dumps(sort_keys=True, ensure_ascii=False,
  // separators=(",", ":")) + hashlib.sha256 over the locked purpose array.
  assert(
    expected ===
      "d6d36056cbc6c29b5c38d0d49b47298743950766b2dd57bb5abc5465faab16ff",
  );
  assert(
    wholeScopeGrantedPublicationCommandFingerprintBytes(input) !==
      JSON.stringify(["operations-whole-scope-product-publication-v1", sorted]),
  );
});
