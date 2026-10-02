/** Pure command encoding only; no actor, grant, disclosure or source authority. */
export const WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA =
  "operations-whole-scope-product-export-grant-command.v1";
export const WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_PURPOSE =
  "operations-whole-scope-product-export-grant-command-v1";
export const WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_LIMIT = 16384;

export type WholeScopeProductGrantCommand = Readonly<{
  schema_version: typeof WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA;
  economic_scope_id: string;
  partner_version: string;
  destination_organization_id: string;
  destination_scope_id: string;
  destination_mapping_id: string;
  destination_mapping_revision: number;
  destination_mapping_fingerprint: string;
  expected_scope_revision: number;
  expected_membership_fingerprint: string;
  expected_composition_revision: number;
  expected_composition_fingerprint: string;
  expected_grant_revision: number;
  enabled: boolean;
  idempotency_key: string;
  reason: string;
}>;
const fields = [
  "destination_mapping_fingerprint",
  "destination_mapping_id",
  "destination_mapping_revision",
  "destination_organization_id",
  "destination_scope_id",
  "economic_scope_id",
  "enabled",
  "expected_composition_fingerprint",
  "expected_composition_revision",
  "expected_grant_revision",
  "expected_membership_fingerprint",
  "expected_scope_revision",
  "idempotency_key",
  "partner_version",
  "reason",
  "schema_version",
] as const;
const encoder = new TextEncoder();
function invalid(): never {
  throw new Error("Invalid whole-scope product grant command");
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" ||
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
export function validateWholeScopeProductGrantCommand(
  value: unknown,
): WholeScopeProductGrantCommand {
  if (value === null || typeof value !== "object") invalid();
  let descriptors: PropertyDescriptorMap;
  try {
    if (Array.isArray(value)) invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    // Caller Proxy traps/revocation must not reflect private exception text.
    invalid();
  }
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length) invalid();
  const input: Record<string, unknown> = Object.create(null);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (
      typeof key !== "string" ||
      !fields.includes(key as (typeof fields)[number])
    )
      invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor))
      invalid();
    input[key] = descriptor.value;
  }
  if (
    input.schema_version !== WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA ||
    typeof input.enabled !== "boolean"
  )
    invalid();
  const result: WholeScopeProductGrantCommand = Object.freeze({
    schema_version: WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_SCHEMA,
    economic_scope_id: uuid(input.economic_scope_id),
    partner_version: uuid(input.partner_version),
    destination_organization_id: uuid(input.destination_organization_id),
    destination_scope_id: uuid(input.destination_scope_id),
    destination_mapping_id: uuid(input.destination_mapping_id),
    destination_mapping_revision: revision(input.destination_mapping_revision),
    destination_mapping_fingerprint: fingerprint(
      input.destination_mapping_fingerprint,
    ),
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
    expected_grant_revision: revision(input.expected_grant_revision, true),
    enabled: input.enabled,
    idempotency_key: text(input.idempotency_key, 12, 200),
    reason: text(input.reason, 3, 1000),
  });
  return result;
}

function canonicalCommand(command: WholeScopeProductGrantCommand): string {
  let out = "{";
  for (let i = 0; i < fields.length; i++) {
    if (i) out += ",";
    const field = fields[i];
    out += JSON.stringify(field) + ":" + JSON.stringify(command[field]);
  }
  return out + "}";
}
/** Exact compact canonical command JSON. Input objects are not raw JSON parsers. */
export function wholeScopeProductGrantCommandBytes(value: unknown): string {
  const raw = canonicalCommand(validateWholeScopeProductGrantCommand(value));
  if (encoder.encode(raw).byteLength > WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_LIMIT)
    invalid();
  return raw;
}
/** UTF8 compact purpose array, without BOM/LF; metadata fingerprint only. */
export function wholeScopeProductGrantCommandFingerprintBytes(
  value: unknown,
): string {
  return (
    "[" +
    JSON.stringify(WHOLE_SCOPE_PRODUCT_GRANT_COMMAND_PURPOSE) +
    "," +
    wholeScopeProductGrantCommandBytes(value) +
    "]"
  );
}
export async function wholeScopeProductGrantCommandFingerprint(
  value: unknown,
): Promise<string> {
  const bytes = encoder.encode(
    wholeScopeProductGrantCommandFingerprintBytes(value),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let hex = "";
  for (let i = 0; i < digest.length; i++)
    hex += digest[i].toString(16).padStart(2, "0");
  return hex;
}
