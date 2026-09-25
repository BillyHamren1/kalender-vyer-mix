import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake av Supabase-klienten (endast det servicen använder).
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let failBookingUpdate = false;
let idSeq = 0;

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: any = null;
  let orderKey: string | null = null;
  let orderAsc = true;
  let limitN: number | null = null;
  const rows = () => (db[table] ||= []);
  const matched = () => rows().filter((r) => filters.every((f) => f(r)));
  const exec = (): { data: any; error: any } => {
    if (op === "insert") {
      const r = { id: `${table}-${++idSeq}`, created_at: new Date().toISOString(), ...payload };
      rows().push(r);
      return { data: [r], error: null };
    }
    if (op === "update") {
      if (table === "bookings" && failBookingUpdate) return { data: null, error: { message: "rls denied" } };
      const m = matched();
      m.forEach((r) => Object.assign(r, payload));
      return { data: m, error: null };
    }
    if (op === "delete") {
      const m = matched();
      db[table] = rows().filter((r) => !m.includes(r));
      return { data: m, error: null };
    }
    let m = matched();
    if (orderKey) m = [...m].sort((a, b) => ((a[orderKey!] ?? 0) - (b[orderKey!] ?? 0)) * (orderAsc ? 1 : -1));
    if (limitN != null) m = m.slice(0, limitN);
    if (table === "large_projects") m = m.map((r) => ({ ...r, large_project_bookings: (db.large_project_bookings || []).filter((j) => j.large_project_id === r.id) }));
    return { data: m, error: null };
  };
  const chain: any = {
    select: () => chain,
    insert: (p: any) => ((op = "insert"), (payload = p), chain),
    update: (p: any) => ((op = "update"), (payload = p), chain),
    delete: () => ((op = "delete"), chain),
    eq: (k: string, v: any) => (filters.push((r) => r[k] === v), chain),
    in: (k: string, vs: any[]) => (filters.push((r) => vs.includes(r[k])), chain),
    is: (k: string, v: any) => (filters.push((r) => (r[k] ?? null) === v), chain),
    order: (k: string, o?: { ascending?: boolean }) => ((orderKey = k), (orderAsc = o?.ascending !== false), chain),
    limit: (n: number) => ((limitN = n), chain),
    maybeSingle: () => { const r = exec(); return Promise.resolve({ data: r.error ? null : r.data?.[0] ?? null, error: r.error }); },
    single: () => { const r = exec(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error ?? (r.data?.length ? null : { code: "PGRST116" }) }); },
    then: (res: any, rej: any) => Promise.resolve(exec()).then(res, rej),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t) } }));
vi.mock("@/services/bookingAssignmentService", () => ({ recomputeBookingAssignment: vi.fn() }));

import {
  addBookingToLargeProject,
  createLargeProjectFromBooking,
  removeBookingFromLargeProject,
  fetchLargeProjectCore,
  LargeProjectMembershipConflictError,
} from "@/services/largeProjectService";
import { loadLargeProjectMemberIds, mergeLargeProjectMembers, resolvePrimaryBookingId } from "@/lib/largeProject/largeProjectMembers";

const booking = (id: string, nr: string, extra: Row = {}) => ({ id, booking_number: nr, client: `Kund ${nr}`, status: "CONFIRMED", large_project_id: null, ...extra });

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k];
  failBookingUpdate = false;
  db.bookings = [booking("b-1", "2609-1"), booking("b-2", "2609-2"), booking("b-3", "2609-3")];
  db.large_projects = [];
  db.large_project_bookings = [];
});

