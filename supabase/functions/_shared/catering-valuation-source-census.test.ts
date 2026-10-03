import assert from "node:assert/strict";
import test from "node:test";
import {
  fingerprintCateringValuationCensus,
  projectCateringValuationSourceCensus,
  type CateringValuationCensusInput,
  type CateringValuationCensusLine,
} from "./catering-valuation-source-census.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const h = (value: string) => value.repeat(64).slice(0, 64);
const bases = ["ingredient_estimate", "purchase_estimate", "stock_consumption"] as const;
const bookings = [
  {
    booking_id: "Booking-A",
    source_project_id: id(801),
    obligation_id: id(811),
    mapping_revision: "booking-map-Booking-A-1",
  },
  {
    booking_id: "Booking-B",
    source_project_id: id(802),
    obligation_id: id(812),
    mapping_revision: "booking-map-Booking-B-1",
  },
];
const stream = (basis: typeof bases[number], booking: string) =>
  id(1000 + bookings.findIndex((item) => item.booking_id === booking) * 10 + bases.indexOf(basis));

function line(
  basis: typeof bases[number],
  source: number,
  amount: number | null = 1200,
  booking = source === 22 ? "Booking-B" : "Booking-A",
): CateringValuationCensusLine {
  const membership = bookings.find((item) => item.booking_id === booking)!;
  return {
    organization_id: id(1),
    source_organization_id: id(2),
    source_id: id(source),
    source_version: `revision-${source}`,
    source_fingerprint: h(String((source % 9) + 1)),
    currency: basis === "purchase_estimate" ? "EUR" : "SEK",
    project_id: id(3),
    source_project_id: membership.source_project_id,
    obligation_id: membership.obligation_id,
    amount_minor: amount,
    basis,
    movement_id: basis === "stock_consumption" ? id(source + 100) : null,
    valuation_document_id: basis === "stock_consumption" ? id(source + 200) : null,
    source_stream_id: stream(basis, booking),
    source_sequence: 1,
    source_event_id: id(source + 300),
    source_booking_id: booking,
    booking_mapping_revision: membership.mapping_revision,
    purchase_source_document_id: basis === "purchase_estimate" ? id(source + 400) : null,
    purchase_source_document_kind: basis === "purchase_estimate" ? "estimate_or_quote" : null,
    replaces_source_event_id: null,
    economic_origin_id: id(source + 500),
    valuation_state: amount === null ? "missing" : "valued",
    valuation_reason: amount === null ? "missing_price" : "source_valued",
  };
}

async function input(
  rows: CateringValuationCensusLine[] = [
    line("ingredient_estimate", 20, 1200),
    line("purchase_estimate", 21, 1300),
    line("stock_consumption", 22, 1400),
  ],
  revision = 1,
): Promise<CateringValuationCensusInput> {
  const value: Omit<CateringValuationCensusInput, "census_fingerprint"> = {
    schema_version: "operations-catering-valuation-census-input.v1",
    authority: "future_authenticated_catering_census_only",
    organization_id: id(1),
    catering_organization_id: id(2),
    project_id: id(3),
    census_id: id(100 + revision),
    census_revision: revision,
    previous_census: revision === 1 ? null : {
      census_id: id(100 + revision - 1),
      census_revision: revision - 1,
      census_fingerprint: h("a"),
    },
    captured_at: `2026-10-${String(revision).padStart(2, "0")}T10:00:00Z`,
    producer_commit: "1".repeat(40),
    producer_tree: "2".repeat(40),
    snapshot_id: id(700),
    snapshot_revision: revision,
    snapshot_fingerprint: h("d"),
    snapshot_as_of: `2026-10-${String(revision).padStart(2, "0")}T09:59:59Z`,
    booking_mapping_head_id: id(701),
    booking_mapping_revision: revision,
    booking_mapping_fingerprint: h("e"),
    booking_membership: structuredClone(bookings),
    source_heads: bases.map((basis, index) => ({
      basis,
      currency: basis === "purchase_estimate" ? "EUR" : "SEK",
      source_stream_id: id(10 + index),
      source_revision: `head-${revision}-${basis}`,
      source_fingerprint: h(String(index + 3)),
      row_count: rows.filter((row) => row.basis === basis).length,
      currentness: "current",
      unavailable_reason: null,
      snapshot_fingerprint: h("d"),
    })),
    booking_source_heads: bookings.flatMap((booking) => bases.map((basis, index) => {
      const selected = rows.filter((row) =>
        row.basis === basis && row.source_booking_id === booking.booking_id);
      return {
        basis,
        currency: basis === "purchase_estimate" ? "EUR" : "SEK",
        source_stream_id: stream(basis, booking.booking_id),
        source_revision: `booking-head-${revision}-${booking.booking_id}-${basis}`,
        source_fingerprint: h(String(index + 6)),
        row_count: selected.length,
        currentness: selected.length ? "current" as const : "current_empty" as const,
        unavailable_reason: null,
        booking_id: booking.booking_id,
        booking_mapping_revision: booking.mapping_revision,
        snapshot_fingerprint: h("d"),
      };
    })),
    lines: rows,
  };
  return { ...value, census_fingerprint: await fingerprintCateringValuationCensus(value) };
}

