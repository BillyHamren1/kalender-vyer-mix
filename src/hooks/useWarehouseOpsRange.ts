import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computePackingProgress } from "@/lib/packing/progress";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  format,
  parseISO,
  differenceInMinutes,
} from "date-fns";

/**
 * Operations Board v2 — datumstyrd kontrollvy.
 *
 * Returnerar allt sidan behöver för ETT givet datumintervall:
 *   - jobs       : packningar vars rigdaydate (UT) eller rigdowndate (IN) ligger i intervallet,
 *                  plus aktiva (in_progress/returning/back) oavsett datum
 *   - shifts     : staff-skift för intervallet (lager-time_reports)
 *   - scans      : scan-aktivitet per staff för intervallet
 *   - summary    : aggregat (jobsOut, jobsIn, peopleActive, lastScanAt)
 */

export type OpsMode = "day" | "week" | "next7" | "next30";
export type OpsDirection = "out" | "in" | "internal";

export interface OpsJob {
  id: string;
  name: string;
  status: string;
  client: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  warehouseProjectId: string | null;
  largeProjectId: string | null;
  direction: OpsDirection;
  /** Beslutsdatum för intervall-matchning (rigdaydate för UT, rigdowndate för IN, eller start_date) */
  anchorDate: string | null;
  /** Tid för dagens deadline (rig_start_time eller rigdown_start_time) */
  anchorTime: string | null;
  /** Datum-intervall start/slut för veckogruppering */
  startDate: string | null;
  endDate: string | null;
  signedAt: string | null;
  signedByName: string | null;
  totalItems: number;
  verifiedItems: number;
  percent: number;
  workers: OpsWorker[];
  lastActivityAt: string | null;
  updatedAt: string;
}

export interface OpsWorker {
  staffId: string;
  name: string;
  lastActivityAt: string;
}

export interface OpsShift {
  staffId: string;
  staffName: string;
  reportDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM:SS
  endTime: string | null; // HH:MM:SS
  hoursWorked: number;
  isInternal: boolean; // true = lager-skift
}

export interface OpsScanEvent {
  staffId: string;
  staffName: string | null;
  packingId: string;
  createdAt: string;
}

export interface OpsAttention {
  id: string;
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
  jobId?: string;
  staffId?: string;
}

export interface OpsRangeData {
  mode: OpsMode;
  rangeStart: string;
  rangeEnd: string;
  jobs: OpsJob[];
  shifts: OpsShift[];
  scans: OpsScanEvent[];
  attention: OpsAttention[];
  summary: {
    jobsOut: number;
    jobsIn: number;
    peopleActive: number;
    lastScanAt: string | null;
  };
}

function getRange(anchorDate: Date, mode: OpsMode): { start: Date; end: Date } {
  if (mode === "week") {
    return {
      start: startOfWeek(anchorDate, { weekStartsOn: 1 }),
      end: endOfWeek(anchorDate, { weekStartsOn: 1 }),
    };
  }
  if (mode === "next7") {
    const start = startOfDay(anchorDate);
    const end = endOfDay(new Date(start.getTime() + 6 * 24 * 3600 * 1000));
    return { start, end };
  }
  if (mode === "next30") {
    const start = startOfDay(anchorDate);
    const end = endOfDay(new Date(start.getTime() + 29 * 24 * 3600 * 1000));
    return { start, end };
  }
  return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
}

