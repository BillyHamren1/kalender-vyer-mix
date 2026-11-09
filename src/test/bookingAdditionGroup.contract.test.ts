import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseBookingGroup, classifyAttachOutcome } from "../../supabase/functions/_shared/bookingGroup";
import { deriveSingleBookingOutcome, validateSingleBookingResult } from "../../supabase/functions/_shared/singleBookingResult";

const importSrc = readFileSync("supabase/functions/import-bookings/index.ts", "utf8");

describe("parseBookingGroup", () => {
  it("leaves ordinary ungrouped bookings unchanged", () => {
    expect(parseBookingGroup({ id: "b1" })).toEqual({ ok: true, group: { kind: "none" } });
    expect(parseBookingGroup({ id: "b1", booking_group: { root_booking_id: "b1", is_addition: false } }))
      .toEqual({ ok: true, group: { kind: "none" } });
  });

  it("accepts a confirmed addition pointing at its root", () => {
    expect(parseBookingGroup({ id: "c1", booking_group: { root_booking_id: "r1", is_addition: true, addition_number: 2 } }))
      .toEqual({ ok: true, group: { kind: "addition", rootBookingId: "r1", additionNumber: 2 } });
    expect(parseBookingGroup({ id: "c1", parent_booking_id: "r1", addition_number: "1" }))
      .toEqual({ ok: true, group: { kind: "addition", rootBookingId: "r1", additionNumber: 1 } });
  });

  it("fails closed on self-parent, missing root, mismatched or malformed grouping", () => {
    expect(parseBookingGroup({ id: "c1", booking_group: { root_booking_id: "c1", is_addition: true } }))
      .toEqual({ ok: false, error: "booking_group_self_parent" });
    expect(parseBookingGroup({ id: "c1", booking_group: { is_addition: true } }))
      .toEqual({ ok: false, error: "booking_group_missing_root" });
    expect(parseBookingGroup({ id: "c1", parent_booking_id: "r2", booking_group: { root_booking_id: "r1", is_addition: true } }))
      .toEqual({ ok: false, error: "booking_group_root_mismatch" });
    expect(parseBookingGroup({ id: "c1", booking_group: "r1" }).ok).toBe(false);
    expect(parseBookingGroup({ id: "c1", booking_group: { root_booking_id: "r1", is_addition: "yes" } }).ok).toBe(false);
    expect(parseBookingGroup({ id: "c1", booking_group: { root_booking_id: "r1'; drop", is_addition: true } }).ok).toBe(false);
    expect(parseBookingGroup({ id: "c1", booking_group: { root_booking_id: "r1", is_addition: true, addition_number: 0 } }).ok).toBe(false);
  });
});

describe("classifyAttachOutcome", () => {
  it("treats attach and idempotent retry as success", () => {
    expect(classifyAttachOutcome({ ok: true, outcome: "attached" })).toEqual({ error: null, retryable: false });
    expect(classifyAttachOutcome({ ok: true, outcome: "already_attached" })).toEqual({ error: null, retryable: false });
  });
  it("retries a temporarily unavailable root and refuses conflicts", () => {
    expect(classifyAttachOutcome({ ok: false, outcome: "root_unavailable", retryable: true }))
      .toEqual({ error: "booking_addition_root_unavailable", retryable: true });
    expect(classifyAttachOutcome({ ok: false, outcome: "explicit_assignment_conflict", retryable: false }))
      .toEqual({ error: "booking_addition_explicit_assignment_conflict", retryable: false });
  });
  it("keeps an unassigned root as a retryable failure so the sync job is not completed", () => {
    expect(classifyAttachOutcome({ ok: false, outcome: "root_unassigned", retryable: true }))
      .toEqual({ error: "booking_addition_root_unassigned", retryable: true });
    const results = { failed: 1, errors: [{ booking_id: "c1", error: "booking_addition_root_unassigned" }], total: 1 };
    expect(deriveSingleBookingOutcome(results)).toBe("partial");
    const v = validateSingleBookingResult(
      { sync_mode: "single", booking_id: "c1", organization_id: "o1", outcome: "partial", success: false, completed: false, results },
      { bookingId: "c1", organizationId: "o1" }, { ok: true, status: 200 },
    );
    expect(v).toEqual({ ok: false, permanent: false, reason: "partial_import" });
  });
});

describe("import-bookings addition wiring", () => {
  it("rejects malformed grouping and defers confirmed additions whose root is not in this tenant", () => {
    expect(importSrc).toMatch(/parseBookingGroup\(externalBooking\)/);
    expect(importSrc).toMatch(/\.eq\('id', bookingGroup\.rootBookingId\)\s*\n\s*\.eq\('organization_id', organizationId\)/);
    expect(importSrc).toContain("'booking_addition_root_unavailable'");
  });
  it("attaches via the tenant-scoped RPC instead of creating calendar or warehouse copies", () => {
    expect(importSrc).toContain("supabase.rpc('attach_booking_addition'");
    expect(importSrc).not.toMatch(/(?<!bookingGroup\.kind === 'addition' \? 0 : )await syncWarehouseEventsForBooking\(/);
  });
  it("never trusts Sales project IDs for additions and keeps additions out of LP representative", () => {
    expect(importSrc).toMatch(/dbInsertData\.assigned_project_id = null/);
    expect(importSrc).toMatch(/delete updateData\.assigned_project_id/);
    expect(importSrc).toContain("select('id, parent_booking_id').eq('large_project_id', lpId)");
  });
});
