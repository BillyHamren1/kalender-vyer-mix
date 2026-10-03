/**
 * Source-only, default-off Catering valuation census boundary.
 *
 * A future authenticated server route must build this input from a complete,
 * held Catering source census. Caller JSON is not authority. This module does
 * not read a database, calculate an economic total, convert currency, update a
 * project, or admit runtime use.
 */
import {
  assessCateringValuationCoverage,
  type CateringValuationLine,
} from "./catering-project-evidence.ts";

type Basis = CateringValuationLine["basis"];
const BASES: readonly Basis[] = [
  "ingredient_estimate",
  "purchase_estimate",
  "stock_consumption",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
const GIT = /^[0-9a-f]{40}$/;
const HEAD_KEYS = [
  "basis", "currency", "source_stream_id", "source_revision",
  "source_fingerprint", "row_count", "currentness", "unavailable_reason",
  "snapshot_fingerprint",
] as const;
const BOOKING_KEYS = ["booking_id", "source_project_id", "obligation_id", "mapping_revision"] as const;
const BOOKING_HEAD_KEYS = [
  "basis", "currency", "source_stream_id", "source_revision",
  "source_fingerprint", "row_count", "currentness", "unavailable_reason",
  "booking_id", "booking_mapping_revision", "snapshot_fingerprint",
  "source_observation_id", "source_sequence", "source_as_of",
  "previous_source_observation_id", "previous_source_sequence", "previous_source_fingerprint",
  "expected_effective_observed_revision", "expected_effective_source_observation_id",
  "expected_effective_source_sequence", "expected_effective_source_fingerprint",
] as const;
const LINE_KEYS = [
  "organization_id", "source_organization_id", "source_id", "source_version",
  "source_fingerprint", "currency", "project_id", "obligation_id",
  "amount_minor", "basis", "movement_id", "valuation_document_id",
  "source_stream_id", "source_sequence", "source_event_id", "source_booking_id",
  "booking_mapping_revision", "purchase_source_document_id",
  "purchase_source_document_kind", "replaces_source_event_id", "economic_origin_id",
  "valuation_state", "valuation_reason", "source_project_id",
] as const;
const PREVIOUS_KEYS = ["census_id", "census_revision", "census_fingerprint"] as const;
const INPUT_KEYS = [
  "schema_version", "authority", "organization_id", "catering_organization_id",
  "project_id", "census_id", "census_revision",
  "previous_census", "captured_at", "producer_commit", "producer_tree",
  "snapshot_id", "snapshot_revision", "snapshot_fingerprint", "snapshot_as_of",
  "booking_mapping_head_id", "booking_mapping_revision", "booking_mapping_fingerprint",
  "booking_membership", "source_heads", "booking_source_heads", "lines",
  "census_fingerprint",
] as const;

export interface CateringValuationSourceHead {
  basis: Basis;
  currency: string;
  source_stream_id: string;
  source_revision: string;
  source_fingerprint: string;
  row_count: number;
  currentness: "current" | "unavailable";
  unavailable_reason: "booking_source_unavailable" | null;
  snapshot_fingerprint: string;
}

export interface CateringValuationBookingSourceHead {
  basis: Basis;
  currency: string;
  source_stream_id: string;
  source_revision: string;
  source_fingerprint: string;
  row_count: number;
  currentness: "current" | "current_empty" | "unavailable";
  unavailable_reason: "source_unreachable" | "source_head_missing" | null;
  booking_id: string;
  booking_mapping_revision: string;
  snapshot_fingerprint: string;
  source_observation_id: string;
  source_sequence: number;
  source_as_of: string;
  previous_source_observation_id: string | null;
  previous_source_sequence: number | null;
  previous_source_fingerprint: string | null;
  expected_effective_observed_revision: number;
  expected_effective_source_observation_id: string | null;
  expected_effective_source_sequence: number | null;
  expected_effective_source_fingerprint: string | null;
}

export interface CateringValuationCensusLine extends CateringValuationLine {
  source_stream_id: string;
  source_sequence: number;
  source_event_id: string;
  source_booking_id: string;
  booking_mapping_revision: string;
  /** Purchase-source estimate/quote identity only; never a Fortnox actual. */
  purchase_source_document_id: string | null;
  purchase_source_document_kind: "estimate_or_quote" | null;
  /** Explicit correction edge. Corrections require a successor census. */
  replaces_source_event_id: string | null;
  /** Stable source-system economic origin, regardless of valuation basis. */
  economic_origin_id: string;
  valuation_state: "valued" | "missing";
  valuation_reason: "source_valued" | "missing_price";
  source_project_id: string;
}

export interface CateringValuationCensusInput {
  schema_version: "operations-catering-valuation-census-input.v1";
  authority: "future_authenticated_catering_census_only";
  organization_id: string;
  catering_organization_id: string;
  project_id: string;
  census_id: string;
  census_revision: number;
  previous_census: {
    census_id: string;
    census_revision: number;
    census_fingerprint: string;
  } | null;
  captured_at: string;
  producer_commit: string;
  producer_tree: string;
  snapshot_id: string;
  snapshot_revision: number;
  snapshot_fingerprint: string;
  snapshot_as_of: string;
  booking_mapping_head_id: string;
  booking_mapping_revision: number;
  booking_mapping_fingerprint: string;
  booking_membership: Array<{
    booking_id: string;
    source_project_id: string;
    obligation_id: string;
    mapping_revision: string;
  }>;
  source_heads: CateringValuationSourceHead[];
  booking_source_heads: CateringValuationBookingSourceHead[];
  lines: CateringValuationCensusLine[];
  census_fingerprint: string;
}

export interface CateringValuationCensusProjection {
  schema_version: "operations-catering-valuation-census-projection.v1";
  authority_scope: "validated_catering_census_shape_only";
  organization_id: string;
  catering_organization_id: string;
  project_id: string;
  census_id: string;
  census_revision: number;
  previous_census_id: string | null;
  census_fingerprint: string;
  captured_at: string;
  producer_commit: string;
  producer_tree: string;
  snapshotId: string;
  snapshotRevision: number;
  snapshotFingerprint: string;
  snapshotAsOf: string;
  bookingMappingHeadId: string;
  bookingMappingRevision: number;
  bookingMappingFingerprint: string;
  bookingMembership: Array<{
    bookingId: string;
    sourceProjectId: string;
    obligationId: string;
    mappingRevision: string;
  }>;
  sourceHeads: Array<{
    basis: Basis;
    currency: string;
    sourceStreamId: string;
    sourceRevision: string;
    sourceFingerprint: string;
    sourceCount: number;
    currentness: "current" | "unavailable";
    coverage: "complete" | "unavailable";
    issues: string[];
  }>;
  bookingSourceHeads: Array<{
    basis: Basis;
    currency: string;
    sourceStreamId: string;
    sourceRevision: string;
    sourceFingerprint: string;
    sourceCount: number;
    bookingId: string;
    bookingMappingRevision: string;
    currentness: "current" | "current_empty" | "unavailable";
    coverage: "complete" | "current_empty" | "unavailable";
    issues: string[];
  }>;
  sources: Array<{
    sourceId: string;
    sourceStreamId: string;
    sourceSequence: number;
    sourceVersion: string;
    sourceFingerprint: string;
    sourceEventId: string;
    sourceBookingId: string;
    sourceProjectId: string;
    bookingMappingRevision: string;
    basis: Basis;
    currency: string;
    projectId: string;
    obligationId: string;
    amountMinor: number | null;
    movementId: string | null;
    valuationDocumentId: string | null;
    purchaseSourceDocumentId: string | null;
    purchaseSourceDocumentKind: "estimate_or_quote" | null;
    replacesSourceEventId: string | null;
    economicOriginId: string;
    valuationState: "valued" | "missing";
    valuationReason: "source_valued" | "missing_price";
  }>;
  sourceCoverage: "unavailable";
  cateringCategoryCoverage: "unavailable";
  economicTotalMinor: null;
  remainingMinor: null;
  eacMinor: null;
  budgetMinor: null;
  marginMinor: null;
  conversionApplied: false;
  economicTotalsAdmission: false;
  runtimeAdmission: false;
  shadowOnly: true;
}

function object(value: unknown, code = "invalid_catering_valuation_census"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[], code = "invalid_catering_valuation_census") {
  const row = object(value, code);
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)))
    throw new Error(code);
  return row;
}
function uuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown, maximum = 200): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 &&
    Array.from(value).length <= maximum && !value.includes("\0");
}
function iso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function canonicalUtcSecond(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value.replace(/Z$/, ".000Z");
}
function compareUtf8(a: string, b: string): number {
  const aa = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i += 1)
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}
type BookingMembership = {
  booking_id: string;
  source_project_id: string;
  obligation_id: string;
  mapping_revision: string;
};
function canonicalBookings(value: unknown): BookingMembership[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000)
    throw new Error("invalid_catering_booking_membership");
  const result = value.map((item) => {
    const row = exact(item, BOOKING_KEYS, "invalid_catering_booking_membership");
    if (!text(row.booking_id) || !uuid(row.source_project_id) || !uuid(row.obligation_id) ||
        !text(row.mapping_revision))
      throw new Error("invalid_catering_booking_membership");
    return row as unknown as BookingMembership;
  });
  if (new Set(result.map((row) => row.booking_id)).size !== result.length ||
      result.some((item, index) => index > 0 &&
        compareUtf8(result[index - 1].booking_id, item.booking_id) >= 0))
    throw new Error("noncanonical_catering_booking_membership");
  return result;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => compareUtf8(a, b))
      .map(([key, item]) => [key, canonical(item)]),
  );
  if (value === undefined || typeof value === "function" || typeof value === "bigint" ||
      (typeof value === "number" && !Number.isFinite(value))) throw new Error("non_json_census");
  return value;
}
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(result, (item) => item.toString(16).padStart(2, "0")).join("");
}
export async function fingerprintCateringValuationCensus(
  value: Omit<CateringValuationCensusInput, "census_fingerprint">,
): Promise<string> {
  return digest(value);
}

