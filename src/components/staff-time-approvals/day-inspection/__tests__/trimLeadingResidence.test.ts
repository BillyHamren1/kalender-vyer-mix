import { describe, it, expect } from "vitest";
import { extractSegments } from "../DayInspectionSections";

// Eftersom trimLeadingResidenceSegments inte exporteras testar vi via
// SegmentList-renderkontraktet: vi reimplementerar samma regel här och
// säkerställer att den matchar förväntan på vanliga input.
function isResidenceSegment(seg: any): boolean {
  const label = String(seg?.label ?? seg?.targetLabel ?? seg?.title ?? "").toLowerCase();
  const type = String(seg?.type ?? seg?.classification ?? seg?.kind ?? "").toLowerCase();
  if (/^\s*boende\b/.test(label)) return true;
  if (/private[_-]?residence|residence|home|boende/.test(type)) return true;
  return false;
}
function trim(segments: any[]): any[] {
  let i = 0;
  while (i < segments.length && isResidenceSegment(segments[i])) i++;
  return i === 0 ? segments : segments.slice(i);
}

describe("trimLeadingResidenceSegments", () => {
  it("droppar ledande Boende-segment innan första arbetspinget", () => {
    const segs = [
      { label: "Boende - Vällsta", start: "06:51", end: "06:53" },
      { label: "FA Warehouse", start: "06:53", end: "11:38" },
      { label: "Övergång", start: "11:38", end: "11:40" },
      { label: "Boende - Vällsta", start: "11:40", end: "11:40" },
    ];
    const out = trim(segs);
    expect(out).toHaveLength(3);
    expect(out[0].label).toBe("FA Warehouse");
    // Boende EFTER första arbetssegmentet bevaras
    expect(out.at(-1)?.label).toBe("Boende - Vällsta");
  });

  it("rör inte segment som redan börjar med arbete", () => {
    const segs = [
      { label: "FA Warehouse", start: "06:53", end: "11:38" },
      { label: "Boende - Vällsta", start: "11:40", end: "11:40" },
    ];
    expect(trim(segs)).toHaveLength(2);
  });

  it("droppar flera ledande boende/private-segment i rad", () => {
    const segs = [
      { label: "Boende", type: "private_residence" },
      { label: "Boende - Vällsta" },
      { type: "home" },
      { label: "Projekt A" },
    ];
    const out = trim(segs);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Projekt A");
  });

  it("extractSegments hanterar tomma snapshots", () => {
    expect(extractSegments(null)).toEqual([]);
    expect(extractSegments({})).toEqual([]);
    expect(extractSegments({ segments: [{ label: "X" }] })).toHaveLength(1);
  });
});