async function resigned(value: CateringValuationCensusInput): Promise<CateringValuationCensusInput> {
  const unsigned = structuredClone(value) as Record<string, unknown>;
  delete unsigned.census_fingerprint;
  return {
    ...value,
    census_fingerprint: await fingerprintCateringValuationCensus(
      unsigned as unknown as Omit<CateringValuationCensusInput, "census_fingerprint">,
    ),
  };
}

test("preserves three exclusive valuation bases and every source currency without totals", async () => {
  const result = await projectCateringValuationSourceCensus(await input());
  assert.deepEqual(result.sourceHeads.map((head) => head.basis), bases);
  assert.deepEqual(result.sourceHeads.map((head) => head.coverage), ["complete", "complete", "complete"]);
  assert.deepEqual(result.sources.map((source) => [source.basis, source.currency, source.amountMinor]), [
    ["ingredient_estimate", "SEK", 1200],
    ["purchase_estimate", "EUR", 1300],
    ["stock_consumption", "SEK", 1400],
  ]);
  assert.deepEqual(result.bookingMembership.map((row) => row.bookingId), ["Booking-A", "Booking-B"]);
  assert.deepEqual(result.bookingMembership.map((row) => [row.sourceProjectId, row.obligationId]), [
    [id(801), id(811)],
    [id(802), id(812)],
  ]);
  assert.equal(result.economicTotalMinor, null);
  assert.equal(result.eacMinor, null);
  assert.equal(result.budgetMinor, null);
  assert.equal(result.marginMinor, null);
  assert.equal(result.conversionApplied, false);
  assert.equal(result.economicTotalsAdmission, false);
  assert.equal(result.runtimeAdmission, false);
});

test("empty or unavailable source inventories remain unavailable, never zero", async () => {
  let value = await input([]);
  value.source_heads[1] = {
    ...value.source_heads[1],
    currentness: "unavailable",
    unavailable_reason: "booking_source_unavailable",
  };
  value.booking_source_heads[4] = {
    ...value.booking_source_heads[4],
    currentness: "unavailable",
    unavailable_reason: "source_unreachable",
  };
  value = await resigned(value);
  const result = await projectCateringValuationSourceCensus(value);
  assert.deepEqual(result.sourceHeads.map((head) => head.coverage), ["unavailable", "unavailable", "unavailable"]);
  assert.deepEqual(result.sources, []);
  assert.equal(result.economicTotalMinor, null);
  assert.equal(result.sourceCoverage, "unavailable");
  assert(result.sourceHeads[1].issues.some((issue) => issue.includes("source_unreachable:")));
});

test("missing valuation stays null and makes only that basis unavailable", async () => {
  const rows = [
    line("ingredient_estimate", 20, null),
    line("purchase_estimate", 21, 1300),
    line("stock_consumption", 22, 1400),
  ];
  const result = await projectCateringValuationSourceCensus(await input(rows));
  assert.equal(result.sources[0].amountMinor, null);
  assert.equal(result.sourceHeads[0].coverage, "unavailable");
  assert(result.sourceHeads[0].issues.some((issue) =>
    issue === `Booking-A:missing_price:${id(20)}`));
  assert.equal(result.economicTotalMinor, null);
});

test("basis, stream, count and currency cannot cross source-head custody", async () => {
  for (const mutate of [
    (value: CateringValuationCensusInput) => { value.lines[0].source_stream_id = id(11); },
    (value: CateringValuationCensusInput) => { value.source_heads[0].row_count = 2; },
    (value: CateringValuationCensusInput) => { value.lines[0].currency = "EUR"; },
  ]) {
    let value = await input();
    mutate(value);
    value = await resigned(value);
    await assert.rejects(() => projectCateringValuationSourceCensus(value),
      /catering_(booking_)?source_(head_mismatch|count_mismatch)/);
  }
});

