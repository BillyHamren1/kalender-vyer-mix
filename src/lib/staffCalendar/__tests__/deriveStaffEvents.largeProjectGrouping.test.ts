import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { normalizeLargeProjectBookingRows } from "@/lib/largeProject/largeProjectMembers";
import { deriveStaffEvents, type BookingLite, type DeriveInput } from "@/lib/staffCalendar/deriveStaffEvents";

const LP = { id: "lp-1", name: "Mässan", address: "Hallen", start_date: ["2026-10-01"], end_date: ["2026-10-05"] };
const b = (id: string, extra: Partial<BookingLite> = {}): BookingLite => ({ id, client: `Kund ${id}`, booking_number: `NR-${id}`, large_project_id: null, ...extra });

// A: rigg 10-01, nedrigg 10-05. B: rigg 10-02, nedrigg 10-06 (olika datum).
const A = () => b("A", { rigdaydate: "2026-10-01", rigdowndate: "2026-10-05" });
const B = () => b("B", { rigdaydate: "2026-10-02", rigdowndate: "2026-10-06" });
const N = () => b("N", { rigdaydate: "2026-10-02", rigdowndate: "2026-10-03" });

function input(bookings: BookingLite[], join: Array<{ large_project_id: string; booking_id: string }>): DeriveInput {
  return {
    staffIds: ["s1"], startDate: "2026-09-28", endDate: "2026-10-10",
    staffNames: new Map([["s1", "Anna"]]),
    bookingAssignments: [], largeProjectStaff: [],
    bookings: new Map(bookings.map((x) => [x.id, x])),
    largeProjects: new Map([["lp-1", LP]]),
    largeProjectBookings: join, calendarEvents: [],
  };
}
const assignAll = (ids: string[], dates: string[]) =>
  ids.flatMap((id) => dates.map((d) => ({ staff_id: "s1", booking_id: id, team_id: "team-1", assignment_date: d })));
const summary = (evs: ReturnType<typeof deriveStaffEvents>) =>
  evs.map((e) => `${e.isLargeProject ? e.largeProjectId : e.bookingId}|${e.date}|${e.phase}`).sort();

const DATES = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05", "2026-10-06"];
const JOIN = [{ large_project_id: "lp-1", booking_id: "A" }, { large_project_id: "lp-1", booking_id: "B" }];
const legacy = (x: BookingLite) => ({ ...x, large_project_id: "lp-1" });

const cases: Array<[string, () => DeriveInput]> = [
  ["join-only", () => input([A(), B()], JOIN)],
  ["legacy-only", () => input([A(), B()].map(legacy), [])],
  ["båda källorna", () => input([A(), B()].map(legacy), JOIN)],
  ["blandat join+legacy", () => input([A(), legacy(B())], [JOIN[0]])],
];

const expected = ["lp-1|2026-10-01|rig", "lp-1|2026-10-02|rig", "lp-1|2026-10-05|rigDown", "lp-1|2026-10-06|rigDown"];

describe("global personalkalender – grupprojekt", () => {
  for (const [name, mk] of cases) {
    it(`${name}: bemanning ger EN projektpost per dag/fas, inga fristående bokningar`, () => {
      const evs = deriveStaffEvents({ ...mk(), bookingAssignments: assignAll(["A", "B"], DATES) });
      expect(summary(evs)).toEqual(expected);
      expect(evs.every((e) => e.isLargeProject && e.largeProjectId === "lp-1" && !e.bookingId)).toBe(true);
    });

    it(`${name}: projektpersonal täcker alla medlemmars olika rigg-/nedriggdatum`, () => {
      const evs = deriveStaffEvents({ ...mk(), largeProjectStaff: [{ staff_id: "s1", large_project_id: "lp-1" }] });
      expect(summary(evs)).toEqual(expected);
    });
  }

  it("inga dubbletter per personal/datum/fas/team", () => {
    const evs = deriveStaffEvents({ ...cases[2][1](), bookingAssignments: assignAll(["A", "B"], DATES) });
    const keys = evs.map((e) => `${e.staffId}|${e.date}|${e.phase}|${e.teamId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("separat normal bokning förblir separat; projektposten bär grupp-id för klick", () => {
    const base = cases[0][1]();
    base.bookings.set("N", N());
    const evs = deriveStaffEvents({ ...base, bookingAssignments: assignAll(["A", "B", "N"], DATES) });
    expect(summary(evs.filter((e) => !e.isLargeProject))).toEqual(["N|2026-10-02|rig", "N|2026-10-03|rigDown"]);
    const lp = evs.filter((e) => e.isLargeProject);
    expect(summary(lp)).toEqual(expected);
    expect(lp.find((e) => e.date === "2026-10-02")!.consolidatedBookingIds).toContain("B");
  });
});

describe("staffCalendarService-normalisering → derive", () => {
  it("legacy-only sekundärbokning med egna datum ger projektpost på alla datum, ingen fristående dubblett", () => {
    // Projektets egna datum: rigg 10-01, nedrigg 10-05. Sekundärbokning S (endast
    // bookings.large_project_id) har rigg 10-03 och nedrigg 10-08.
    const P = A();
    const S = b("S", { large_project_id: "lp-1", rigdaydate: "2026-10-03", rigdowndate: "2026-10-08" });
    const bookings = new Map<string, BookingLite>([["A", P], ["S", S]]);
    const joinRows = [{ large_project_id: "lp-1", booking_id: "A" }];
    const normalized = normalizeLargeProjectBookingRows(joinRows, bookings.values());
    expect(normalized).toEqual([
      { large_project_id: "lp-1", booking_id: "A" },
      { large_project_id: "lp-1", booking_id: "S" },
    ]);
    const evs = deriveStaffEvents({
      ...input([P, S], normalized),
      largeProjectStaff: [{ staff_id: "s1", large_project_id: "lp-1" }],
      bookingAssignments: assignAll(["S"], ["2026-10-03", "2026-10-08"]),
    });
    expect(evs.filter((e) => !e.isLargeProject)).toEqual([]);
    const noTeam = evs.filter((e) => !e.teamId);
    expect(summary(noTeam)).toEqual([
      "lp-1|2026-10-01|rig", "lp-1|2026-10-03|rig", "lp-1|2026-10-05|rigDown", "lp-1|2026-10-08|rigDown",
    ]);
    const keys = evs.map((e) => `${e.date}|${e.phase}|${e.teamId ?? ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("join vinner över motstridigt legacy-fält och ingen bokning dubbleras", () => {
    const rows = normalizeLargeProjectBookingRows(
      [{ large_project_id: "lp-1", booking_id: "A" }, { large_project_id: "lp-1", booking_id: "A" }],
      [{ id: "A", large_project_id: "lp-2" }, { id: "C", large_project_id: null }],
    );
    expect(rows).toEqual([{ large_project_id: "lp-1", booking_id: "A" }]);
  });
});
