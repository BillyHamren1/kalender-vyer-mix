import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake av Supabase-klienten (endast det servicen använder).
type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let failBookingUpdate = false;
let rpcMode: "missing" | "ok" | "error" = "missing";
const rpcCalls: Array<{ fn: string; args: any }> = [];
function fakeRpc(fn: string, args: any) {
  rpcCalls.push({ fn, args });
  if (rpcMode === "missing") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
  if (rpcMode === "error") return Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } });
  // "ok": simulera RPC:ns atomiska beteende i minnet.
  // Explicit tenant-kontroll (speglar ORGANIZATION_MISMATCH i SQL): avvisa
  // cross-org-koppling innan någon skrivning.
  const bk = db.bookings.find((b) => b.id === args.p_booking_id);
  const lp0 = db.large_projects.find((p) => p.id === args.p_large_project_id);
  if (bk?.organization_id != null && lp0?.organization_id != null && bk.organization_id !== lp0.organization_id) {
    return Promise.resolve({ data: null, error: { code: "P0001", message: "ORGANIZATION_MISMATCH" } });
  }
  const active = (db.large_project_bookings || []).find((r) => r.booking_id === args.p_booking_id && r.large_project_id !== args.p_large_project_id
    && db.large_projects.some((p) => p.id === r.large_project_id && !p.deleted_at));
  if (active) return Promise.resolve({ data: null, error: { code: "23505", message: `BOOKING_IN_OTHER_PROJECT:${active.large_project_id}` } });
  let link = db.large_project_bookings.find((r) => r.booking_id === args.p_booking_id && r.large_project_id === args.p_large_project_id);
  if (!link) { link = { id: `rpc-${++idSeq}`, large_project_id: args.p_large_project_id, booking_id: args.p_booking_id, sort_order: 1 }; db.large_project_bookings.push(link); }
  db.bookings.find((b) => b.id === args.p_booking_id)!.large_project_id = args.p_large_project_id;
  const lp = db.large_projects.find((p) => p.id === args.p_large_project_id)!;
  if (args.p_make_primary && !lp.primary_booking_id) lp.primary_booking_id = args.p_booking_id;
  return Promise.resolve({ data: link.id, error: null });
}
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

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t), rpc: (f: string, a: any) => fakeRpc(f, a) } }));
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
  rpcMode = "missing";
  rpcCalls.length = 0;
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

import { deleteLargeProject, restoreLargeProject } from "@/services/largeProjectService";
import { readFileSync } from "node:fs";

describe("grupprojekt – soft-delete/restore", () => {
  it("bokning kan återanvändas efter soft-delete; restore stoppas vid konflikt", async () => {
    const { project: a } = await createLargeProjectFromBooking("b-1", { name: "A" });
    await deleteLargeProject(a.id);
    // Medlemsraden finns kvar (för restore), men blockerar inte ny koppling.
    expect(db.large_project_bookings.some((r) => r.large_project_id === a.id && r.booking_id === "b-1")).toBe(true);
    db.bookings.find((b) => b.id === "b-1")!.large_project_id = null; // som recomputeBookingAssignment gör
    const { project: b } = await createLargeProjectFromBooking("b-1", { name: "B" });
    await expect(restoreLargeProject(a.id)).rejects.toBeInstanceOf(LargeProjectMembershipConflictError);
    expect(db.large_projects.find((p) => p.id === a.id)!.deleted_at).not.toBeNull();
    await removeBookingFromLargeProject(b.id, "b-1");
    await restoreLargeProject(a.id);
    expect(db.large_projects.find((p) => p.id === a.id)!.deleted_at).toBeNull();
  });

  it("väntande SQL: ingen ovillkorlig unik index, rätt typer, aktiv-kontroll mot deleted_at", () => {
    const sql = readFileSync(".lovable/pending-migrations/large-project-primary-booking.sql", "utf8");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/UNIQUE\s+INDEX[^;]*\(\s*booking_id\s*\)/i);
    expect(code).toMatch(/primary_booking_id text\s+REFERENCES public\.bookings\(id\)/);
    expect(code).toMatch(/p_large_project_id uuid/);
    expect(code).toMatch(/p_booking_id text/);
    expect(code).toMatch(/deleted_at IS NULL/);
    expect(code).toMatch(/FOR UPDATE/);
    expect(code).toMatch(/SECURITY INVOKER/);
    // Tenant-säkerhet: bokningens organization_id hämtas i samma låsande SELECT
    // och jämförs explicit mot projektets innan någon insert/update.
    expect(code).toMatch(/SELECT organization_id INTO v_booking_org FROM public\.bookings\s+WHERE id = p_booking_id FOR UPDATE/);
    expect(code).toMatch(/IF v_booking_org IS DISTINCT FROM v_org THEN\s+RAISE EXCEPTION 'ORGANIZATION_MISMATCH'/);
    const mismatchIdx = code.indexOf("ORGANIZATION_MISMATCH");
    const insertIdx = code.indexOf("INSERT INTO public.large_project_bookings");
    const updateIdx = code.indexOf("UPDATE public.bookings");
    expect(mismatchIdx).toBeGreaterThan(-1);
    expect(mismatchIdx).toBeLessThan(insertIdx);
    expect(mismatchIdx).toBeLessThan(updateIdx);
  });
});

