/** Pure proposed successor command encoding only; no actor, grant, disclosure, money or source authority. */
export const WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA =
  "operations-whole-scope-granted-product-publication-command.v2";
export const WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_PURPOSE =
  "operations-whole-scope-granted-product-publication-command-v2";
export const WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_LIMIT = 16384;

export type WholeScopeGrantedPublicationCommand = Readonly<{
  schema_version: typeof WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA;
  economic_scope_id: string;
  expected_scope_revision: number;
  expected_membership_fingerprint: string;
  expected_composition_revision: number;
  expected_composition_fingerprint: string;
  expected_publication_revision: number;
  expected_grant_revision: number;
  idempotency_key: string;
  reason: string;
}>;
const fields = [
  "economic_scope_id",
  "expected_composition_fingerprint",
  "expected_composition_revision",
  "expected_grant_revision",
  "expected_membership_fingerprint",
  "expected_publication_revision",
  "expected_scope_revision",
  "idempotency_key",
  "reason",
  "schema_version",
] as const;
const encoder = new TextEncoder();
const hasOwn = Object.hasOwn;
function invalid(): never {
  throw new Error("Invalid whole-scope granted publication command");
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length > 2 * maximum ||
    value.includes("\0") ||
    value.trim() !== value
  )
    invalid();
  let scalars = 0;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid();
    scalars++;
  }
  if (scalars < minimum || scalars > maximum) invalid();
  return value;
}
function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value.toLowerCase();
}
function fingerprint(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) invalid();
  return value;
}
function revision(value: unknown, zeroAllowed = false): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < (zeroAllowed ? 0 : 1) ||
    value >
      (zeroAllowed ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER)
  )
    invalid();
  return value;
}

/** Snapshot data descriptors once; never invoke getters or reread caller values. */
export function validateWholeScopeGrantedPublicationCommand(
  value: unknown,
): WholeScopeGrantedPublicationCommand {
  if (value === null || typeof value !== "object") invalid();
  const input: Record<string, unknown> = Object.create(null);
  try {
    if (Array.isArray(value)) invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length) invalid();
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (
        typeof key !== "string" ||
        !fields.includes(key as (typeof fields)[number])
      )
        invalid();
    }
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as string;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, "value"))
        invalid();
      input[key] = descriptor.value;
    }
  } catch {
    // Caller Proxy traps/revocation must not reflect private exception text.
    invalid();
  }
  if (input.schema_version !== WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA)
    invalid();
  const result: WholeScopeGrantedPublicationCommand = Object.freeze({
    schema_version: WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_SCHEMA,
    economic_scope_id: uuid(input.economic_scope_id),
    expected_scope_revision: revision(input.expected_scope_revision),
    expected_membership_fingerprint: fingerprint(
      input.expected_membership_fingerprint,
    ),
    expected_composition_revision: revision(
      input.expected_composition_revision,
    ),
    expected_composition_fingerprint: fingerprint(
      input.expected_composition_fingerprint,
    ),
    expected_publication_revision: revision(
      input.expected_publication_revision,
      true,
    ),
    expected_grant_revision: revision(input.expected_grant_revision),
    idempotency_key: text(input.idempotency_key, 12, 200),
    reason: text(input.reason, 3, 1000),
  });
  return result;
}

function canonicalCommand(
  command: WholeScopeGrantedPublicationCommand,
): string {
  let out = "{";
  for (let i = 0; i < fields.length; i++) {
    if (i) out += ",";
    const field = fields[i];
    out += JSON.stringify(field) + ":" + JSON.stringify(command[field]);
  }
  return out + "}";
}
/** Exact compact canonical command JSON. Input objects are not raw JSON parsers. */
export function wholeScopeGrantedPublicationCommandBytes(
  value: unknown,
): string {
  const raw = canonicalCommand(
    validateWholeScopeGrantedPublicationCommand(value),
  );
  if (
    encoder.encode(raw).byteLength >
    WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_LIMIT
  )
    invalid();
  return raw;
}
/** UTF8 compact purpose array, without BOM/LF; metadata fingerprint only. */
export function wholeScopeGrantedPublicationCommandFingerprintBytes(
  value: unknown,
): string {
  return (
    "[" +
    JSON.stringify(WHOLE_SCOPE_GRANTED_PUBLICATION_COMMAND_PURPOSE) +
    "," +
    wholeScopeGrantedPublicationCommandBytes(value) +
    "]"
  );
}
export async function wholeScopeGrantedPublicationCommandFingerprint(
  value: unknown,
): Promise<string> {
  const bytes = encoder.encode(
    wholeScopeGrantedPublicationCommandFingerprintBytes(value),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (let i = 0; i < digest.length; i++)
    hex += digest[i].toString(16).padStart(2, "0");
  return hex;
}