describe("grupprojekt – medlemskap", () => {
  it("skapar projekt från grundbokning, bokningen blir grundbokning och behåller nummer", async () => {
    const { project } = await createLargeProjectFromBooking("b-1", { name: "Mässa" });
    const core = await fetchLargeProjectCore(project.id);
    expect(core!.bookings.map((b) => b.booking_id)).toEqual(["b-1"]);
    expect(core!.bookings[0].is_primary).toBe(true);
    expect(db.bookings.find((b) => b.id === "b-1")).toMatchObject({ booking_number: "2609-1", large_project_id: project.id });
  });

  it("länkar till befintligt projekt utan att byta grundbokning", async () => {
    const { project } = await createLargeProjectFromBooking("b-1", { name: "Mässa" });
    await addBookingToLargeProject(project.id, "b-2");
    const core = await fetchLargeProjectCore(project.id);
    expect(core!.bookings.find((b) => b.is_primary)!.booking_id).toBe("b-1");
    expect(core!.bookings).toHaveLength(2);
  });

  it("är idempotent – dubbel koppling ger ingen dublett", async () => {
    const { project } = await createLargeProjectFromBooking("b-1", { name: "Mässa" });
    await addBookingToLargeProject(project.id, "b-2");
    await addBookingToLargeProject(project.id, "b-2");
    expect(db.large_project_bookings.filter((r) => r.booking_id === "b-2")).toHaveLength(1);
  });

  it("konflikt om bokningen redan ligger i annat aktivt projekt", async () => {
    const { project: a } = await createLargeProjectFromBooking("b-1", { name: "A" });
    const { project: b } = await createLargeProjectFromBooking("b-2", { name: "B" });
    await expect(addBookingToLargeProject(b.id, "b-1")).rejects.toBeInstanceOf(LargeProjectMembershipConflictError);
    await expect(createLargeProjectFromBooking("b-1", { name: "C" })).rejects.toBeInstanceOf(LargeProjectMembershipConflictError);
    expect(db.bookings.find((x) => x.id === "b-1")!.large_project_id).toBe(a.id);
  });

  it("misslyckad legacy-skrivning lämnar ingen halv koppling", async () => {
    db.large_projects.push({ id: "lp-x", name: "X", status: "planning", deleted_at: null });
    failBookingUpdate = true;
    await expect(addBookingToLargeProject("lp-x", "b-3")).rejects.toThrow(/Kunde inte koppla/);
    expect(db.large_project_bookings).toHaveLength(0);
  });

  it("join-only och legacy-only medlemmar syns, utan dubbletter", async () => {
    db.large_projects.push({ id: "lp-1", name: "Mix", status: "planning", deleted_at: null });
    db.large_project_bookings.push({ id: "j1", large_project_id: "lp-1", booking_id: "b-1", sort_order: 1 });
    db.large_project_bookings.push({ id: "j2", large_project_id: "lp-1", booking_id: "b-2", sort_order: 2 });
    db.bookings.find((b) => b.id === "b-2")!.large_project_id = "lp-1"; // båda källorna
    db.bookings.find((b) => b.id === "b-3")!.large_project_id = "lp-1"; // legacy-only
    expect(await loadLargeProjectMemberIds("lp-1")).toEqual(["b-1", "b-2", "b-3"]);
    const core = await fetchLargeProjectCore("lp-1");
    expect(core!.bookings.map((b) => b.booking_id)).toEqual(["b-1", "b-2", "b-3"]);
  });

  it("borttagning av länk raderar aldrig bokningen", async () => {
    const { project } = await createLargeProjectFromBooking("b-1", { name: "Mässa" });
    await addBookingToLargeProject(project.id, "b-2");
    await removeBookingFromLargeProject(project.id, "b-2");
    const b2 = db.bookings.find((b) => b.id === "b-2");
    expect(b2).toMatchObject({ id: "b-2", booking_number: "2609-2", status: "CONFIRMED", large_project_id: null });
    expect(await loadLargeProjectMemberIds(project.id)).toEqual(["b-1"]);
  });

  it("ren merge och grundbokning", () => {
    const m = mergeLargeProjectMembers("lp", [{ booking_id: "x", sort_order: 2 }, { booking_id: "y", sort_order: 1 }], ["x", "z"]);
    expect(m.map((r) => r.booking_id)).toEqual(["y", "x", "z"]);
    expect(resolvePrimaryBookingId(m, "x")).toBe("x");
    expect(resolvePrimaryBookingId(m, "saknas")).toBe("y");
  });
});

import { fetchLargeProjects } from "@/services/largeProjectService";
import { resolveLargeProjectMembershipFromRows } from "@/lib/largeProject/resolveLargeProjectMembership";

describe("grupprojekt – projektlista, sök och kalender", () => {
  it("projektlistan ger EN post med alla medlemmars bokningsnummer/kund för sök", async () => {
    db.large_projects.push({ id: "lp-1", name: "Mix", status: "planning", deleted_at: null, created_at: "" });
    db.large_project_bookings.push({ id: "j1", large_project_id: "lp-1", booking_id: "b-1", sort_order: 1, bookings: db.bookings[0] });
    db.bookings.find((b) => b.id === "b-3")!.large_project_id = "lp-1"; // legacy-only
    const list = await fetchLargeProjects();
    expect(list).toHaveLength(1);
    const tokens = list[0].bookings.map((b: any) => (b.booking || b.bookings)?.booking_number);
    expect(tokens).toEqual(["2609-1", "2609-3"]);
    expect(list[0].bookingCount).toBe(2);
    // Bokningsnumren är oförändrade → gamla bokningssidan /booking/:id fungerar som förut.
    expect(db.bookings.map((b) => b.booking_number)).toEqual(["2609-1", "2609-2", "2609-3"]);
  });

  it("kalenderns medlemsupplösning hittar join-only, legacy-only och båda utan dubblett", () => {
    const m = resolveLargeProjectMembershipFromRows(
      ["b-1", "b-2", "b-3"],
      [{ large_project_id: "lp-1", booking_id: "b-1" }, { large_project_id: "lp-1", booking_id: "b-2" }],
      new Map([["b-2", { id: "b-2", large_project_id: "lp-1" }], ["b-3", { id: "b-3", large_project_id: "lp-1" }]]),
    );
    expect([...m.entries()]).toEqual([["b-1", "lp-1"], ["b-2", "lp-1"], ["b-3", "lp-1"]]);
  });
});