test("a source identity cannot be replayed under another mutually exclusive basis", async () => {
  const duplicate = line("purchase_estimate", 20, 1200);
  const rows = [line("ingredient_estimate", 20, 1200), duplicate, line("stock_consumption", 22, 1400)];
  const value = await input(rows);
  await assert.rejects(() => projectCateringValuationSourceCensus(value),
    /duplicate_catering_census_source/);
});

test("stock actuals require both documents and estimates reject stock documents", async () => {
  let value = await input();
  value.lines[2].movement_id = null;
  value = await resigned(value);
  const missing = await projectCateringValuationSourceCensus(value);
  assert.equal(missing.sourceHeads[2].coverage, "unavailable");
  assert(missing.sourceHeads[2].issues.some((issue) =>
    issue === `Booking-B:missing_actual_valuation:${id(22)}`));

  value = await input();
  value.lines[0].movement_id = id(900);
  value.lines[0].valuation_document_id = id(901);
  value = await resigned(value);
  await assert.rejects(() => projectCateringValuationSourceCensus(value), /estimate_is_not_stock_actual/);
});

test("retry is idempotent and a correction binds the immediately previous census", async () => {
  const first = await input();
  const a = await projectCateringValuationSourceCensus(first);
  const b = await projectCateringValuationSourceCensus(structuredClone(first));
  assert.deepEqual(a, b);

  const correctedRows = [
    {
      ...line("ingredient_estimate", 20, 1500),
      source_version: "revision-corrected",
      source_event_id: id(999),
      replaces_source_event_id: id(320),
    },
    line("purchase_estimate", 21, 1300),
    line("stock_consumption", 22, 1400),
  ];
  const corrected = await input(correctedRows, 2);
  corrected.previous_census = {
    census_id: first.census_id,
    census_revision: first.census_revision,
    census_fingerprint: first.census_fingerprint,
  };
  const signed = await resigned(corrected);
  const result = await projectCateringValuationSourceCensus(signed);
  assert.equal(result.previous_census_id, first.census_id);
  assert.equal(result.sources[0].amountMinor, 1500);
  assert.equal(result.sources[0].sourceBookingId, "Booking-A");
  assert.equal(result.sources.find((row) => row.sourceBookingId === "Booking-B")?.amountMinor, 1400);
  assert.equal(result.economicTotalMinor, null);
});

test("withdrawal is a new complete census with absence, never a zero-valued line", async () => {
  const first = await input();
  const withdrawnRows = [line("purchase_estimate", 21, 1300), line("stock_consumption", 22, 1400)];
  let withdrawn = await input(withdrawnRows, 2);
  withdrawn.previous_census = {
    census_id: first.census_id,
    census_revision: 1,
    census_fingerprint: first.census_fingerprint,
  };
  withdrawn = await resigned(withdrawn);
  const result = await projectCateringValuationSourceCensus(withdrawn);
  assert.equal(result.sources.some((source) => source.sourceId === id(20)), false);
  assert.equal(result.sources.some((source) => source.sourceBookingId === "Booking-B"), true);
  assert.equal(result.sourceHeads[0].coverage, "unavailable");
  assert.equal(result.economicTotalMinor, null);

  const stale = structuredClone(withdrawn);
  stale.previous_census!.census_revision = 0;
  const signed = await resigned(stale);
  await assert.rejects(() => projectCateringValuationSourceCensus(signed), /invalid_previous_catering_census/);
});

test("cross-project, cross-organization and unavailable heads with rows fail closed", async () => {
  for (const mutate of [
    (value: CateringValuationCensusInput) => { value.lines[0].project_id = id(99); },
    (value: CateringValuationCensusInput) => { value.lines[0].source_organization_id = id(99); },
    (value: CateringValuationCensusInput) => {
      value.booking_source_heads[0].currentness = "unavailable";
      value.booking_source_heads[0].unavailable_reason = "source_withdrawn";
    },
  ]) {
    let value = await input();
    mutate(value);
    value = await resigned(value);
    await assert.rejects(() => projectCateringValuationSourceCensus(value),
      /foreign_catering_census_line|invalid_catering_booking_source_head/);
  }
});