function parsePrevious(value: unknown, revision: number) {
  if (revision === 1) {
    if (value !== null) throw new Error("invalid_initial_catering_census");
    return null;
  }
  const row = exact(value, PREVIOUS_KEYS, "invalid_previous_catering_census");
  if (!uuid(row.census_id) || !positive(row.census_revision) ||
      row.census_revision + 1 !== revision || !hash(row.census_fingerprint))
    throw new Error("invalid_previous_catering_census");
  return row as unknown as NonNullable<CateringValuationCensusInput["previous_census"]>;
}

function parseHead(value: unknown, expectedBasis: Basis, snapshotFingerprint: string): CateringValuationSourceHead {
  const row = exact(value, HEAD_KEYS, "invalid_catering_source_head");
  if (row.basis !== expectedBasis || typeof row.currency !== "string" ||
      !/^[A-Z]{3}$/.test(row.currency) || !uuid(row.source_stream_id) ||
      !text(row.source_revision) || !hash(row.source_fingerprint) ||
      row.snapshot_fingerprint !== snapshotFingerprint ||
      !nonnegative(row.row_count) || !["current", "unavailable"].includes(row.currentness as string))
    throw new Error("invalid_catering_source_head");
  if (row.currentness === "current") {
    if (row.unavailable_reason !== null) throw new Error("invalid_catering_source_head");
  } else if (row.unavailable_reason !== "booking_source_unavailable") {
    throw new Error("invalid_catering_source_head");
  }
  return row as unknown as CateringValuationSourceHead;
}

