/** TEST-only exact old/new compatibility comparison; never grants read authority. */
export const REMAINING_READER_FAMILIES = [
  "parent", "drilldown", "composition", "kernel", "original", "policy",
] as const;
export type RemainingReaderFamily = typeof REMAINING_READER_FAMILIES[number];
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ReaderOutcome =
  | { kind: "reply"; value: unknown }
  | { kind: "error"; sqlstate: string; message: string };

const contracts = {
  parent: { key: "schema", schema: "operations-scope-obligation-evidence.v1", clock: "generatedAt" },
  drilldown: { key: "schema", schema: "operations-scope-obligation-drilldown.v1", clock: "asOf" },
  composition: { key: "schema_version", schema: "operations-scope-obligation-composition-read.v1", clock: null },
  kernel: { key: "schema_version", schema: "operations-invoice-obligation-kernel-evidence.v1", clock: "as_of" },
  original: { key: "schema_version", schema: "operations-obligation-original-evidence.v1", clock: null },
  policy: { key: "schema_version", schema: "operations-obligation-source-policy-projection.v1", clock: null },
} as const;

function fail(): never {
  // Deliberately exclude raw evidence/private messages from test diagnostics.
  throw new Error("remaining_reader_parity_failed");
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function snapshot(value: unknown, seen = new Set<object>()): Json {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) fail();
    return value;
  }
  if (typeof value !== "object" || seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0) fail();
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  let copied: Json;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype ||
      !Object.hasOwn(descriptors.length, "value") || !Number.isSafeInteger(descriptors.length.value) ||
      descriptors.length.value < 0 || Object.keys(descriptors).length !== descriptors.length.value + 1) fail();
    const rows: Json[] = [];
    for (let i = 0; i < descriptors.length.value; i++) {
      const descriptor = descriptors[String(i)];
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
      rows.push(snapshot(descriptor.value, seen));
    }
    copied = rows;
  } else {
    if (!record(value)) fail();
    const fields: Record<string, Json> = Object.create(null);
    for (const key of Object.keys(descriptors)) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) fail();
      fields[key] = snapshot(descriptor.value, seen);
    }
    copied = fields;
  }
  seen.delete(value);
  return copied;
}
function zonedTimestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
    hour <= 23 && minute <= 59 && second <= 59 &&
    (match[7] === "Z" || (Number(match[8]) <= 23 && Number(match[9]) <= 59));
}
function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function comparable(family: RemainingReaderFamily, outcome: ReaderOutcome): string {
  if (!Object.hasOwn(contracts, family) || !record(outcome)) fail();
  const safe = snapshot(outcome) as Record<string, Json>;
  if (safe.kind === "error") {
    if (!exactKeys(safe, ["kind", "sqlstate", "message"]) ||
      typeof safe.sqlstate !== "string" || !/^[0-9A-Z]{5}$/.test(safe.sqlstate) ||
      typeof safe.message !== "string" || new TextEncoder().encode(safe.message).length > 16384) fail();
    return canonical(safe);
  }
  if (safe.kind !== "reply" || !exactKeys(safe, ["kind", "value"]) ||
    safe.value === null || typeof safe.value !== "object" || Array.isArray(safe.value)) fail();
  const contract = contracts[family];
  if (safe.value[contract.key] !== contract.schema) fail();
  const copied = { ...safe.value };
  if (contract.clock !== null) {
    if (!Object.hasOwn(copied, contract.clock) || !zonedTimestamp(copied[contract.clock])) fail();
    delete copied[contract.clock];
  }
  return canonical({ kind: "reply", value: copied });
}

/** Objects use JSON key-set equality; arrays and all saved values remain exact. */
export function assertRemainingReaderParity(
  family: RemainingReaderFamily,
  original: ReaderOutcome,
  candidate: ReaderOutcome,
): void {
  if (comparable(family, original) !== comparable(family, candidate)) fail();
}