test("two bookings remain distinct and cross-booking replay or membership fails closed", async () => {
  const value = await input([
    line("ingredient_estimate", 20, 1200, "Booking-A"),
    line("ingredient_estimate", 23, 1250, "Booking-B"),
    line("purchase_estimate", 21, 1300, "Booking-A"),
    line("stock_consumption", 22, 1400, "Booking-B"),
  ]);
  const result = await projectCateringValuationSourceCensus(value);
  assert.deepEqual(result.sources.slice(0, 2).map((row) => row.sourceBookingId),
    ["Booking-A", "Booking-B"]);

  const replay = structuredClone(value);
  replay.lines[1] = {
    ...replay.lines[0],
    source_booking_id: "Booking-B",
    booking_mapping_revision: "booking-map-Booking-B-1",
    source_project_id: id(802),
    obligation_id: id(812),
    source_sequence: 2,
  };
  replay.census_fingerprint = (await resigned(replay)).census_fingerprint;
  await assert.rejects(() => projectCateringValuationSourceCensus(replay),
    /duplicate_catering_census_source/);

  const foreign = structuredClone(value);
  foreign.lines[0].source_booking_id = "Booking-Z";
  foreign.lines.sort((a, b) => bases.indexOf(a.basis) - bases.indexOf(b.basis) ||
    a.source_booking_id.localeCompare(b.source_booking_id) || a.source_id.localeCompare(b.source_id));
  foreign.census_fingerprint = (await resigned(foreign)).census_fingerprint;
  await assert.rejects(() => projectCateringValuationSourceCensus(foreign),
    /foreign_catering_booking_line/);
});

test("booking mapping is single-valued and explicit corrections require a successor census", async () => {
  let conflict = await input();
  conflict.lines[0].booking_mapping_revision = "conflicting-map";
  conflict = await resigned(conflict);
  await assert.rejects(() => projectCateringValuationSourceCensus(conflict),
    /conflicting_catering_booking_mapping/);

  let correction = await input();
  correction.lines[0].source_event_id = id(999);
  correction.lines[0].replaces_source_event_id = id(320);
  correction = await resigned(correction);
  await assert.rejects(() => projectCateringValuationSourceCensus(correction),
    /correction_requires_successor_census/);
});

test("booking valuation mapping binds source project and obligation independently", async () => {
  for (const mutate of [
    (value: CateringValuationCensusInput) => { value.lines[0].source_project_id = id(899); },
    (value: CateringValuationCensusInput) => { value.lines[0].obligation_id = id(899); },
  ]) {
    let value = await input();
    mutate(value);
    value = await resigned(value);
    await assert.rejects(() => projectCateringValuationSourceCensus(value),
      /conflicting_catering_booking_mapping/);
  }
});

test("purchase-source document is estimate-only and never a supplier invoice actual", async () => {
  const projected = await projectCateringValuationSourceCensus(await input());
  const purchase = projected.sources.find((row) => row.basis === "purchase_estimate")!;
  assert.equal(purchase.purchaseSourceDocumentKind, "estimate_or_quote");
  assert.equal(purchase.purchaseSourceDocumentId, id(421));

  let wrongKind = await input();
  wrongKind.lines[1].purchase_source_document_kind = "supplier_invoice" as "estimate_or_quote";
  wrongKind = await resigned(wrongKind);
  await assert.rejects(() => projectCateringValuationSourceCensus(wrongKind),
    /invalid_catering_census_line/);
});

test("all explicit current-empty booking heads remain unavailable rather than zero", async () => {
  const result = await projectCateringValuationSourceCensus(await input([]));
  assert.deepEqual(result.sourceHeads.map((head) => [head.currentness, head.sourceCount, head.coverage]), [
    ["current", 0, "unavailable"],
    ["current", 0, "unavailable"],
    ["current", 0, "unavailable"],
  ]);
  assert(result.bookingSourceHeads.every((head) => head.currentness === "current_empty"));
  assert.equal(result.economicTotalMinor, null);
});