function parseBookingHead(
  value: unknown,
  booking: BookingMembership,
  expectedBasis: Basis,
  snapshotFingerprint: string,
): CateringValuationBookingSourceHead {
  const row = exact(value, BOOKING_HEAD_KEYS, "invalid_catering_booking_source_head");
  if (row.booking_id !== booking.booking_id || row.booking_mapping_revision !== booking.mapping_revision ||
      row.basis !== expectedBasis || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
      !uuid(row.source_stream_id) || !text(row.source_revision) || !hash(row.source_fingerprint) ||
      row.snapshot_fingerprint !== snapshotFingerprint ||
      !uuid(row.source_observation_id) || !positive(row.source_sequence) || !canonicalUtcSecond(row.source_as_of) ||
      !nonnegative(row.expected_effective_observed_revision) ||
      !nonnegative(row.row_count) ||
      !["current", "current_empty", "unavailable"].includes(row.currentness as string))
    throw new Error("invalid_catering_booking_source_head");
  const firstSource = row.source_sequence === 1;
  if (firstSource
    ? row.previous_source_observation_id !== null || row.previous_source_sequence !== null ||
      row.previous_source_fingerprint !== null
    : !uuid(row.previous_source_observation_id) || row.previous_source_sequence !== row.source_sequence - 1 ||
      !hash(row.previous_source_fingerprint))
    throw new Error("invalid_catering_booking_source_head");
  const firstEffective = row.expected_effective_observed_revision === 0;
  if (firstEffective
    ? row.expected_effective_source_observation_id !== null || row.expected_effective_source_sequence !== null ||
      row.expected_effective_source_fingerprint !== null
    : !uuid(row.expected_effective_source_observation_id) || !positive(row.expected_effective_source_sequence) ||
      !hash(row.expected_effective_source_fingerprint))
    throw new Error("invalid_catering_booking_source_head");
  if (row.currentness === "current") {
    if (row.row_count === 0 || row.unavailable_reason !== null)
      throw new Error("invalid_catering_booking_source_head");
  } else if (row.currentness === "current_empty") {
    if (row.row_count !== 0 || row.unavailable_reason !== null)
      throw new Error("invalid_catering_booking_source_head");
  } else if (row.row_count !== 0 ||
      !["source_unreachable", "source_head_missing"].includes(row.unavailable_reason as string)) {
    throw new Error("invalid_catering_booking_source_head");
  }
  return row as unknown as CateringValuationBookingSourceHead;
}

