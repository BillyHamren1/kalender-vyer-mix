import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { computeAttention, type OpsJob } from "@/hooks/useWarehouseOpsRange";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const todayStr = NOW.toISOString().slice(0, 10);
const yesterday = new Date(NOW.getTime() - 864e5).toISOString().slice(0, 10);

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

function job(overrides: Partial<OpsJob>): OpsJob {
  return {
    packingId: "p1",
    id: "p1",
    name: "Packning",
    status: "planning",
    client: null,
    bookingId: "b1",
    bookingNumber: "2604-39",
    warehouseProjectId: null,
    largeProjectId: null,
    direction: "out",
    anchorDate: yesterday,
    anchorTime: null,
    startDate: yesterday,
    endDate: null,
    signedAt: null,
    signedByName: null,
    totalItems: 10,
    verifiedItems: 0,
    percent: 0,
    assignedStaff: [],
    workers: [],
    lastActivityAt: new Date(NOW.getTime() - 8 * 3600_000).toISOString(),
    lastScanAt: null,
    updatedAt: new Date(NOW.getTime() - 8 * 3600_000).toISOString(),
    ...overrides,
  } as OpsJob;
}

describe("warehouse ops – senast scan", () => {
  it("visar 'ingen har scannat än' när inga scans finns, även om updated_at är färsk", () => {
    const [a] = computeAttention([job({})], [], [], NOW);
    expect(a.title).toContain("UT försenad");
    expect(a.detail).toBe("0% packat · ingen har scannat än");
    expect(a.detail).not.toContain("senast scan");
  });

  it("visar scan-tiden när det finns en verklig scan", () => {
    const [a] = computeAttention(
      [job({ lastScanAt: new Date(NOW.getTime() - 45 * 60_000).toISOString(), percent: 20 })],
      [],
      [],
      NOW,
    );
    expect(a.detail).toContain("senast scan");
    expect(a.detail).toContain("20% packat");
  });

  it("skapar ingen paus-rad utan verkliga scans", () => {
    const res = computeAttention(
      [job({ status: "in_progress", anchorDate: todayStr, percent: 0, lastScanAt: null })],
      [],
      [],
      NOW,
    );
    expect(res.some((r) => r.id.startsWith("idle-"))).toBe(false);
  });

  it("skapar paus-rad när senaste verkliga scan är >2h gammal", () => {
    const res = computeAttention(
      [
        job({
          status: "in_progress",
          anchorDate: todayStr,
          percent: 40,
          lastScanAt: new Date(NOW.getTime() - 3 * 3600_000).toISOString(),
        }),
      ],
      [],
      [],
      NOW,
    );
    expect(res.some((r) => r.id.startsWith("idle-"))).toBe(true);
  });
});
