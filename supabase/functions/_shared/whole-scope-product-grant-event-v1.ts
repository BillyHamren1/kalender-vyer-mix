/** Pure metadata encoding. A valid event is not an authenticated grant. */
import {
  validateWholeScopeProductGrantCommand,
  wholeScopeProductGrantCommandBytes,
  wholeScopeProductGrantCommandFingerprint,
} from "./whole-scope-product-grant-command-v1.ts";
export const WHOLE_SCOPE_PRODUCT_GRANT_EVENT_SCHEMA =
  "operations-whole-scope-product-export-grant-event.v1";
export const WHOLE_SCOPE_PRODUCT_GRANT_EVENT_PURPOSE =
  "operations-whole-scope-product-export-grant-event-v1";
export const WHOLE_SCOPE_PRODUCT_GRANT_EVENT_LIMIT = 1048576;
type Row = Readonly<Record<string, unknown>>;
const encoder = new TextEncoder();
const hasOwn = Object.hasOwn;
const descriptorsOf = Object.getOwnPropertyDescriptors;
const prototypeOf = Object.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const fields = [
  "schema_version",
  "event_id",
  "organization_id",
  "economic_scope_id",
  "revision",
  "enabled",
  "actor_id",
  "created_at",
  "partner_version",
  "destination_organization_id",
  "destination_scope_id",
  "destination_mapping_id",
  "destination_mapping_revision",
  "destination_mapping_fingerprint",
  "scope_snapshot_id",
  "scope_revision",
  "membership_fingerprint",
  "composition_snapshot_id",
  "composition_revision",
  "composition_fingerprint",
  "full_membership",
  "command",
  "command_fingerprint",
];
function invalid(): never {
  throw new Error("Invalid whole-scope product grant event");
}
function unicode(s: string): void {
  if (s.includes("\0")) invalid();
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = s.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (n >= 0xdc00 && n <= 0xdfff) invalid();
  }
}
/** Copy only own data descriptors; no iterator, getter, toJSON or caller reread. */
function snapshot(value: unknown): unknown {
  let nodes = 0,
    bytes = 0;
  function charge(size: number): void {
    bytes += size;
    if (bytes > WHOLE_SCOPE_PRODUCT_GRANT_EVENT_LIMIT) invalid();
  }
  function stringSize(value: string): number {
    // UTF16 length is a lower bound: reject before allocating encoded bytes.
    if (value.length > WHOLE_SCOPE_PRODUCT_GRANT_EVENT_LIMIT) invalid();
    unicode(value);
    return encoder.encode(value).length;
  }
  function copy(v: unknown, depth: number): unknown {
    if (++nodes > 100000 || depth > 32) invalid();
    if (v === null || typeof v === "boolean") {
      charge(v === null ? 4 : v ? 4 : 5);
      return v;
    }
    if (typeof v === "string") {
      charge(stringSize(v) + 2);
      return v;
    }
    if (typeof v === "number") {
      if (!Number.isSafeInteger(v) || Object.is(v, -0)) invalid();
      charge(String(v).length);
      return v;
    }
    if (typeof v !== "object") invalid();
    charge(2); // Object/array delimiters; separators charged before children.
    const proto = prototypeOf(v),
      ds = descriptorsOf(v),
      keys = ownKeys(ds);
    if (Array.isArray(v)) {
      if (proto !== Array.prototype || !hasOwn(ds.length, "value")) invalid();
      const length = ds.length.value;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 10000 ||
        keys.length !== length + 1
      )
        invalid();
      const result: unknown[] = [];
      for (let i = 0; i < length; i++) {
        const d = ds[String(i)];
        if (!d || !d.enumerable || !hasOwn(d, "value")) invalid();
        if (i) charge(1);
        result.push(copy(d.value, depth + 1));
      }
      return Object.freeze(result);
    }
    if (proto !== Object.prototype && proto !== null) invalid();
    const result: Record<string, unknown> = Object.create(null);
    let fieldCount = 0;
    for (const key of keys) {
      if (typeof key !== "string") invalid();
      charge(stringSize(key) + 3 + (fieldCount++ ? 1 : 0));
      const d = ds[key];
      if (!d.enumerable || !hasOwn(d, "value")) invalid();
      result[key] = copy(d.value, depth + 1);
    }
    return Object.freeze(result);
  }
  try {
    return copy(value, 0);
  } catch {
    invalid();
  }
}
function exact(value: unknown, keys: string[]): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((k) => !keys.includes(k)))
    invalid();
  return value as Row;
}
function id(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
  )
    invalid();
  return v;
}
function fp(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f]{64}$/.test(v)) invalid();
  return v;
}
function revision(v: unknown): number {
  if (
    typeof v !== "number" ||
    !Number.isSafeInteger(v) ||
    v < 1 ||
    Object.is(v, -0)
  )
    invalid();
  return v;
}
function text(v: unknown): string {
  if (
    typeof v !== "string" ||
    v.trim() !== v ||
    Array.from(v).length < 1 ||
    Array.from(v).length > 256
  )
    invalid();
  return v;
}
function compare(a: string, b: string): number {
  const x = encoder.encode(a),
    y = encoder.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    let s = "[";
    for (let i = 0; i < v.length; i++) s += (i ? "," : "") + canonical(v[i]);
    return s + "]";
  }
  if (v !== null && typeof v === "object") {
    const row = v as Row,
      keys = Object.keys(row).sort(compare);
    let s = "{";
    for (let i = 0; i < keys.length; i++)
      s +=
        (i ? "," : "") +
        JSON.stringify(keys[i]) +
        ":" +
        canonical(row[keys[i]]);
    return s + "}";
  }
  return JSON.stringify(v);
}
async function sha(raw: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(raw)),
  );
  let s = "";
  for (let i = 0; i < digest.length; i++)
    s += digest[i].toString(16).padStart(2, "0");
  return s;
}
function utc6(value: unknown): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ||
    value.slice(0, 4) === "0000"
  )
    invalid();
  const milli = value.slice(0, 23) + "Z",
    parsed = Date.parse(milli);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== milli)
    invalid();
}
function ordered(value: unknown, booking = false): readonly string[] {
  if (!Array.isArray(value) || value.length > 1000) invalid();
  let previous: string | undefined;
  for (let i = 0; i < value.length; i++) {
    const current = booking ? text(value[i]) : id(value[i]);
    if (previous !== undefined && compare(previous, current) >= 0) invalid();
    previous = current;
  }
  return value;
}
function membership(value: unknown, organization: string): Row {
  const m = exact(value, [
    "schema_version",
    "organization_id",
    "root_kind",
    "root_id",
    "root_evidence",
    "source_project_ids",
    "local_booking_ids",
    "relationships",
    "integration_state",
    "economic_mapping",
  ]);
  if (
    m.schema_version !== "operations-project-scope-membership-v1" ||
    id(m.organization_id) !== organization ||
    !["project", "large_project", "packing_project"].includes(
      m.root_kind as string,
    ) ||
    m.integration_state !== "membership_only" ||
    m.economic_mapping !== "unavailable"
  )
    invalid();
  id(m.root_id);
  const projects = ordered(m.source_project_ids),
    bookings = ordered(m.local_booking_ids, true);
  const root = exact(m.root_evidence, [
    "status",
    "primary_local_booking_id",
    "packing_parent_id",
  ]);
  if (
    root.primary_local_booking_id !== null &&
    !bookings.includes(text(root.primary_local_booking_id))
  )
    invalid();
  if (root.packing_parent_id !== null) id(root.packing_parent_id);
  if (m.root_kind === "packing_project") text(root.status);
  else if (root.status !== null || root.packing_parent_id !== null) invalid();
  if (!Array.isArray(m.relationships) || m.relationships.length > 10000)
    invalid();
  let previous: string | undefined;
  for (let i = 0; i < m.relationships.length; i++) {
    const r = exact(m.relationships[i], [
      "relation",
      "relation_id",
      "parent_id",
      "local_booking_id",
    ]);
    if (
      ![
        "project_booking",
        "large_project_booking",
        "packing_project_booking",
        "packing_direct_booking",
        "large_parent_booking",
      ].includes(r.relation as string)
    )
      invalid();
    id(r.relation_id);
    id(r.parent_id);
    if (!bookings.includes(text(r.local_booking_id))) invalid();
    if (
      r.relation === "project_booking" &&
      (r.relation_id !== r.parent_id ||
        !projects.includes(r.parent_id as string))
    )
      invalid();
    if (
      r.relation === "large_project_booking" &&
      (m.root_kind !== "large_project" || r.parent_id !== m.root_id)
    )
      invalid();
    if (
      ["packing_project_booking", "packing_direct_booking"].includes(
        r.relation as string,
      ) &&
      (m.root_kind !== "packing_project" || r.parent_id !== m.root_id)
    )
      invalid();
    const current = canonical(r);
    if (previous !== undefined && compare(previous, current) >= 0) invalid();
    previous = current;
  }
  return m;
}
/** Async digest checks use only the initial immutable descriptor snapshot. */
export async function validateWholeScopeProductGrantEvent(
  value: unknown,
): Promise<Row> {
  const e = exact(snapshot(value), fields);
  if (
    e.schema_version !== WHOLE_SCOPE_PRODUCT_GRANT_EVENT_SCHEMA ||
    typeof e.enabled !== "boolean"
  )
    invalid();
  for (const key of [
    "event_id",
    "organization_id",
    "economic_scope_id",
    "actor_id",
    "partner_version",
    "destination_organization_id",
    "destination_scope_id",
    "destination_mapping_id",
    "scope_snapshot_id",
    "composition_snapshot_id",
  ])
    id(e[key]);
  for (const key of [
    "revision",
    "destination_mapping_revision",
    "scope_revision",
    "composition_revision",
  ])
    revision(e[key]);
  for (const key of [
    "destination_mapping_fingerprint",
    "membership_fingerprint",
    "composition_fingerprint",
    "command_fingerprint",
  ])
    fp(e[key]);
  utc6(e.created_at);
  let c: ReturnType<typeof validateWholeScopeProductGrantCommand>;
  try {
    c = validateWholeScopeProductGrantCommand(e.command);
  } catch {
    invalid();
  }
  if (
    canonical(e.command) !== wholeScopeProductGrantCommandBytes(c) ||
    e.revision !== c.expected_grant_revision + 1
  )
    invalid();
  for (const key of [
    "economic_scope_id",
    "partner_version",
    "destination_organization_id",
    "destination_scope_id",
    "destination_mapping_id",
    "destination_mapping_revision",
    "destination_mapping_fingerprint",
    "enabled",
  ] as const)
    if (e[key] !== c[key]) invalid();
  if (
    e.scope_revision !== c.expected_scope_revision ||
    e.membership_fingerprint !== c.expected_membership_fingerprint ||
    e.composition_revision !== c.expected_composition_revision ||
    e.composition_fingerprint !== c.expected_composition_fingerprint
  )
    invalid();
  const m = membership(e.full_membership, id(e.organization_id));
  const raw = canonical(e);
  if (encoder.encode(raw).length > WHOLE_SCOPE_PRODUCT_GRANT_EVENT_LIMIT)
    invalid();
  if (
    (await wholeScopeProductGrantCommandFingerprint(c)) !==
      e.command_fingerprint ||
    (await sha(canonical(m))) !== e.membership_fingerprint
  )
    invalid();
  return e;
}
export async function wholeScopeProductGrantEventBytes(
  value: unknown,
): Promise<string> {
  return canonical(await validateWholeScopeProductGrantEvent(value));
}
export async function wholeScopeProductGrantEventFingerprintBytes(
  value: unknown,
): Promise<string> {
  return (
    "[" +
    JSON.stringify(WHOLE_SCOPE_PRODUCT_GRANT_EVENT_PURPOSE) +
    "," +
    (await wholeScopeProductGrantEventBytes(value)) +
    "]"
  );
}
export async function wholeScopeProductGrantEventFingerprint(
  value: unknown,
): Promise<string> {
  return sha(await wholeScopeProductGrantEventFingerprintBytes(value));
}
/** Metadata projection only; no usable disclosure authority is created. */
export async function wholeScopeProductGrantEventProjection(
  value: unknown,
): Promise<Row> {
  const e = await validateWholeScopeProductGrantEvent(value);
  return Object.freeze({
    event_id: e.event_id,
    revision: e.revision,
    fingerprint: await sha(
      "[" +
        JSON.stringify(WHOLE_SCOPE_PRODUCT_GRANT_EVENT_PURPOSE) +
        "," +
        canonical(e) +
        "]",
    ),
    destination_organization_id: e.destination_organization_id,
    destination_scope_id: e.destination_scope_id,
    destination_mapping_id: e.destination_mapping_id,
    destination_mapping_revision: e.destination_mapping_revision,
  });
}