function parseLine(value: unknown): CateringValuationCensusLine {
  const row = exact(value, LINE_KEYS, "invalid_catering_census_line");
  if (!uuid(row.organization_id) || !uuid(row.source_organization_id) || !uuid(row.source_id) ||
      !text(row.source_version) || !hash(row.source_fingerprint) ||
      typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
      !uuid(row.project_id) || !uuid(row.obligation_id) ||
      (row.amount_minor !== null && !nonnegative(row.amount_minor)) ||
      !BASES.includes(row.basis as Basis) || !uuid(row.source_stream_id) || !positive(row.source_sequence) ||
      !uuid(row.source_event_id) || !text(row.source_booking_id) || !text(row.booking_mapping_revision) ||
      !uuid(row.source_project_id) ||
      (row.movement_id !== null && !uuid(row.movement_id)) ||
      (row.valuation_document_id !== null && !uuid(row.valuation_document_id)) ||
      (row.purchase_source_document_id !== null && !uuid(row.purchase_source_document_id)) ||
      (row.purchase_source_document_id === null
        ? row.purchase_source_document_kind !== null
        : row.purchase_source_document_kind !== "estimate_or_quote") ||
      (row.basis !== "purchase_estimate" &&
        (row.purchase_source_document_id !== null || row.purchase_source_document_kind !== null)) ||
      (row.replaces_source_event_id !== null && !uuid(row.replaces_source_event_id)) ||
      row.replaces_source_event_id === row.source_event_id || !uuid(row.economic_origin_id) ||
      !["valued", "missing"].includes(row.valuation_state as string) ||
      !["source_valued", "missing_price"].includes(row.valuation_reason as string) ||
      (row.valuation_state === "valued"
        ? row.amount_minor === null || row.valuation_reason !== "source_valued"
        : row.amount_minor !== null || row.valuation_reason !== "missing_price"))
    throw new Error("invalid_catering_census_line");
  return row as unknown as CateringValuationCensusLine;
}

