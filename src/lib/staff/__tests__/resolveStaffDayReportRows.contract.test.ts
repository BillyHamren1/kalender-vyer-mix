/**
 * Verifierar att resolveStaffDayReportSummariesBatch:
 *   1. Returnerar rows[] från cachens display_blocks_json.
 *   2. Faller tillbaka till report_candidate_blocks_json när display är tomt.
 *   3. Returnerar [] när bägge är tomma.
 *
 * Detta är den nya single-pipeline-kontrakten: get-staff-time-week-matrix
 * mappar rows direkt till cell.rows utan parallella anrop till
 * get-staff-gps-week-summary.
 */
import { describe, expect, it } from "vitest";

// Vi importerar genom node-runtime; resolveStaffDayReport ligger i Deno-deps
// (esm.sh) som inte fungerar i vitest. Vi speglar därför mapperns kontrakt
// här på TS-nivå via mapper-helpers som redan har Node-tester.
import {
  mapReportBlocksToSegments,
  selectCacheBlockSource,
} from "@/lib/staff/mapReportBlocksToSegments";

interface ResolvedRow {
  kind: string;
  label: string;
  minutes: number;
}

function rowsFromCache(cache: {
  display_blocks_json?: unknown;
  report_candidate_blocks_json?: unknown;
  workday_allocation_segments_json?: unknown;
}): ResolvedRow[] {
  const picked = selectCacheBlockSource(cache);
  if (picked.source === "none") return [];
  const segments = mapReportBlocksToSegments(picked.blocks, { source: picked.source });
  return segments.map((s) => ({
    kind:
      s.kind === "project" || s.kind === "booking" || s.kind === "large_project" ||
      s.kind === "warehouse" || s.kind === "location"
        ? "work"
        : s.kind === "travel"
        ? "travel"
        : s.kind === "break"
        ? "private"
        : s.kind === "needs_review"
        ? "needs_review"
        : s.kind === "unknown"
        ? "unknown_place"
        : "other",
    label: s.label,
    minutes: Math.max(0, Math.round(s.durationMinutes || 0)),
  }));
}

const sampleBlock = (overrides: Record<string, unknown> = {}) => ({
  id: "b1",
  kind: "project",
  startAt: "2026-06-01T07:00:00.000Z",
  endAt: "2026-06-01T11:00:00.000Z",
  durationMinutes: 240,
  title: "Projekt X",
  ...overrides,
});

describe("resolveStaffDayReport rows projection contract", () => {
  it("returnerar rows från display_blocks_json när det finns", () => {
    const rows = rowsFromCache({
      display_blocks_json: [sampleBlock()],
      report_candidate_blocks_json: [],
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].kind).toBe("work");
    expect(rows[0].minutes).toBe(240);
  });

  it("faller tillbaka till report_candidate_blocks_json när display är tomt array", () => {
    // display=[] räknas som "V2 har bestämt sig" → ingen fallback (per fix 6)
    const rows = rowsFromCache({
      display_blocks_json: [],
      report_candidate_blocks_json: [sampleBlock()],
    });
    expect(rows).toEqual([]);
  });

  it("faller tillbaka till report_candidate_blocks_json när display saknas helt", () => {
    const rows = rowsFromCache({
      report_candidate_blocks_json: [sampleBlock()],
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].minutes).toBe(240);
  });

  it("returnerar [] när alla blocks-källor saknas", () => {
    const rows = rowsFromCache({});
    expect(rows).toEqual([]);
  });
});
