/** Pure encoding only. Neither caller JSON nor a hash supplies product authority. */
import { validateScopeInvoiceKernelEvidence } from "./project-scope-invoice-kernel-evidence.ts";
export const PRODUCT_PUBLICATION_COMMAND_SCHEMA =
  "operations-whole-scope-product-publication-command.v1";
export const PRODUCT_PUBLICATION_CALCULATION_VERSION =
  "operations-whole-scope-invoice-capture-sql.v1";
export const PRODUCT_PUBLICATION_PRIVATE_LIMIT = 4194304;
type Row = Record<string, unknown>;
const encoder = new TextEncoder();
function fail(): never {
  throw new Error("Invalid whole-scope product publication input");
}
function unicode(value: string, allowNul = false): void {
  if (!allowNul && value.includes("\0")) fail();
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail();
    } else if (n >= 0xdc00 && n <= 0xdfff) fail();
  }
}
function raw(
  value: unknown,
  limit = PRODUCT_PUBLICATION_PRIVATE_LIMIT,
): string {
  if (typeof value !== "string") fail();
  unicode(value);
  if (
    value.length < 1 ||
    encoder.encode(value).byteLength > limit ||
    value.charCodeAt(0) === 0xfeff
  )
    fail();
  return value;
}
/** Decimal arithmetic on strings prevents JS rounding from authorizing a fraction. */
function exactIntegerToken(token: string): number {
  const parts = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(
    token,
  );
  if (!parts) fail();
  const fraction = parts[3] ?? "";
  const exponent = Number(parts[4] ?? "0");
  if (!Number.isSafeInteger(exponent)) fail();
  let digits = (parts[2] + fraction).replace(/^0+/, "");
  if (digits.length === 0) {
    if (parts[1] === "-") fail();
    return 0;
  }
  const shift = exponent - fraction.length;
  if (!Number.isSafeInteger(shift)) fail();
  if (shift < 0) {
    const removed = -shift;
    if (
      removed >= digits.length ||
      !/^0+$/.test(digits.slice(digits.length - removed))
    )
      fail();
    digits = digits.slice(0, digits.length - removed);
  } else {
    if (digits.length + shift > 16) fail();
    digits += "0".repeat(shift);
  }
  if (
    digits.length > 16 ||
    (digits.length === 16 && digits > "9007199254740991")
  )
    fail();
  return Number((parts[1] === "-" ? "-" : "") + digits);
}

/** Bounded JSON grammar also rejects duplicate keys; JSON.parse alone silently erases them. */
function parse(value: unknown): unknown {
  const text = raw(value);
  let i = 0,
    nodes = 0;
  const space = () => {
    while (/[\t\r\n ]/.test(text[i] ?? "!") && i < text.length) i++;
  };
  function string(): string {
    const start = i++;
    let escaped = false;
    while (i < text.length) {
      const c = text[i++];
      if (!escaped && c === '"') {
        let result: unknown;
        try {
          result = JSON.parse(text.slice(start, i));
        } catch {
          fail();
        }
        if (typeof result !== "string") fail();
        unicode(result);
        return result;
      }
      if (!escaped && c === "\\") escaped = true;
      else escaped = false;
    }
    fail();
  }
  function node(depth: number): unknown {
    if (++nodes > 250000 || depth > 32) fail();
    space();
    const c = text[i];
    if (c === '"') return string();
    if (c === "{") {
      i++;
      const result: Row = Object.create(null);
      space();
      if (text[i] === "}") {
        i++;
        return result;
      }
      for (;;) {
        space();
        if (text[i] !== '"') fail();
        const key = string();
        if (Object.hasOwn(result, key)) fail();
        space();
        if (text[i++] !== ":") fail();
        result[key] = node(depth + 1);
        space();
        const end = text[i++];
        if (end === "}") return result;
        if (end !== ",") fail();
      }
    }
    if (c === "[") {
      i++;
      const result: unknown[] = [];
      space();
      if (text[i] === "]") {
        i++;
        return result;
      }
      for (;;) {
        result[result.length] = node(depth + 1);
        space();
        const end = text[i++];
        if (end === "]") return result;
        if (end !== ",") fail();
      }
    }
    for (const [token, result] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const)
      if (text.startsWith(token, i)) {
        i += token.length;
        return result;
      }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      text.slice(i),
    );
    if (!match) fail();
    i += match[0].length;
    return exactIntegerToken(match[0]);
  }
  const result = node(0);
  space();
  if (i !== text.length) fail();
  return result;
}
function exact(value: unknown, keys: readonly string[]): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const row = value as Row;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(row, k))
  )
    fail();
  return row;
}