test("snapshot, economic origin and stock movement-document identity are coherent", async () => {
  let edge = await input();
  edge.snapshot_as_of = edge.captured_at;
  edge = await resigned(edge);
  assert.equal((await projectCateringValuationSourceCensus(edge)).snapshotAsOf, edge.captured_at);

  let futureSnapshot = await input();
  futureSnapshot.snapshot_as_of = "2026-10-01T10:00:01Z";
  futureSnapshot = await resigned(futureSnapshot);
  await assert.rejects(() => projectCateringValuationSourceCensus(futureSnapshot),
    /invalid_catering_valuation_census/);

  let splitSnapshot = await input();
  splitSnapshot.booking_source_heads[0].snapshot_fingerprint = h("f");
  splitSnapshot = await resigned(splitSnapshot);
  await assert.rejects(() => projectCateringValuationSourceCensus(splitSnapshot),
    /invalid_catering_booking_source_head/);

  let reusedOrigin = await input();
  reusedOrigin.lines[1].economic_origin_id = reusedOrigin.lines[0].economic_origin_id;
  reusedOrigin = await resigned(reusedOrigin);
  await assert.rejects(() => projectCateringValuationSourceCensus(reusedOrigin),
    /duplicate_catering_economic_origin/);

  const secondStock = {
    ...line("stock_consumption", 24, 1600, "Booking-B"),
    source_sequence: 2,
    movement_id: id(122),
    valuation_document_id: id(222),
  };
  let duplicateStock = await input([
    line("ingredient_estimate", 20, 1200),
    line("purchase_estimate", 21, 1300),
    line("stock_consumption", 22, 1400),
    secondStock,
  ]);
  duplicateStock = await resigned(duplicateStock);
  await assert.rejects(() => projectCateringValuationSourceCensus(duplicateStock),
    /duplicate_catering_stock_valuation_identity/);
});

test("genuine zero is explicit valued evidence while missing value stays null", async () => {
  const zero = await projectCateringValuationSourceCensus(await input([
    line("ingredient_estimate", 20, 0),
    line("purchase_estimate", 21, null),
    line("stock_consumption", 22, 1400),
  ]));
  assert.deepEqual([zero.sources[0].amountMinor, zero.sources[0].valuationState,
    zero.sources[0].valuationReason], [0, "valued", "source_valued"]);
  assert.deepEqual([zero.sources[1].amountMinor, zero.sources[1].valuationState,
    zero.sources[1].valuationReason], [null, "missing", "missing_price"]);

  let contradiction = await input();
  contradiction.lines[0].valuation_state = "missing";
  contradiction.lines[0].valuation_reason = "missing_price";
  contradiction = await resigned(contradiction);
  await assert.rejects(() => projectCateringValuationSourceCensus(contradiction),
    /invalid_catering_census_line/);
});

test("caller fields cannot promote totals, coverage, conversion or runtime", async () => {
  for (const key of ["economicTotalMinor", "eacMinor", "coverage", "runtimeAdmission", "conversionApplied"]) {
    const value = await input() as unknown as Record<string, unknown>;
    value[key] = key === "coverage" ? "complete" : 0;
    await assert.rejects(() => projectCateringValuationSourceCensus(value), /invalid_catering_valuation_census/);
  }
});

test("line order is canonical and arrays are bounded", async () => {
  const unsorted = await input();
  unsorted.lines.reverse();
  const resignedUnsorted = await resigned(unsorted);
  await assert.rejects(() => projectCateringValuationSourceCensus(resignedUnsorted),
    /noncanonical_catering_census_lines/);

  const oversized = await input();
  oversized.lines = Array.from({ length: 100_001 }, (_, n) => line("ingredient_estimate", n + 1000));
  oversized.census_fingerprint = h("f");
  await assert.rejects(() => projectCateringValuationSourceCensus(oversized),
    /invalid_catering_valuation_census/);
});

test("each complete source stream has unique contiguous census ordinals", async () => {
  const first = line("ingredient_estimate", 20, 1200);
  const second = { ...line("ingredient_estimate", 23, 1250, "Booking-A"), source_sequence: 2 };
  const valid = await projectCateringValuationSourceCensus(await input([
    first,
    second,
    line("purchase_estimate", 21, 1300),
    line("stock_consumption", 22, 1400),
  ]));
  assert.deepEqual(valid.sources.filter((row) => row.basis === "ingredient_estimate")
    .map((row) => row.sourceSequence), [1, 2]);

  for (const sequence of [1, 3]) {
    const badSecond = { ...second, source_sequence: sequence };
    const value = await input([
      first,
      badSecond,
      line("purchase_estimate", 21, 1300),
      line("stock_consumption", 22, 1400),
    ]);
    await assert.rejects(() => projectCateringValuationSourceCensus(value),
      /noncontiguous_catering_source_sequence/);
  }
});

test("fingerprint binds every provenance, revision and source byte", async () => {
  for (const mutate of [
    (value: CateringValuationCensusInput) => { value.producer_commit = "3".repeat(40); },
    (value: CateringValuationCensusInput) => { value.source_heads[0].source_revision = "other"; },
    (value: CateringValuationCensusInput) => { value.lines[0].amount_minor = 0; },
  ]) {
    const value = await input();
    mutate(value);
    await assert.rejects(() => projectCateringValuationSourceCensus(value),
      /catering_census_fingerprint_mismatch/);
  }
});