export function useWarehouseOpsRange(anchorDate: Date, mode: OpsMode) {
  return useQuery<OpsRangeData>({
    queryKey: ["warehouse-ops-range", format(anchorDate, "yyyy-MM-dd"), mode],
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
    queryFn: async () => {

      const { start, end } = getRange(anchorDate, mode);
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const startDay = format(start, "yyyy-MM-dd");
      const endDay = format(end, "yyyy-MM-dd");

      // 1. Hämta aktiva packings + bookings för intervall-matchning
      const ACTIVE = ["planning", "in_progress", "packed", "delivered", "back", "returning"];
      const { data: projects, error: projErr } = await supabase
        .from("packing_projects")
        .select(
          "id,name,status,client_name,booking_id,warehouse_project_id,large_project_id,start_date,end_date,signed_at,signed_by,signed_by_staff_id,updated_at"
        )
        .in("status", ACTIVE)
        .limit(500);
      if (projErr) throw projErr;
      const list = (projects || []) as any[];

      const bookingIds = [...new Set(list.map((p) => p.booking_id).filter(Boolean))] as string[];
      let bookingMap = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bks } = await supabase
          .from("bookings")
          .select(
            "id,client,booking_number,rigdaydate,rigdowndate,rig_start_time,rigdown_start_time"
          )
          .in("id", bookingIds);
        bookingMap = new Map((bks || []).map((b: any) => [b.id, b]));
      }


      // 2. Items för progress
      const ids = list.map((p) => p.id);
      let items: any[] = [];
      if (ids.length > 0) {
        const itemsRes = await supabase
          .from("packing_list_items")
          .select(
            "id,packing_id,excluded,quantity_to_pack,quantity_packed,booking_product_id,booking_products(id,parent_product_id)"
          )
          .in("packing_id", ids)
          .limit(20000);
        if (itemsRes.error) throw itemsRes.error;
        items = itemsRes.data || [];
      }

      // 3. Allokeringar för workers + scan-events i intervallet (eller senaste 7 dgr för "lastActivityAt")
      const itemIds = items.map((i) => i.id);
      const itemToProject = new Map<string, string>();
      for (const it of items) itemToProject.set(it.id, it.packing_id);

      const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      let allocations: any[] = [];
      if (itemIds.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < itemIds.length; i += chunkSize) {
          const slice = itemIds.slice(i, i + chunkSize);
          const { data: allocs, error: allocErr } = await supabase
            .from("packing_list_item_allocations")
            .select("packing_list_item_id,scanned_by_staff_id,scanned_by,created_at")
            .in("packing_list_item_id", slice)
            .gte("created_at", since7d)
            .limit(5000);
          if (allocErr) throw allocErr;
          allocations = allocations.concat(allocs || []);
        }
      }

      // 4. Staff-namn (för workers + scans + shifts senare)
      const staffIds = new Set<string>();
      list.forEach((p) => p.signed_by_staff_id && staffIds.add(p.signed_by_staff_id));
      allocations.forEach((a) => a.scanned_by_staff_id && staffIds.add(a.scanned_by_staff_id));

      // 5. Shifts (time_reports) för intervallet — kopplade till internt Lager-bokningsled (is_internal)
      const { data: lagerBookings } = await supabase
        .from("bookings")
        .select("id")
        .eq("is_internal", true);
      const lagerBookingIds = (lagerBookings || []).map((b: any) => b.id);

      let shiftRows: any[] = [];
      if (lagerBookingIds.length > 0) {
        const { data: trs, error: trErr } = await supabase
          .from("time_reports")
          .select("staff_id,booking_id,report_date,start_time,end_time,hours_worked")
          .in("booking_id", lagerBookingIds)
          .gte("report_date", startDay)
          .lte("report_date", endDay)
          .limit(2000);
        if (trErr) throw trErr;
        shiftRows = trs || [];
      }
      shiftRows.forEach((r) => r.staff_id && staffIds.add(r.staff_id));

      let staffMap = new Map<string, string>();
      if (staffIds.size > 0) {
        const { data: staff } = await supabase
          .from("staff_members")
          .select("id,name")
          .in("id", [...staffIds]);
        staffMap = new Map((staff || []).map((s: any) => [s.id, s.name]));
      }

      // 6. Bygg OpsJob[]
      const itemsByProject = new Map<string, any[]>();
      for (const it of items) {
        const arr = itemsByProject.get(it.packing_id) || [];
        arr.push(it);
        itemsByProject.set(it.packing_id, arr);
      }

      const workersByProject = new Map<string, Map<string, OpsWorker>>();
      for (const a of allocations) {
        const projId = itemToProject.get(a.packing_list_item_id);
        if (!projId) continue;
        const sid = a.scanned_by_staff_id as string | null;
        const name = (sid && staffMap.get(sid)) || (a.scanned_by as string | null) || null;
        if (!name) continue;
        const key = sid || `name:${name}`;
        const map = workersByProject.get(projId) || new Map<string, OpsWorker>();
        const existing = map.get(key);
        if (!existing || existing.lastActivityAt < a.created_at) {
          map.set(key, { staffId: key, name, lastActivityAt: a.created_at });
        }
        workersByProject.set(projId, map);
      }

      const jobs: OpsJob[] = list.map((p) => {
        const projItems = itemsByProject.get(p.id) || [];
        const progress = computePackingProgress(
          projItems.map((it: any) => ({
            id: it.id,
            excluded: it.excluded,
            quantity_to_pack: Number(it.quantity_to_pack) || 0,
            quantity_packed: it.quantity_packed,
            booking_products: it.booking_products
              ? { id: it.booking_products.id, parent_product_id: it.booking_products.parent_product_id }
              : null,
          })),
        );

        const workersMap = workersByProject.get(p.id) || new Map();
        const workers = [...workersMap.values()].sort((a, b) =>
          a.lastActivityAt > b.lastActivityAt ? -1 : 1,
        );
        const lastWorkerActivity = workers[0]?.lastActivityAt || null;
        const lastActivityAt =
          [lastWorkerActivity, p.signed_at, p.updated_at].filter(Boolean).sort().reverse()[0] ||
          p.updated_at;

        const booking = p.booking_id ? bookingMap.get(p.booking_id) : null;
        const isReturnPhase =
          p.status === "back" ||
          p.status === "returning" ||
          p.status === "returned" ||
          p.status === "delivered";
        let direction: OpsDirection = "out";
        if (isReturnPhase) direction = "in";
        if (!p.booking_id && p.warehouse_project_id) direction = "internal";

        const anchorDate =
          direction === "in"
            ? booking?.rigdowndate || p.end_date || p.start_date || null
            : booking?.rigdaydate || p.start_date || null;

        const anchorTime =
          direction === "in" ? booking?.rigdown_start_time || null : booking?.rig_start_time || null;

        const signedByName =
          (p.signed_by_staff_id && staffMap.get(p.signed_by_staff_id)) || p.signed_by || null;

        return {
          id: p.id,
          name: p.name,
          status: p.status,
          client: p.client_name || booking?.client || null,
          bookingId: p.booking_id,
          bookingNumber: booking?.booking_number || null,
          warehouseProjectId: p.warehouse_project_id,
          largeProjectId: p.large_project_id,
          direction,
          anchorDate,
          anchorTime,
          startDate: p.start_date || booking?.rigdaydate || null,
          endDate: p.end_date || booking?.rigdowndate || null,
          signedAt: p.signed_at,
          signedByName,
          totalItems: progress.total,
          verifiedItems: progress.verified,
          percent: progress.percentage,
          workers,
          lastActivityAt,
          updatedAt: p.updated_at,
        };
      });

      // 7. Filtrera jobb till intervallet (eller alltid med om aktiva)
      const inRange = (d: string | null) => !!d && d >= startDay && d <= endDay;
      const isCurrentlyActive = (j: OpsJob) =>
        j.status === "in_progress" || j.status === "returning" || j.status === "back";
      const filteredJobs = jobs.filter((j) => inRange(j.anchorDate) || isCurrentlyActive(j));

      // 8. Scan-events i intervallet
      const scans: OpsScanEvent[] = allocations
        .filter((a) => a.created_at >= startISO && a.created_at <= endISO)
        .map((a) => {
          const projId = itemToProject.get(a.packing_list_item_id) || "";
          const sid = (a.scanned_by_staff_id as string | null) || "";
          return {
            staffId: sid,
            staffName: (sid && staffMap.get(sid)) || (a.scanned_by as string | null) || null,
            packingId: projId,
            createdAt: a.created_at,
          };
        })
        .filter((s) => s.staffId);

      // 9. Shifts
      const shifts: OpsShift[] = shiftRows
        .filter((r) => r.staff_id)
        .map((r) => ({
          staffId: r.staff_id,
          staffName: staffMap.get(r.staff_id) || "Okänd",
          reportDate: r.report_date,
          startTime: r.start_time,
          endTime: r.end_time,
          hoursWorked: Number(r.hours_worked) || 0,
          isInternal: true,
        }));

      // 10. Attention
      const attention = computeAttention(filteredJobs, scans, shifts, anchorDate);

      // 11. Summary
      const peopleActive = new Set([
        ...scans.map((s) => s.staffId),
        ...shifts.filter((s) => !s.endTime).map((s) => s.staffId),
      ]).size;
      const lastScanAt = scans.reduce<string | null>(
        (acc, s) => (acc && acc > s.createdAt ? acc : s.createdAt),
        null,
      );

      return {
        mode,
        rangeStart: startISO,
        rangeEnd: endISO,
        jobs: filteredJobs,
        shifts,
        scans,
        attention,
        summary: {
          jobsOut: filteredJobs.filter((j) => j.direction === "out").length,
          jobsIn: filteredJobs.filter((j) => j.direction === "in").length,
          peopleActive,
          lastScanAt,
        },
      };
    },
  });
}

