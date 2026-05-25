import { describe, it, expect } from "vitest";
import { calculateSubmissionMinutes } from "../usePayrollMonthReport";

describe("calculateSubmissionMinutes", () => {
  it("använder requested_start_at/end_at när båda finns", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: null,
      end_time: null,
      requested_start_at: "2026-05-01T08:00:00Z",
      requested_end_at: "2026-05-01T16:30:00Z",
      break_minutes: 30,
    });
    expect(r.totalMinutes).toBe(8 * 60 + 30 - 30); // 480
    expect(r.startIso).toBe("2026-05-01T08:00:00Z");
    expect(r.endIso).toBe("2026-05-01T16:30:00Z");
  });

  it("faller tillbaka på HH:MM när ISO saknas", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: "07:00",
      end_time: "15:00",
      requested_start_at: null,
      requested_end_at: null,
      break_minutes: 60,
    });
    expect(r.totalMinutes).toBe(8 * 60 - 60); // 420
  });

  it("behandlar end < start som nattpass över midnatt", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: "22:00",
      end_time: "06:00",
      requested_start_at: null,
      requested_end_at: null,
      break_minutes: 0,
    });
    expect(r.totalMinutes).toBe(8 * 60); // 480
  });

  it("returnerar aldrig negativ tid när rasten är större än passet", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: "10:00",
      end_time: "10:30",
      requested_start_at: null,
      requested_end_at: null,
      break_minutes: 120,
    });
    expect(r.totalMinutes).toBe(0);
  });

  it("returnerar 0 när tider saknas helt", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: null,
      end_time: null,
      requested_start_at: null,
      requested_end_at: null,
      break_minutes: 30,
    });
    expect(r.totalMinutes).toBe(0);
    expect(r.startIso).toBeNull();
    expect(r.endIso).toBeNull();
  });

  it("ignorerar ogiltig ISO (end <= start) och faller tillbaka på HH:MM", () => {
    const r = calculateSubmissionMinutes({
      date: "2026-05-01",
      start_time: "08:00",
      end_time: "12:00",
      requested_start_at: "2026-05-01T10:00:00Z",
      requested_end_at: "2026-05-01T09:00:00Z",
      break_minutes: 0,
    });
    expect(r.totalMinutes).toBe(4 * 60);
  });
});