const commandKeys = [
  "schema_version",
  "economic_scope_id",
  "expected_scope_revision",
  "expected_membership_fingerprint",
  "expected_composition_revision",
  "expected_composition_fingerprint",
  "expected_publication_revision",
  "idempotency_key",
  "reason",
];
function audit(value: unknown, min: number, max: number): void {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    Array.from(value).length < min ||
    Array.from(value).length > max
  )
    fail();
}
export function parseWholeScopeProductPublicationCommand(
  rawCommand: string,
): Row {
  const command = exact(parse(rawCommand), commandKeys);
  if (
    command.schema_version !== PRODUCT_PUBLICATION_COMMAND_SCHEMA ||
    typeof command.economic_scope_id !== "string" ||
    !/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(
      command.economic_scope_id,
    )
  )
    fail();
  for (const key of [
    "expected_scope_revision",
    "expected_composition_revision",
    "expected_publication_revision",
  ]) {
    const value = command[key];
    const minimum = key === "expected_publication_revision" ? 0 : 1;
    const maximum =
      key === "expected_publication_revision"
        ? Number.MAX_SAFE_INTEGER - 1
        : Number.MAX_SAFE_INTEGER;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      Object.is(value, -0) ||
      value < minimum ||
      value > maximum
    )
      fail();
  }
  for (const key of [
    "expected_membership_fingerprint",
    "expected_composition_fingerprint",
  ])
    if (
      typeof command[key] !== "string" ||
      !/^[0-9a-f]{64}$/.test(command[key])
    )
      fail();
  audit(command.idempotency_key, 12, 200);
  audit(command.reason, 3, 1000);
  return command;
}
function compareUtf8(a: string, b: string): number {
  const left = encoder.encode(a),
    right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const row = value as Row;
    return (
      "{" +
      Object.keys(row)
        .sort(compareUtf8)
        .map((key) => JSON.stringify(key) + ":" + canonical(row[key]))
        .join(",") +
      "}"
    );
  }
  if (
    typeof value === "number" &&
    (!Number.isSafeInteger(value) || Object.is(value, -0))
  )
    fail();
  return JSON.stringify(value);
}
/** Strict raw strings are parsed into private descriptor-free JSON values first. */
export function wholeScopeProductCanonicalJson(rawJson: string): string {
  return canonical(parse(rawJson));
}
async function fingerprint(value: unknown): Promise<string> {
  const ownedBytes = encoder.encode(canonical(value));
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", ownedBytes),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
/** Full original observations are retained in semantic hash. Integrity is not admission. */
export async function wholeScopeProductCaptureFingerprint(
  rawCapture: string,
): Promise<string> {
  const capture = await validateScopeInvoiceKernelEvidence(parse(rawCapture));
  return fingerprint(["operations-whole-scope-product-evidence-v1", capture]);
}
/** Currentness comparison excludes exactly the two approved volatile locations. */
export async function wholeScopeProductCaptureCurrentnessBytes(
  rawCapture: string,
): Promise<string> {
  const capture = await validateScopeInvoiceKernelEvidence(parse(rawCapture));
  const comparison = JSON.parse(JSON.stringify(capture)) as Row;
  delete comparison.as_of;
  const members = comparison.members as Row[];
  for (const member of members) delete (member.kernel_evidence as Row).as_of;
  return canonical(comparison);
}