function computeAttention(
  jobs: OpsJob[],
  scans: OpsScanEvent[],
  shifts: OpsShift[],
  anchorDate: Date,
): OpsAttention[] {
  const out: OpsAttention[] = [];
  const now = new Date();
  const todayStr = format(anchorDate, "yyyy-MM-dd");

  // 1. UT-deadline missad/nära & inte 100%
  for (const j of jobs) {
    if (j.direction !== "out") continue;
    if (j.percent >= 100) continue;
    if (!j.anchorDate) continue;
    if (j.anchorDate > todayStr) continue; // bara dagens eller försenat
    const lastAct = j.lastActivityAt ? parseISO(j.lastActivityAt) : null;
    const minsSince = lastAct ? differenceInMinutes(now, lastAct) : Infinity;
    const isOverdue = j.anchorDate < todayStr;
    out.push({
      id: `late-${j.id}`,
      level: isOverdue ? "critical" : "warning",
      title: `${j.bookingNumber || j.name} — UT ${isOverdue ? "försenad" : "idag"}`,
      detail: `${j.percent}% packat${
        minsSince < Infinity ? ` · senast scan ${minutesAgo(minsSince)}` : " · ingen har börjat"
      }`,
      jobId: j.id,
    });
  }

  // 2. IN ej påbörjad — back-status > 4h
  for (const j of jobs) {
    if (j.status !== "back") continue;
    out.push({
      id: `back-${j.id}`,
      level: "warning",
      title: `${j.bookingNumber || j.name} — Tillbaka, ej påbörjad`,
      detail: `Retur väntar — 0% incheckat`,
      jobId: j.id,
    });
  }

  // 3. Stillastående — in_progress med scans men inget de senaste 2h
  for (const j of jobs) {
    if (j.status !== "in_progress" && j.status !== "returning") continue;
    if (!j.lastActivityAt) continue;
    const mins = differenceInMinutes(now, parseISO(j.lastActivityAt));
    if (mins >= 120 && mins < 60 * 24) {
      out.push({
        id: `idle-${j.id}`,
        level: "info",
        title: `${j.bookingNumber || j.name} — paus`,
        detail: `Inget scannat på ${minutesAgo(mins)} (${j.percent}%)`,
        jobId: j.id,
      });
    }
  }

  // 4. Personal inaktiv — har scannat idag men inte senaste 90 min
  const byStaff = new Map<string, OpsScanEvent[]>();
  for (const s of scans) {
    const arr = byStaff.get(s.staffId) || [];
    arr.push(s);
    byStaff.set(s.staffId, arr);
  }
  for (const [staffId, evs] of byStaff) {
    const last = evs.reduce<string | null>(
      (acc, e) => (acc && acc > e.createdAt ? acc : e.createdAt),
      null,
    );
    if (!last) continue;
    const mins = differenceInMinutes(now, parseISO(last));
    const stillOnShift = shifts.some((sh) => sh.staffId === staffId && !sh.endTime);
    if (mins >= 90 && mins < 60 * 6 && stillOnShift) {
      const name = evs.find((e) => e.staffName)?.staffName || "Personal";
      out.push({
        id: `staff-idle-${staffId}`,
        level: "info",
        title: `${name} — inaktiv ${minutesAgo(mins)}`,
        detail: `Skift pågår men inga scans`,
        staffId,
      });
    }
  }

  // Sort: critical → warning → info
  const order: Record<OpsAttention["level"], number> = { critical: 0, warning: 1, info: 2 };
  out.sort((a, b) => order[a.level] - order[b.level]);
  return out.slice(0, 10);
}

function minutesAgo(mins: number): string {
  if (mins < 60) return `${Math.floor(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
