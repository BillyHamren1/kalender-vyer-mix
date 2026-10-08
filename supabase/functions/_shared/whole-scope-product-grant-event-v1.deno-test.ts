import {
  WHOLE_SCOPE_PRODUCT_GRANT_EVENT_SCHEMA,
  validateWholeScopeProductGrantEvent,
  wholeScopeProductGrantEventBytes,
  wholeScopeProductGrantEventFingerprintBytes,
  wholeScopeProductGrantEventFingerprint,
  wholeScopeProductGrantEventProjection,
} from "./whole-scope-product-grant-event-v1.ts";
import {
  WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA,
  wholeScopeProductGrantCommandFingerprint,
} from "./whole-scope-product-grant-command-v1.ts";
function assert(v: unknown): asserts v {
  if (!v) throw new Error("grant event encoding assertion");
}
async function deny(v: unknown) {
  let message = "";
  try {
    await validateWholeScopeProductGrantEvent(v);
  } catch (e) {
    message = e instanceof Error ? e.message : "unknown";
  }
  assert(message === "Invalid whole-scope product grant event");
}
const id = (n: number) =>
  `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v !== null && typeof v === "object") {
    const r = v as Record<string, unknown>;
    return (
      "{" +
      Object.keys(r)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(r[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(v);
}
async function sha(raw: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
async function fixture() {
  const full_membership = {
    schema_version: "operations-project-scope-membership-v1",
    organization_id: id(1),
    root_kind: "project",
    root_id: id(2),
    root_evidence: {
      status: null,
      primary_local_booking_id: "booking-Å😀",
      packing_parent_id: null,
    },
    source_project_ids: [id(2)],
    local_booking_ids: ["booking-Å😀"],
    relationships: [
      {
        relation: "project_booking",
        relation_id: id(2),
        parent_id: id(2),
        local_booking_id: "booking-Å😀",
      },
    ],
    integration_state: "membership_only",
    economic_mapping: "unavailable",
  };
  const membership_fingerprint = await sha(canonical(full_membership));
  const command = {
    schema_version: WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA,
    economic_scope_id: id(3),
    partner_version: id(4),
    destination_organization_id: id(5),
    destination_scope_id: id(6),
    destination_mapping_id: id(7),
    destination_mapping_revision: 2,
    destination_mapping_fingerprint: "a".repeat(64),
    expected_scope_revision: 3,
    expected_membership_fingerprint: membership_fingerprint,
    expected_composition_revision: 4,
    expected_composition_fingerprint: "b".repeat(64),
    expected_grant_revision: 0,
    enabled: false,
    idempotency_key: "synthetic-grant-event",
    reason: 'Quote " and newline\nÅ😀',
  };
  return {
    schema_version: WHOLE_SCOPE_PRODUCT_GRANT_EVENT_SCHEMA,
    event_id: id(8),
    organization_id: id(1),
    economic_scope_id: id(3),
    revision: 1,
    enabled: false,
    actor_id: id(9),
    created_at: "2026-10-02T15:04:05.123456Z",
    partner_version: id(4),
    destination_organization_id: id(5),
    destination_scope_id: id(6),
    destination_mapping_id: id(7),
    destination_mapping_revision: 2,
    destination_mapping_fingerprint: "a".repeat(64),
    scope_snapshot_id: id(10),
    scope_revision: 3,
    membership_fingerprint,
    composition_snapshot_id: id(11),
    composition_revision: 4,
    composition_fingerprint: "b".repeat(64),
    full_membership,
    command,
    command_fingerprint:
      await wholeScopeProductGrantCommandFingerprint(command),
  };
}
Deno.test(
  "event exact23 immutable metadata and locked grant7 projection",
  async () => {
    const f = await fixture(),
      v = await validateWholeScopeProductGrantEvent(f);
    assert(
      Object.keys(v).length === 23 &&
        Object.isFrozen(v) &&
        Object.isFrozen(v.full_membership),
    );
    assert(v.enabled === false && !("authorised" in v) && !("money" in v));
    const g = await wholeScopeProductGrantEventProjection(f);
    assert(
      Object.keys(g).sort().join(",") ===
        "destination_mapping_id,destination_mapping_revision,destination_organization_id,destination_scope_id,event_id,fingerprint,revision",
    );
    assert(
      g.event_id === f.event_id &&
        g.fingerprint === (await wholeScopeProductGrantEventFingerprint(f)) &&
        !("destination_mapping_fingerprint" in g),
    );
  },
);
Deno.test(
  "event exact crosslinks and purpose hashes cannot be substituted",
  async () => {
    const f = await fixture();
    for (const [k, v] of Object.entries({
      schema_version: "wrong",
      economic_scope_id: id(99),
      revision: 2,
      enabled: true,
      partner_version: id(99),
      destination_organization_id: id(99),
      destination_scope_id: id(99),
      destination_mapping_id: id(99),
      destination_mapping_revision: 3,
      destination_mapping_fingerprint: "c".repeat(64),
      scope_revision: 4,
      membership_fingerprint: "c".repeat(64),
      composition_revision: 5,
      composition_fingerprint: "c".repeat(64),
      command_fingerprint: "c".repeat(64),
    }))
      await deny({ ...f, [k]: v });
    await deny({ ...f, command: { ...f.command, actor_id: id(99) } });
    await deny({
      ...f,
      command: { ...f.command, economic_scope_id: id(10).toUpperCase() },
    });
  },
);
Deno.test(
  "event strict six-digit Gregorian UTC preserves microseconds",
  async () => {
    const f = await fixture();
    for (const created_at of [
      "0000-01-01T15:04:05.123456Z",
      "2026-02-29T15:04:05.123456Z",
      "2026-10-02T24:04:05.123456Z",
      "2026-10-02T15:04:60.123456Z",
      "2026-10-02T15:04:05.123Z",
      "2026-10-02T15:04:05.123456+00:00",
    ])
      await deny({ ...f, created_at });
    assert(
      (
        await validateWholeScopeProductGrantEvent({
          ...f,
          created_at: "2024-02-29T15:04:05.999999Z",
        })
      ).created_at === "2024-02-29T15:04:05.999999Z",
    );
  },
);
Deno.test(
  "event UUID integers extras and malformed Unicode denied",
  async () => {
    const f = await fixture();
    for (const revision of [
      -0,
      0,
      -1,
      1.1,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER + 1,
      "1",
    ])
      await deny({ ...f, revision });
    for (const event_id of [
      id(10).toUpperCase(),
      id(8).replaceAll("-", ""),
      [id(8)],
    ])
      await deny({ ...f, event_id });
    await deny({ ...f, private_field: true });
    await deny({ ...f, command: { ...f.command, reason: "\ud800" } });
    const sparse = [, id(2)];
    await deny({
      ...f,
      full_membership: { ...f.full_membership, source_project_ids: sparse },
    });
  },
);
Deno.test(
  "event membership exact fields ordering and plain fingerprint",
  async () => {
    const f = await fixture();
    for (const full_membership of [
      { ...f.full_membership, organization_id: id(99) },
      { ...f.full_membership, source_project_ids: [id(2), id(2)] },
      { ...f.full_membership, local_booking_ids: ["z", "a"] },
      {
        ...f.full_membership,
        relationships: [
          { ...f.full_membership.relationships[0], parent_id: id(99) },
        ],
      },
      { ...f.full_membership, root_kind: "alias" },
      { ...f.full_membership, integration_state: "complete" },
      { ...f.full_membership, private_field: true },
    ])
      await deny({ ...f, full_membership });
    assert(
      f.membership_fingerprint === (await sha(canonical(f.full_membership))),
    );
    assert(
      f.membership_fingerprint !==
        (await sha('["wrong-purpose",' + canonical(f.full_membership) + "]")),
    );
  },
);
Deno.test(
  "event descriptor traps getters inherited values and iterators never disclose",
  async () => {
    const f = await fixture();
    let calls = 0;
    const hostile = () => {
      calls++;
      throw Error("PRIVATE_EVENT_SENTINEL");
    };
    for (const value of [
      new Proxy(f, { getPrototypeOf: hostile }),
      new Proxy(f, { ownKeys: hostile }),
      new Proxy(f, { getOwnPropertyDescriptor: hostile }),
    ])
      await deny(value);
    const getter = { ...f };
    Object.defineProperty(getter, "actor_id", {
      enumerable: true,
      get: hostile,
    });
    await deny(getter);
    const rows = [...f.full_membership.relationships];
    Object.defineProperty(rows, Symbol.iterator, { value: hostile });
    await deny({
      ...f,
      full_membership: { ...f.full_membership, relationships: rows },
    });
    const inherited = { ...f };
    Object.defineProperty(inherited, "actor_id", {
      enumerable: true,
      get: hostile,
    });
    Object.defineProperty(Object.prototype, "value", {
      configurable: true,
      get: hostile,
    });
    try {
      const before = calls;
      await deny(inherited);
      assert(calls === before);
    } finally {
      delete (Object.prototype as { value?: unknown }).value;
    }
  },
);
Deno.test(
  "event canonical bytes purpose and Unicode independent control",
  async () => {
    const f = await fixture(),
      raw = await wholeScopeProductGrantEventBytes(f);
    assert(
      raw === canonical(f) &&
        JSON.parse(raw).created_at === f.created_at &&
        !raw.endsWith("\n"),
    );
    assert(
      (await wholeScopeProductGrantEventFingerprint(f)) ===
        "ff04c242079c5f0523f76c19b27a853b6a2bbfb18619bd7e3d51d686508095a3",
    ); // Independent Python compact UTF8 purpose-array control.
    const bytes = await wholeScopeProductGrantEventFingerprintBytes(f);
    assert(
      bytes ===
        '["operations-whole-scope-product-export-grant-event-v1",' + raw + "]",
    );
    assert(
      (await wholeScopeProductGrantEventFingerprint(f)) === (await sha(bytes)),
    );
    assert(
      (await wholeScopeProductGrantEventFingerprint(f)) !== (await sha(raw)),
    );
  },
);
Deno.test(
  "event asynchronous digest snapshot avoids mutable reread",
  async () => {
    const f = await fixture(),
      initial = await wholeScopeProductGrantEventFingerprint(f),
      pending = wholeScopeProductGrantEventFingerprint(f);
    f.actor_id = id(99);
    f.full_membership.relationships[0].local_booking_id = "changed";
    assert((await pending) === initial);
    await deny(f);
  },
);

Deno.test(
  "event UTF8 C membership order and bounded snapshot domain",
  async () => {
    const f = await fixture();
    const full_membership = {
      ...f.full_membership,
      root_evidence: {
        status: null,
        primary_local_booking_id: null,
        packing_parent_id: null,
      },
      local_booking_ids: ["\ue000", "\ud800\udc00"],
      relationships: [],
    };
    const membership_fingerprint = await sha(canonical(full_membership));
    const command = {
      ...f.command,
      expected_membership_fingerprint: membership_fingerprint,
    };
    const valid = {
      ...f,
      full_membership,
      membership_fingerprint,
      command,
      command_fingerprint:
        await wholeScopeProductGrantCommandFingerprint(command),
    };
    await validateWholeScopeProductGrantEvent(valid);
    await deny({
      ...valid,
      full_membership: {
        ...full_membership,
        local_booking_ids: ["\ud800\udc00", "\ue000"],
      },
    });
    await deny({
      ...f,
      full_membership: {
        ...f.full_membership,
        source_project_ids: Array(1001).fill(id(2)),
      },
    });
    await deny({
      ...f,
      command: { ...f.command, reason: "a".repeat(1048577) },
    });
    const revoked = Proxy.revocable(f, {});
    revoked.revoke();
    await deny(revoked.proxy);
  },
);

Deno.test(
  "event aggregate snapshot budget stops before later hostile nodes",
  async () => {
    const f = await fixture();
    let reads = 0;
    const later = new Proxy(
      {},
      {
        getPrototypeOf() {
          reads++;
          throw Error("PRIVATE_LATE_NODE");
        },
      },
    );
    await deny({
      ...f,
      extra: ["a".repeat(600000), "b".repeat(600000), later],
    });
    assert(reads === 0);
    await deny({ ...f, extra: { ["k".repeat(1048577)]: later } });
    assert(reads === 0);
    const early = await validateWholeScopeProductGrantEvent({
      ...f,
      created_at: "0001-01-01T00:00:00.000001Z",
    });
    assert(early.created_at === "0001-01-01T00:00:00.000001Z");
  },
);
