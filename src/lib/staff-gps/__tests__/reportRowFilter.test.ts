import { describe, it, expect } from "vitest";
import type { DaySegment } from "../dayPartition";
import { toReportRows, summarizeReportRows } from "../reportRowFilter";

function seg(partial: Partial<DaySegment> & {
  type: DaySegment["type"];
  start: string;
  end: string;
  minutes: number;
}): DaySegment {
  return {
    label: partial.label ?? "",
    knownSiteId: partial.knownSiteId ?? null,
    fromLabel: partial.fromLabel ?? null,
    toLabel: partial.toLabel ?? null,
    ...partial,
  };
}

describe("toReportRows", () => {
  it("mån-sandwich: kollapsar 3 game-fair-block + 2 same-target travel → 1 rad", () => {
    const input: DaySegment[] = [
      seg({ type: "work",   label: "Swedish game fair", knownSiteId: "sgf",
            start: "2026-05-25T08:54:00Z", end: "2026-05-25T11:57:00Z", minutes: 183 }),
      seg({ type: "travel", label: "Resa", fromLabel: "Swedish game fair", toLabel: "Swedish game fair",
            start: "2026-05-25T11:57:00Z", end: "2026-05-25T12:21:00Z", minutes: 24 }),
      seg({ type: "work",   label: "Swedish game fair", knownSiteId: "sgf",
            start: "2026-05-25T12:21:00Z", end: "2026-05-25T14:15:00Z", minutes: 114 }),
      seg({ type: "travel", label: "Resa", fromLabel: "Swedish game fair", toLabel: "Swedish game fair",
            start: "2026-05-25T14:15:00Z", end: "2026-05-25T15:22:00Z", minutes: 67 }),
      seg({ type: "work",   label: "Swedish game fair", knownSiteId: "sgf",
            start: "2026-05-25T15:22:00Z", end: "2026-05-25T20:53:00Z", minutes: 331 }),
    ];

    const rows = toReportRows(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("work");
    expect(rows[0].label).toBe("Swedish game fair");
    expect(rows[0].start).toBe("2026-05-25T08:54:00Z");
    expect(rows[0].end).toBe("2026-05-25T20:53:00Z");
    // workMin = summa av faktiska work-segment (drift räknas inte)
    expect(rows[0].minutes).toBe(183 + 114 + 331);

    const summary = summarizeReportRows(rows, input);
    expect(summary.workMin).toBe(628);
    expect(summary.travelMin).toBe(0);
    expect(summary.visibleReportRowsCount).toBe(1);
    expect(summary.mergedSameTargetRowsCount).toBe(2); // 3 work → 1 rad = 2 merge
  });

  it("tis-natt: kapar leading unknown_place + trailing private, behåller 4 work/travel-rader", () => {
    const input: DaySegment[] = [
      seg({ type: "unknown_place", label: "Okänd plats", fromLabel: null, toLabel: "FA Warehouse",
            start: "2026-05-26T00:00:00Z", end: "2026-05-26T06:58:00Z", minutes: 418 }),
      seg({ type: "work", label: "FA Warehouse", knownSiteId: "fa",
            start: "2026-05-26T06:58:00Z", end: "2026-05-26T07:49:00Z", minutes: 51 }),
      seg({ type: "travel", label: "Resa", fromLabel: "FA Warehouse", toLabel: "Swedish game fair",
            start: "2026-05-26T07:49:00Z", end: "2026-05-26T09:00:00Z", minutes: 71 }),
      seg({ type: "work", label: "Swedish game fair", knownSiteId: "sgf",
            start: "2026-05-26T09:00:00Z", end: "2026-05-26T17:29:00Z", minutes: 509 }),
      seg({ type: "travel", label: "Resa", fromLabel: "Swedish game fair", toLabel: "FA Warehouse",
            start: "2026-05-26T17:29:00Z", end: "2026-05-26T18:02:00Z", minutes: 33 }),
      seg({ type: "work", label: "FA Warehouse", knownSiteId: "fa",
            start: "2026-05-26T18:02:00Z", end: "2026-05-26T18:08:00Z", minutes: 6 }),
      seg({ type: "private", label: "Boende - Vällsta",
            start: "2026-05-26T18:09:00Z", end: "2026-05-26T18:28:00Z", minutes: 19 }),
    ];

    const rows = toReportRows(input);
    // Förväntat: FA 06:58–07:49, Resa→sgf, sgf 09:00–17:29, Resa→FA
    // 6-min FA-svansen ligger ALENA (ingen efterföljande work med samma key) →
    // den får synas som egen 6-min FA-rad. Det är OK eftersom den är >0 min
    // arbete inom FA. Privat-blocket kapas (efter sista work räknas inte).
    expect(rows.map((r) => `${r.type}:${r.label}`)).toEqual([
      "work:FA Warehouse",
      "travel:Resa",
      "work:Swedish game fair",
      "travel:Resa",
      "work:FA Warehouse",
    ]);
    expect(rows[0].start).toBe("2026-05-26T06:58:00Z");
    expect(rows[rows.length - 1].end).toBe("2026-05-26T18:08:00Z");

    const summary = summarizeReportRows(rows, input);
    expect(summary.workMin).toBe(51 + 509 + 6);
    expect(summary.travelMin).toBe(71 + 33);
    expect(summary.hiddenEvidenceKinds).toContain("unknown_place");
    expect(summary.hiddenEvidenceKinds).toContain("private");
  });

  it("filtrerar same-target travel oavsett storlek", () => {
    const input: DaySegment[] = [
      seg({ type: "work",   label: "X", knownSiteId: "x",
            start: "2026-01-01T08:00:00Z", end: "2026-01-01T09:00:00Z", minutes: 60 }),
      seg({ type: "travel", label: "Resa", fromLabel: "X", toLabel: "X",
            start: "2026-01-01T09:00:00Z", end: "2026-01-01T10:00:00Z", minutes: 60 }),
      seg({ type: "work",   label: "X", knownSiteId: "x",
            start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z", minutes: 60 }),
    ];
    const rows = toReportRows(input);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("work");
    expect(rows[0].minutes).toBe(120);
  });

  it("filtrerar mikro-travel < 5 min mellan olika platser", () => {
    const input: DaySegment[] = [
      seg({ type: "work",   label: "A", knownSiteId: "a",
            start: "2026-01-01T08:00:00Z", end: "2026-01-01T09:00:00Z", minutes: 60 }),
      seg({ type: "travel", label: "Resa", fromLabel: "A", toLabel: "B",
            start: "2026-01-01T09:00:00Z", end: "2026-01-01T09:03:00Z", minutes: 3 }),
      seg({ type: "work",   label: "B", knownSiteId: "b",
            start: "2026-01-01T09:03:00Z", end: "2026-01-01T10:00:00Z", minutes: 57 }),
    ];
    const rows = toReportRows(input);
    // 3-min travel filtreras bort, men A och B är OLIKA targets → ingen merge
    expect(rows.map((r) => r.label)).toEqual(["A", "B"]);
  });

  it("returnerar tom lista när inga work-segment finns", () => {
    const input: DaySegment[] = [
      seg({ type: "private", label: "Hem",
            start: "2026-01-01T00:00:00Z", end: "2026-01-01T23:00:00Z", minutes: 1380 }),
    ];
    expect(toReportRows(input)).toEqual([]);
  });
});
