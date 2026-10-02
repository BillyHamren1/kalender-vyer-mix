import {
  WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA,
  validateWholeScopeProductGrantCommand,
  wholeScopeProductGrantCommandBytes,
  wholeScopeProductGrantCommandFingerprintBytes,
  wholeScopeProductGrantCommandFingerprint,
} from "./whole-scope-product-grant-command-v1.ts";
function assert(value: unknown): asserts value {
  if (!value) throw new Error("grant encoding assertion");
}
function deny(action: () => unknown) {
  let failed = false;
  try {
    action();
  } catch {
    failed = true;
  }
  assert(failed);
}
const id = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
const fixture = () => ({
  schema_version: WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA,
  economic_scope_id: id(1),
  partner_version: id(2),
  destination_organization_id: id(3),
  destination_scope_id: id(4),
  destination_mapping_id: id(5),
  destination_mapping_revision: 1,
  destination_mapping_fingerprint: "a".repeat(64),
  expected_scope_revision: 1,
  expected_membership_fingerprint: "b".repeat(64),
  expected_composition_revision: 1,
  expected_composition_fingerprint: "c".repeat(64),
  expected_grant_revision: 0,
  enabled: false,
  idempotency_key: "synthetic-grant-command",
  reason: "Metadata design only",
});
Deno.test("grant command exact16 and disabled metadata only", () => {
  const out = validateWholeScopeProductGrantCommand(fixture());
  assert(Object.keys(out).length === 16 && Object.isFrozen(out));
  assert(
    out.enabled === false && !("authorised" in out) && !("actor_id" in out),
  );
  const raw = wholeScopeProductGrantCommandBytes(out);
  assert(
    Object.keys(JSON.parse(raw)).join(",") == Object.keys(out).sort().join(","),
  );
  assert(
    wholeScopeProductGrantCommandFingerprintBytes(out) ===
      `["operations-whole-scope-product-export-grant-command-v1",${raw}]`,
  );
});
Deno.test(
  "grant command refuses extra missing inherited accessors and symbols",
  () => {
    for (const extra of [
      "actor_id",
      "organization_id",
      "full_membership",
      "amount_minor",
      "verified",
      "destination_raw_body",
      "toJSON",
    ])
      deny(() =>
        validateWholeScopeProductGrantCommand({ ...fixture(), [extra]: true }),
      );
    const missing: Record<string, unknown> = { ...fixture() };
    delete missing.partner_version;
    deny(() => validateWholeScopeProductGrantCommand(missing));
    let getterCalls = 0;
    const getter = { ...fixture() };
    Object.defineProperty(getter, "reason", {
      enumerable: true,
      get() {
        getterCalls++;
        return "private";
      },
    });
    deny(() => validateWholeScopeProductGrantCommand(getter));
    assert(getterCalls === 0);
    deny(() =>
      validateWholeScopeProductGrantCommand(
        Object.assign(Object.create({ private_field: true }), fixture()),
      ),
    );
    deny(() =>
      validateWholeScopeProductGrantCommand({
        ...fixture(),
        [Symbol("secret")]: true,
      }),
    );
    const hidden = { ...fixture() };
    Object.defineProperty(hidden, "reason", {
      value: "Hidden",
      enumerable: false,
    });
    deny(() => validateWholeScopeProductGrantCommand(hidden));
  },
);
Deno.test(
  "grant descriptor snapshot avoids caller get and mutable reread",
  () => {
    let getCalls = 0;
    const target = fixture();
    const proxy = new Proxy(target, {
      get() {
        getCalls++;
        throw Error("private caller getter");
      },
    });
    const out = validateWholeScopeProductGrantCommand(proxy);
    assert(getCalls === 0 && out.reason === "Metadata design only");
    target.reason = "Changed after snapshot";
    assert(out.reason === "Metadata design only");
    const nullPrototype = Object.assign(Object.create(null), fixture());
    assert(
      wholeScopeProductGrantCommandBytes(nullPrototype) ===
        wholeScopeProductGrantCommandBytes(fixture()),
    );
  },
);
Deno.test(
  "grant UUID canonical normalization denies coercion and alternate spelling",
  () => {
    const c = {
      ...fixture(),
      destination_mapping_id: "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE",
    };
    assert(
      validateWholeScopeProductGrantCommand(c).destination_mapping_id ===
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    for (const bad of [
      id(1).replaceAll("-", ""),
      `{${id(1)}}`,
      [id(1)],
      1,
      null,
      {},
      id(1) + "\n",
    ])
      deny(() =>
        validateWholeScopeProductGrantCommand({
          ...fixture(),
          partner_version: bad,
        }),
      );
    for (const bad of [
      "A".repeat(64),
      "a".repeat(63),
      "a".repeat(64) + "\n",
      null,
      ["a".repeat(64)],
    ])
      deny(() =>
        validateWholeScopeProductGrantCommand({
          ...fixture(),
          destination_mapping_fingerprint: bad,
        }),
      );
  },
);
Deno.test(
  "grant revisions exact safe domain including strict expected advance bound",
  () => {
    for (const key of [
      "destination_mapping_revision",
      "expected_scope_revision",
      "expected_composition_revision",
      "expected_grant_revision",
    ]) {
      for (const bad of [
        -0,
        -1,
        1.5,
        Number.MAX_SAFE_INTEGER + 1,
        Infinity,
        NaN,
        "1",
        true,
        null,
      ])
        deny(() =>
          validateWholeScopeProductGrantCommand({ ...fixture(), [key]: bad }),
        );
    }
    deny(() =>
      validateWholeScopeProductGrantCommand({
        ...fixture(),
        expected_grant_revision: Number.MAX_SAFE_INTEGER,
      }),
    );
    assert(
      validateWholeScopeProductGrantCommand({
        ...fixture(),
        expected_grant_revision: Number.MAX_SAFE_INTEGER - 1,
      }).expected_grant_revision ===
        Number.MAX_SAFE_INTEGER - 1,
    );
    for (const key of [
      "destination_mapping_revision",
      "expected_scope_revision",
      "expected_composition_revision",
    ]) {
      deny(() =>
        validateWholeScopeProductGrantCommand({ ...fixture(), [key]: 0 }),
      );
      assert(
        validateWholeScopeProductGrantCommand({
          ...fixture(),
          [key]: Number.MAX_SAFE_INTEGER,
        }),
      );
    }
    for (const enabled of ["false", 0, 1, [true], null])
      deny(() =>
        validateWholeScopeProductGrantCommand({ ...fixture(), enabled }),
      );
  },
);
Deno.test("grant text scalar boundaries and malformed Unicode", () => {
  assert(
    validateWholeScopeProductGrantCommand({
      ...fixture(),
      reason: "😀".repeat(1000),
      idempotency_key: "😀".repeat(200),
    }),
  );
  assert(
    validateWholeScopeProductGrantCommand({
      ...fixture(),
      reason: "😀".repeat(3),
      idempotency_key: "😀".repeat(12),
    }),
  );
  for (const reason of [
    "ab",
    "😀".repeat(1001),
    " x",
    "x ",
    "\ufeffabc",
    "a\0bc",
    "\ud800",
    "\udfff",
  ])
    deny(() => validateWholeScopeProductGrantCommand({ ...fixture(), reason }));
  for (const idempotency_key of [
    "😀".repeat(11),
    "😀".repeat(201),
    " leading-padding",
    "trailing-padding\u3000",
  ])
    deny(() =>
      validateWholeScopeProductGrantCommand({ ...fixture(), idempotency_key }),
    );
});
Deno.test(
  "grant quote newline Unicode bytes and purpose fingerprint",
  async () => {
    const c = { ...fixture(), reason: 'Quote " and newline\nÅ😀' };
    const raw = wholeScopeProductGrantCommandBytes(c);
    assert(JSON.parse(raw).reason === c.reason && !raw.includes("\n"));
    const purpose = wholeScopeProductGrantCommandFingerprintBytes(c);
    assert(!purpose.startsWith("\ufeff") && !purpose.endsWith("\n"));
    const actual = await wholeScopeProductGrantCommandFingerprint(c);
    // Independent Python UTF8/sorted compact JSON purpose-array vector.
    assert(
      actual ===
        "154a49700c5aeaa794df9c3cc01888c6d6b625ec88f80ccdcc0dafa3563ecb59",
    );
    const control = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(purpose)),
    );
    let expected = "";
    for (let i = 0; i < control.length; i++)
      expected += control[i].toString(16).padStart(2, "0");
    assert(actual === expected);
    assert(
      (await wholeScopeProductGrantCommandFingerprint({
        ...c,
        enabled: true,
      })) !== actual,
    );
  },
);
Deno.test(
  "grant async fingerprint captures initial validated primitive state",
  async () => {
    const c = fixture();
    const initial = await wholeScopeProductGrantCommandFingerprint(c);
    const pending = wholeScopeProductGrantCommandFingerprint(c);
    c.reason = "Changed while digest pending";
    c.enabled = true;
    assert((await pending) === initial);
    assert((await wholeScopeProductGrantCommandFingerprint(c)) !== initial);
  },
);

Deno.test(
  "grant reflection failures never expose caller private exceptions",
  async () => {
    const privateFailure = () => {
      throw new Error("PRIVATE_TEST_SENTINEL");
    };
    const inputs = [
      new Proxy(fixture(), { getPrototypeOf: privateFailure }),
      new Proxy(fixture(), { ownKeys: privateFailure }),
      new Proxy(fixture(), { getOwnPropertyDescriptor: privateFailure }),
    ];
    const revoked = Proxy.revocable(fixture(), {});
    revoked.revoke();
    inputs.push(revoked.proxy);
    for (const input of inputs) {
      for (const encode of [
        validateWholeScopeProductGrantCommand,
        wholeScopeProductGrantCommandBytes,
        wholeScopeProductGrantCommandFingerprintBytes,
      ]) {
        let message = "";
        try {
          encode(input);
        } catch (error) {
          message = error instanceof Error ? error.message : "unknown";
        }
        assert(message === "Invalid whole-scope product grant command");
      }
      let message = "";
      try {
        await wholeScopeProductGrantCommandFingerprint(input);
      } catch (error) {
        message = error instanceof Error ? error.message : "unknown";
      }
      assert(message === "Invalid whole-scope product grant command");
    }
  },
);
