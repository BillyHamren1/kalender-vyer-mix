import { describe, expect, it } from "vitest";
import {
  buildCateringReassignment,
  fingerprintCateringAllocationCost,
  fingerprintCateringAllocationEvent,
  validateCateringReassignmentCommand,
} from "./catering-project-reassignment.ts";

const id = (n: number) =>
  `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
import { createIsolatedCateringAllocationFixture as fixture } from "../../../scripts/project-economy/catering-allocation-fixture.ts";

describe("native Catering independent allocation authority v2", () => {
  it("moves the same 105-minute 52502 cost with unchanged native version and historical rate", async () => {
    const { command, saved, resolved } = await fixture();
    const before = structuredClone(saved);
    const result = await buildCateringReassignment(command, saved, resolved);
    expect(result.snapshot).toMatchObject({
      project_id: id(11),
      obligation_id: id(12),
      source_time_entry_version: 1,
      publication_revision: 3,
      minutes: 105,
      hourly_rate_minor: 30001,
      amount_minor: 52502,
      work_date: "2026-09-30",
      rate_revision: "historical-September",
      source_status: "pending",
      project_review_status: "preliminary",
    });
    expect(Object.keys(result.snapshot)).toHaveLength(25);
    expect(Object.keys(result.event)).toHaveLength(26);
    expect(result.event).toMatchObject({
      allocation_revision: 1,
      base_publication_revision: 2,
      allocated_publication_revision: 3,
      source_observation_id: id(9),
      source_entry_version: 1,
      previous_mapping_id: id(10),
      next_mapping_id: id(15),
      raw_entry_sha256: saved.raw_entry_sha256,
      raw_review_sha256: null,
    });
    expect(saved).toEqual(before);
    expect(await fingerprintCateringAllocationCost(result.snapshot)).toBe(
      await fingerprintCateringAllocationCost(saved.snapshot),
    );
  });
  it("does not transfer an old project's synthetic saved confirmation", async () => {
    const f = await fixture();
    f.saved.snapshot.project_review_status = "confirmed"; // Explicit saved-decision unit control, not human proof.
    expect(
      (await buildCateringReassignment(f.command, f.saved, f.resolved)).snapshot
        .project_review_status,
    ).toBe("preliminary");
  });
  it("preserves missing-rate nulls without contemporary rates or zero", async () => {
    const f = await fixture(true);
    expect(
      (await buildCateringReassignment(f.command, f.saved, f.resolved))
        .snapshot,
    ).toMatchObject({
      coverage: "missing_rate",
      rate_revision: null,
      hourly_rate_minor: null,
      amount_minor: null,
      minutes: 105,
    });
  });
  it("never resurrects globally rejected source", async () => {
    const f = await fixture();
    f.saved.snapshot.source_status = "rejected";
    f.saved.snapshot.project_review_status = "rejected";
    expect(
      (await buildCateringReassignment(f.command, f.saved, f.resolved)).snapshot
        .project_review_status,
    ).toBe("rejected");
  });
  it.each([
    "organization",
    "currency",
    "invoice",
    "revision",
    "project",
    "obligation",
  ])("rejects wrong actual target obligation %s", async (mismatch) => {
    const f = await fixture();
    const target = f.resolved.target_obligation as unknown as Record<
      string,
      unknown
    >;
    if (mismatch === "organization") target["organization_id"] = id(99);
    if (mismatch === "currency") target["currency"] = "EUR";
    if (mismatch === "invoice") target["cost_basis"] = "invoice";
    if (mismatch === "revision") target["current_revision"] = 2;
    if (mismatch === "project") target["project_id"] = id(99);
    if (mismatch === "obligation") target["obligation_id"] = id(99);
    await expect(buildCateringReassignment(f.command, f.saved, f.resolved))
      .rejects.toThrow();
  });
  it.each(["source", "allocation", "observation", "fingerprint", "stream"])(
    "rejects stale/conflicting %s anchor",
    async (mismatch) => {
      const f = await fixture();
      if (mismatch === "source") f.command.expected_source_revision = 1;
      if (mismatch === "allocation") f.command.expected_allocation_revision = 1;
      if (mismatch === "observation") {
        f.command.expected_observation_id = id(99);
      }
      if (mismatch === "fingerprint") {
        f.command.expected_source_fingerprint = "0".repeat(64);
      }
      if (mismatch === "stream") {
        f.command.source_stream_id = `catering:${id(99)}:${id(5)}`;
      }
      await expect(buildCateringReassignment(f.command, f.saved, f.resolved))
        .rejects.toThrow();
    },
  );
  it("strictly rejects wrong-type/unknown/actor-supplied command fields", async () => {
    const f = await fixture();
    for (
      const mutation of [
        { expected_observation_id: [id(9)] },
        { expected_source_revision: "2" },
        { expected_allocation_revision: -1 },
        {
          expected_source_fingerprint: [f.command.expected_source_fingerprint],
        },
        { reason: {} },
        { actor_system_user_id: id(13) },
        { organization_id: id(1) },
        { schema_version: null },
      ]
    ) {
      expect(() =>
        validateCateringReassignmentCommand({ ...f.command, ...mutation })
      ).toThrow();
    }
  });
  it("rejects no-op allocation and invalid historical event calendar", async () => {
    const f = await fixture();
    expect(() =>
      validateCateringReassignmentCommand({
        ...f.command,
        target_project_id: f.command.from_project_id,
        target_obligation_id: f.command.from_obligation_id,
      })
    ).toThrow();
    f.resolved.created_at = "2026-02-30T00:00:00Z";
    await expect(buildCateringReassignment(f.command, f.saved, f.resolved))
      .rejects.toThrow();
  });
  it("fingerprints are order-independent, bind economics and preserve Unicode/historical timestamp", async () => {
    const f = await fixture();
    const result = await buildCateringReassignment(
      f.command,
      f.saved,
      f.resolved,
    );
    const { fingerprint: expected, ...document } = result.event;
    const reversed = Object.fromEntries(Object.entries(document).reverse());
    expect(
      await fingerprintCateringAllocationEvent(reversed as typeof document),
    ).toBe(expected);
    expect(
      await fingerprintCateringAllocationEvent({
        ...document,
        reason: "annan orsak",
      }),
    ).not.toBe(expected);
    expect(
      await fingerprintCateringAllocationCost({
        ...f.saved.snapshot,
        amount_minor: 52503,
      }),
    ).not.toBe(result.event.source_cost_fingerprint);
    expect(document.created_at).toBe("2026-10-02T00:00:00.123456+00:00");
    expect(document.reason).toBe(f.command.reason);
  });
  it("rejects PostgreSQL-inexpressible NUL/surrogate reason and Unicode edge whitespace", async () => {
    const f = await fixture();
    for (
      const reason of [
        "bad\u0000reason",
        "bad\ud800reason",
        "\tleading reason",
        "\u00a0leading reason",
        "trailing reason\n",
      ]
    ) {
      await expect(
        buildCateringReassignment(
          { ...f.command, reason },
          f.saved,
          f.resolved,
        ),
      ).rejects.toThrow();
    }
  });
});