export async function projectCateringValuationSourceCensus(
  value: unknown,
): Promise<CateringValuationCensusProjection> {
  const row = exact(value, INPUT_KEYS);
  if (row.schema_version !== "operations-catering-valuation-census-input.v1" ||
      row.authority !== "future_authenticated_catering_census_only" ||
      !uuid(row.organization_id) || !uuid(row.catering_organization_id) ||
      !uuid(row.project_id) || !uuid(row.census_id) ||
      !positive(row.census_revision) || !iso(row.captured_at) ||
      typeof row.producer_commit !== "string" || !GIT.test(row.producer_commit) ||
      typeof row.producer_tree !== "string" || !GIT.test(row.producer_tree) ||
      !uuid(row.snapshot_id) || !positive(row.snapshot_revision) || !hash(row.snapshot_fingerprint) ||
      !iso(row.snapshot_as_of) || Date.parse(row.snapshot_as_of as string) > Date.parse(row.captured_at as string) ||
      !uuid(row.booking_mapping_head_id) ||
      !positive(row.booking_mapping_revision) || !hash(row.booking_mapping_fingerprint) ||
      !hash(row.census_fingerprint) || !Array.isArray(row.source_heads) ||
      row.source_heads.length !== BASES.length || !Array.isArray(row.booking_source_heads) ||
      !Array.isArray(row.lines) || row.lines.length > 100_000)
    throw new Error("invalid_catering_valuation_census");

  const previous = parsePrevious(row.previous_census, row.census_revision as number);
  const bookings = canonicalBookings(row.booking_membership);
  const bookingMap = new Map(bookings.map((booking) => [booking.booking_id, booking]));
  if (previous?.census_id === row.census_id) throw new Error("reused_catering_census_id");
  const heads = BASES.map((basis, index) =>
    parseHead(row.source_heads[index], basis, row.snapshot_fingerprint as string));
  if (row.booking_source_heads.length !== bookings.length * BASES.length)
    throw new Error("incomplete_catering_booking_source_heads");
  const bookingHeads: CateringValuationBookingSourceHead[] = [];
  for (const booking of bookings)
    for (const basis of BASES)
      bookingHeads.push(parseBookingHead(
        row.booking_source_heads[bookingHeads.length], booking, basis,
        row.snapshot_fingerprint as string,
      ));
  const allStreams = [...heads, ...bookingHeads].map((head) => head.source_stream_id);
  if (new Set(allStreams).size !== allStreams.length)
    throw new Error("duplicate_catering_source_stream");
  const lines = row.lines.map(parseLine);
  const ordered = [...lines].sort((a, b) => {
    const basis = BASES.indexOf(a.basis) - BASES.indexOf(b.basis);
    return basis || compareUtf8(a.source_booking_id, b.source_booking_id) ||
      compareUtf8(a.source_id, b.source_id);
  });
  if (ordered.some((item, index) => item !== lines[index])) throw new Error("noncanonical_catering_census_lines");
  if (new Set(lines.map((line) => line.source_id)).size !== lines.length)
    throw new Error("duplicate_catering_census_source");
  if (new Set(lines.map((line) => line.source_event_id)).size !== lines.length)
    throw new Error("duplicate_catering_source_event");
  if (new Set(lines.map((line) => line.economic_origin_id)).size !== lines.length)
    throw new Error("duplicate_catering_economic_origin");
  for (const line of lines) {
    if (line.organization_id !== row.organization_id ||
        line.source_organization_id !== row.catering_organization_id ||
        line.project_id !== row.project_id)
      throw new Error("foreign_catering_census_line");
    const membership = bookingMap.get(line.source_booking_id);
    if (!membership)
      throw new Error("foreign_catering_booking_line");
    if (membership.mapping_revision !== line.booking_mapping_revision ||
        membership.source_project_id !== line.source_project_id ||
        membership.obligation_id !== line.obligation_id)
      throw new Error("conflicting_catering_booking_mapping");
  }
  if (!previous && lines.some((line) => line.replaces_source_event_id !== null))
    throw new Error("correction_requires_successor_census");
  const stockCompounds = lines.filter((line) => line.basis === "stock_consumption" &&
      line.movement_id !== null && line.valuation_document_id !== null)
    .map((line) => `${line.movement_id}:${line.valuation_document_id}`);
  if (new Set(stockCompounds).size !== stockCompounds.length)
    throw new Error("duplicate_catering_stock_valuation_identity");

  const bookingSourceHeads: CateringValuationCensusProjection["bookingSourceHeads"] = [];
  for (const head of bookingHeads) {
    const membership = bookingMap.get(head.booking_id);
    if (!membership) throw new Error("foreign_catering_booking_head");
    const selected = lines.filter((line) =>
      line.basis === head.basis && line.source_booking_id === head.booking_id);
    if (selected.length !== head.row_count)
      throw new Error("catering_booking_source_count_mismatch");
    if (selected.some((line, index) => line.source_sequence !== index + 1))
      throw new Error("noncontiguous_catering_source_sequence");
    for (const line of selected) {
      if (line.organization_id !== row.organization_id ||
          line.source_organization_id !== row.catering_organization_id ||
          line.project_id !== row.project_id ||
          line.source_project_id !== membership.source_project_id ||
          line.obligation_id !== membership.obligation_id)
        throw new Error("foreign_catering_census_line");
      if (membership.mapping_revision !== line.booking_mapping_revision)
        throw new Error("conflicting_catering_booking_mapping");
      if (line.source_stream_id !== head.source_stream_id || line.currency !== head.currency ||
          line.booking_mapping_revision !== head.booking_mapping_revision)
        throw new Error("catering_booking_source_head_mismatch");
    }
    const assessment = assessCateringValuationCoverage(selected, {
      organization_id: row.organization_id as string,
      catering_organization_id: row.catering_organization_id as string,
      project_id: row.project_id as string,
      obligation_id: membership.obligation_id,
      currency: head.currency,
    }, head.basis);
    const coverage = head.currentness === "current"
      ? assessment.coverage
      : head.currentness === "current_empty" ? "current_empty" : "unavailable";
    const issues = head.currentness === "unavailable"
      ? [`${head.unavailable_reason}:${head.booking_id}:${head.basis}`]
      : head.currentness === "current_empty" ? ["current_empty"] : assessment.issues;
    bookingSourceHeads.push({
      basis: head.basis,
      currency: head.currency,
      sourceStreamId: head.source_stream_id,
      sourceRevision: head.source_revision,
      sourceFingerprint: head.source_fingerprint,
      sourceCount: selected.length,
      bookingId: head.booking_id,
      bookingMappingRevision: head.booking_mapping_revision,
      currentness: head.currentness,
      coverage,
      issues: [...issues].sort(compareUtf8),
    });
  }

  const sourceHeads: CateringValuationCensusProjection["sourceHeads"] = [];
  for (const head of heads) {
    const selected = lines.filter((line) => line.basis === head.basis);
    const contributing = bookingHeads.filter((item) => item.basis === head.basis);
    const expectedCount = contributing.reduce((sum, item) => sum + item.row_count, 0);
    const expectedCurrentness = contributing.some((item) => item.currentness === "unavailable")
      ? "unavailable" : "current";
    if (selected.length !== head.row_count || head.row_count !== expectedCount)
      throw new Error("catering_source_count_mismatch");
    if (head.currentness !== expectedCurrentness ||
        (expectedCurrentness === "current"
          ? head.unavailable_reason !== null
          : head.unavailable_reason !== "booking_source_unavailable") ||
        contributing.some((item) => item.currency !== head.currency))
      throw new Error("catering_source_head_mismatch");
    const perBooking = bookingSourceHeads.filter((item) => item.basis === head.basis);
    const bookingIssues = perBooking
      .flatMap((item) => item.issues.map((issue) => `${item.bookingId}:${issue}`));
    const coverage = head.currentness === "current" && selected.length > 0 &&
        perBooking.every((item) => item.coverage === "complete" || item.coverage === "current_empty")
      ? "complete" : "unavailable";
    sourceHeads.push({
      basis: head.basis,
      currency: head.currency,
      sourceStreamId: head.source_stream_id,
      sourceRevision: head.source_revision,
      sourceFingerprint: head.source_fingerprint,
      sourceCount: selected.length,
      currentness: head.currentness,
      coverage,
      issues: [...bookingIssues].sort(compareUtf8),
    });
  }

  const unsigned = { ...row };
  delete unsigned.census_fingerprint;
  if (await fingerprintCateringValuationCensus(
    unsigned as unknown as Omit<CateringValuationCensusInput, "census_fingerprint">,
  ) !== row.census_fingerprint) throw new Error("catering_census_fingerprint_mismatch");

  return {
    schema_version: "operations-catering-valuation-census-projection.v1",
    authority_scope: "validated_catering_census_shape_only",
    organization_id: row.organization_id as string,
    catering_organization_id: row.catering_organization_id as string,
    project_id: row.project_id as string,
    census_id: row.census_id as string,
    census_revision: row.census_revision as number,
    previous_census_id: previous?.census_id ?? null,
    census_fingerprint: row.census_fingerprint as string,
    captured_at: row.captured_at as string,
    producer_commit: row.producer_commit as string,
    producer_tree: row.producer_tree as string,
    snapshotId: row.snapshot_id as string,
    snapshotRevision: row.snapshot_revision as number,
    snapshotFingerprint: row.snapshot_fingerprint as string,
    snapshotAsOf: row.snapshot_as_of as string,
    bookingMappingHeadId: row.booking_mapping_head_id as string,
    bookingMappingRevision: row.booking_mapping_revision as number,
    bookingMappingFingerprint: row.booking_mapping_fingerprint as string,
    bookingMembership: bookings.map((booking) => ({
      bookingId: booking.booking_id,
      sourceProjectId: booking.source_project_id,
      obligationId: booking.obligation_id,
      mappingRevision: booking.mapping_revision,
    })),
    sourceHeads,
    bookingSourceHeads,
    sources: lines.map((line) => ({
      sourceId: line.source_id,
      sourceStreamId: line.source_stream_id,
      sourceSequence: line.source_sequence,
      sourceVersion: line.source_version,
      sourceFingerprint: line.source_fingerprint,
      sourceEventId: line.source_event_id,
      sourceBookingId: line.source_booking_id,
      sourceProjectId: line.source_project_id,
      bookingMappingRevision: line.booking_mapping_revision,
      basis: line.basis,
      currency: line.currency,
      projectId: line.project_id as string,
      obligationId: line.obligation_id as string,
      amountMinor: line.amount_minor,
      movementId: line.movement_id,
      valuationDocumentId: line.valuation_document_id,
      purchaseSourceDocumentId: line.purchase_source_document_id,
      purchaseSourceDocumentKind: line.purchase_source_document_kind,
      replacesSourceEventId: line.replaces_source_event_id,
      economicOriginId: line.economic_origin_id,
      valuationState: line.valuation_state,
      valuationReason: line.valuation_reason,
    })),
    sourceCoverage: "unavailable",
    cateringCategoryCoverage: "unavailable",
    economicTotalMinor: null,
    remainingMinor: null,
    eacMinor: null,
    budgetMinor: null,
    marginMinor: null,
    conversionApplied: false,
    economicTotalsAdmission: false,
    runtimeAdmission: false,
    shadowOnly: true,
  };
}