describe("grupprojekt – atomisk RPC", () => {
  it("service anropar RPC med p_make_primary=true vid skapande och sätter primary_booking_id", async () => {
    rpcMode = "ok";
    const { project } = await createLargeProjectFromBooking("b-1", { name: "RPC" });
    expect(rpcCalls).toEqual([{ fn: "link_booking_to_large_project", args: { p_large_project_id: project.id, p_booking_id: "b-1", p_make_primary: true } }]);
    expect(db.large_projects.find((p) => p.id === project.id)!.primary_booking_id).toBe("b-1");
  });

  it("länkning till befintligt projekt anropar RPC med p_make_primary=false; grundbokning oförändrad", async () => {
    rpcMode = "ok";
    const { project } = await createLargeProjectFromBooking("b-1", { name: "RPC" });
    await addBookingToLargeProject(project.id, "b-2");
    expect(rpcCalls[1].args).toEqual({ p_large_project_id: project.id, p_booking_id: "b-2", p_make_primary: false });
    expect(db.large_projects.find((p) => p.id === project.id)!.primary_booking_id).toBe("b-1");
    expect(db.bookings.find((b) => b.id === "b-2")!.large_project_id).toBe(project.id);
  });

  it("fallback när RPC saknas: klientskrivningar + primary_booking_id", async () => {
    rpcMode = "missing";
    const { project } = await createLargeProjectFromBooking("b-1", { name: "Fallback" });
    expect(rpcCalls).toHaveLength(1);
    expect(db.large_project_bookings.filter((r) => r.booking_id === "b-1")).toHaveLength(1);
    expect(db.large_projects.find((p) => p.id === project.id)!.primary_booking_id).toBe("b-1");
  });

  it("RPC-fel tystas inte och ger ingen klientfallback", async () => {
    db.large_projects.push({ id: "lp-e", name: "E", status: "planning", deleted_at: null });
    rpcMode = "error";
    await expect(addBookingToLargeProject("lp-e", "b-3")).rejects.toThrow(/permission denied/);
    expect(db.large_project_bookings).toHaveLength(0);
    expect(db.bookings.find((b) => b.id === "b-3")!.large_project_id).toBeNull();
  });

  it("RPC-konflikt mappas till konfliktfel", async () => {
    db.large_projects.push({ id: "lp-a", name: "A", status: "planning", deleted_at: null }, { id: "lp-b", name: "B", status: "planning", deleted_at: null });
    db.large_project_bookings.push({ id: "x", large_project_id: "lp-a", booking_id: "b-3", sort_order: 1 });
    rpcMode = "ok";
    // Klientens förkontroll fångar redan konflikten; RPC:n är andra försvarslinjen.
    await expect(addBookingToLargeProject("lp-b", "b-3")).rejects.toBeInstanceOf(LargeProjectMembershipConflictError);
  });
});

describe("grupprojekt – restore via kanonisk loader", () => {
  it("legacy-only medlem som under soft-delete kopplats aktivt till annat projekt stoppar restore", async () => {
    db.large_projects.push({ id: "lp-old", name: "Gammal", status: "planning", deleted_at: "2026-09-01T00:00:00Z" });
    db.large_projects.push({ id: "lp-new", name: "Ny", status: "planning", deleted_at: null });
    // b-3 är legacy-only medlem i lp-old (ingen join-rad där)...
    db.bookings.find((b) => b.id === "b-3")!.large_project_id = "lp-old";
    // ...och har under soft-delete fått en aktiv join-koppling till lp-new.
    db.large_project_bookings.push({ id: "j-new", large_project_id: "lp-new", booking_id: "b-3", sort_order: 1 });
    await expect(restoreLargeProject("lp-old")).rejects.toBeInstanceOf(LargeProjectMembershipConflictError);
    expect(db.large_projects.find((p) => p.id === "lp-old")!.deleted_at).not.toBeNull();
  });
});
