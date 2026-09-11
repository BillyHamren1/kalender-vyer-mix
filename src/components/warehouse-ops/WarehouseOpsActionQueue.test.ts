import { describe, expect, it } from "vitest";
import { queueItems } from "./WarehouseOpsActionQueue";
import type { OpsAttention, OpsJob } from "@/hooks/useWarehouseOpsRange";
import type { SyncJob } from "@/hooks/useSyncJobs";
import type { WarehouseProjectInboxItem } from "@/types/warehouseProject";

const TODAY = "2026-09-11";

const inbox = (id: string, eventDate: string | null): WarehouseProjectInboxItem => ({
  id,
  organization_id: "org-1",
  source_type: "booking",
  source_id: `booking-${id}`,
  source_project_number: id,
  client_name: "Kund",
  event_date: eventDate,
  status: "new",
  warehouse_project_id: null,
  created_at: `${TODAY}T08:00:00Z`,
  processed_at: null,
});

const job = (id: string, anchorDate: string, overrides: Partial<OpsJob> = {}): OpsJob => ({
  id,
  packingId: id,
  name: `Jobb ${id}`,
  status: "planning",
  client: "Kund",
  bookingId: `booking-${id}`,
  bookingNumber: id,
  warehouseProjectId: null,
  largeProjectId: null,
  direction: "out",
  anchorDate,
  anchorTime: null,
  startDate: anchorDate,
  endDate: anchorDate,
  signedAt: null,
  signedByName: null,
  totalItems: 10,
  verifiedItems: 0,
  percent: 0,
  assignedStaff: [],
  workers: [],
  lastActivityAt: null,
  lastScanAt: null,
  updatedAt: `${TODAY}T08:00:00Z`,
  ...overrides,
});

const syncJob = (id: string, bookingId: string, status: SyncJob["status"]): SyncJob => ({
  id,
  booking_id: bookingId,
  organization_id: "org-1",
  event_type: "booking.updated",
  status,
  error_message: status === "failed" ? "Synkfel" : null,
  attempts: 1,
  max_attempts: 3,
  received_at: `${TODAY}T08:00:00Z`,
  started_at: null,
  processed_at: null,
});

describe("Att lösa nu", () => {
  it("tar bort vanliga framtida och odaterade bokningar men behåller akuta", () => {
    const result = queueItems(
      [
        inbox("urgent", "2026-09-13"),
        inbox("future", "2026-09-20"),
        inbox("past", "2026-09-02"),
        inbox("missing", null),
      ],
      [],
      [],
      [],
      [],
      [],
      TODAY,
    );

    expect(result.map((item) => item.id)).toContain("inbox-urgent");
    expect(result.map((item) => item.id)).not.toContain("inbox-future");
    expect(result.map((item) => item.id)).not.toContain("inbox-past");
    expect(result.map((item) => item.id)).not.toContain("inbox-missing");
  });

  it("visar saknad bemanning eller tid endast inom 48 timmar", () => {
    const nearUnstaffed = job("near", "2026-09-12");
    const nearNoTime = job("near-time", "2026-09-13", {
      assignedStaff: [{
        staffId: "staff-1",
        name: "Anna",
        assignmentDate: "2026-09-13",
        startTime: null,
        endTime: null,
        status: "planned",
      }],
    });
    const future = job("future", "2026-09-20");
    const past = job("past", "2026-09-02");

    const result = queueItems([], [], [nearUnstaffed, nearNoTime, future, past], [], [], [], TODAY);

    expect(result.map((item) => item.id)).toEqual(expect.arrayContaining(["unstaffed-near", "no-time-near-time"]));
    expect(result.map((item) => item.id)).not.toContain("unstaffed-future");
    expect(result.map((item) => item.id)).not.toContain("unstaffed-past");
  });

  it("behåller riktiga avvikelser: attention, sen ändring och WMS-blockering", () => {
    const attention: OpsAttention = {
      id: "late-pack",
      level: "critical",
      title: "UT försenad",
      detail: "0% packat",
    };
    const result = queueItems(
      [],
      [attention],
      [],
      [{ id: "changed", name: "Ändrad", client_name: "Kund", start_date: "2026-09-12" }],
      [
        { packingId: "blocked", bookingNumber: "2609-1", customerName: "Kund", eventDate: "2026-09-12", blocked: 2, worstStatus: "BLOCKED" },
        { packingId: "warning", bookingNumber: "2609-2", customerName: "Kund", eventDate: "2026-09-12", blocked: 0, worstStatus: "WARNING" },
      ],
      [],
      TODAY,
    );

    expect(result.map((item) => item.id)).toEqual(expect.arrayContaining([
      "attention-late-pack",
      "changed-changed",
      "wms-blocked",
    ]));
    expect(result.map((item) => item.id)).not.toContain("wms-warning");
  });

  it("visar synkfel bara när bokningens senaste synkjobb är failed", () => {
    const oldFailure = {
      ...syncJob("old-failed", "booking-old", "failed"),
      received_at: "2026-08-20T08:00:00Z",
    };
    const result = queueItems(
      [],
      [],
      [],
      [],
      [],
      [
        syncJob("latest-ok", "booking-ok", "completed"),
        syncJob("older-failed", "booking-ok", "failed"),
        syncJob("latest-failed", "booking-failed", "failed"),
        oldFailure,
      ],
      TODAY,
    );

    expect(result.map((item) => item.id)).toContain("sync-latest-failed");
    expect(result.map((item) => item.id)).not.toContain("sync-older-failed");
    expect(result.map((item) => item.id)).not.toContain("sync-old-failed");
  });
});
