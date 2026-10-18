import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computePackingProgress } from "@/lib/packing/progress";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { OPS_ACTIVE_NOW_STATUSES, isOpsWindowCandidate, readAllPages, readInChunks } from "@/lib/warehouse/opsRangeWindow";
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
  /** Unik rad-id: `${packingId}` för UT/intern, `${packingId}::in` för retur. */
  id: string;
  /** Alltid det riktiga packing_projects.id (för navigering/bemanning). */
  packingId: string;
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
  /** Planerad/tilldelad lagerpersonal för jobbets dagar i valt intervall. */
  assignedStaff: OpsAssignedStaff[];
  /** Personer som faktiskt har scannat på packningen nyligen. */
  workers: OpsWorker[];
  lastActivityAt: string | null;
  /** Senaste VERKLIGA scan (allokering). Null = ingen har scannat. */
  lastScanAt: string | null;
  updatedAt: string;
}

export interface OpsWorker {
  staffId: string;
  name: string;
  lastActivityAt: string;
}

export interface OpsAssignedStaff {
  staffId: string;
  name: string;
  assignmentDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
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
  const { organizationId, userId } = useCurrentOrg();
  // Realtime-signal (debouncad) invaliderar bara denna organisations nycklar.
  // Ingen polling: cachen återanvänds vid återbesök och fokus.
  useRealtimeInvalidation({
    channelName: `warehouse-ops-range-${organizationId || "none"}`,
    tables: [
      { table: "packing_projects", events: ["*"] },
      { table: "warehouse_assignments", events: ["*"] },
      { table: "packing_list_item_allocations", events: ["INSERT", "DELETE"] },
    ],
    queryKeys: [["warehouse-ops-range", organizationId || "none"]],
    debounceMs: 2000,
    pause: () => typeof document !== "undefined" && document.visibilityState === "hidden",
  });
  return useQuery<OpsRangeData>({
    queryKey: ["warehouse-ops-range", organizationId || "none", userId || "none", format(anchorDate, "yyyy-MM-dd"), mode],
    enabled: !!organizationId && !!userId,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    retry: 1,
    queryFn: () => fetchOpsRange(organizationId!, anchorDate, mode),
  });
}

/**
 * Läser översiktens jobb för ett intervall. Med onlyPackingIds läses bara de
 * packningarna (delta-merge från ändringsflödet), annars hela fönstret.
 */
export async function fetchOpsRange(
  orgId: string,
  anchorDate: Date,
  mode: OpsMode,
  onlyPackingIds?: string[],
): Promise<OpsRangeData> {
      const { start, end } = getRange(anchorDate, mode);
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const startDay = format(start, "yyyy-MM-dd");
      const endDay = format(end, "yyyy-MM-dd");
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const cutoff = todayStr < startDay ? todayStr : startDay;
      const PROJ_COLS =
        "id,name,status,client_name,booking_id,warehouse_project_id,large_project_id,start_date,end_date,signed_at,signed_by,signed_by_staff_id,updated_at";

      // 1. Kandidater, begränsade till valt/aktivt/kommande: bokningar vars rigg/riv
      //    ligger på eller efter fönstrets start, interna uppgifter efter samma gräns,
      //    samt pågående jobb. Gammal historik och inaktuella öppna jobb läses aldrig.
      let allCandidates: any[];
      if (onlyPackingIds) {
        allCandidates = await readInChunks(onlyPackingIds, (chunk) => readAllPages<any>((f, t) =>
          supabase.from("packing_projects").select(PROJ_COLS)
            .eq("organization_id", orgId).in("id", chunk).order("id").range(f, t)));
      } else {
        const [relevantBookings, internal, activeNow] = await Promise.all([
          readAllPages<any>((f, t) =>
            supabase.from("bookings").select("id").eq("organization_id", orgId)
              .or(`rigdowndate.gte.${cutoff},rigdaydate.gte.${cutoff}`).order("id").range(f, t)),
          readAllPages<any>((f, t) =>
            supabase.from("packing_projects").select(PROJ_COLS).eq("organization_id", orgId)
              .is("booking_id", null).or(`end_date.gte.${cutoff},start_date.gte.${cutoff}`)
              .order("id").range(f, t)),
          readAllPages<any>((f, t) =>
            supabase.from("packing_projects").select(PROJ_COLS).eq("organization_id", orgId)
              .in("status", [...OPS_ACTIVE_NOW_STATUSES]).order("id").range(f, t)),
        ]);
        const booked = await readInChunks(relevantBookings.map((b) => b.id), (chunk) =>
          readAllPages<any>((f, t) =>
            supabase.from("packing_projects").select(PROJ_COLS).eq("organization_id", orgId)
              .in("booking_id", chunk).order("id").range(f, t)));
        allCandidates = [...new Map([...booked, ...internal, ...activeNow].map((p) => [p.id, p])).values()];
      }

      const bookingIds = [...new Set(allCandidates.map((p) => p.booking_id).filter(Boolean))] as string[];
      const bks = await readInChunks(bookingIds, async (chunk) => {
        const { data, error } = await supabase.from("bookings")
          .select("id,client,booking_number,rigdaydate,rigdowndate,rig_start_time,rigdown_start_time")
          .in("id", chunk);
        if (error) throw error;
        return data || [];
      });
      const bookingMap = new Map<string, any>(bks.map((b: any) => [b.id, b]));

      // Datumfilter FÖRE tunga läsningar av rader/scans.
      const list = allCandidates.filter((p) => {
        const b = p.booking_id ? bookingMap.get(p.booking_id) : null;
        return isOpsWindowCandidate({ ...p, rigdaydate: b?.rigdaydate, rigdowndate: b?.rigdowndate }, startDay, endDay, todayStr);
      });
      const ids = list.map((p) => p.id);
      const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      // 2–4. Rader, scans och planerad personal parallellt, utan radtak.
      const [items, plannedAssignments, lagerBookings] = await Promise.all([
        readInChunks(ids, (chunk) => readAllPages<any>((f, t) =>
          supabase.from("packing_list_items")
            .select("id,packing_id,excluded,is_packable,quantity_to_pack,quantity_packed,booking_product_id,booking_products(id,parent_product_id)")
            .in("packing_id", chunk).order("id").range(f, t))),
        readInChunks(ids, (chunk) => readAllPages<any>((f, t) =>
          supabase.from("warehouse_assignments")
            .select("id,packing_id,staff_id,assignment_date,start_time,end_time,status")
            .in("packing_id", chunk).gte("assignment_date", startDay).lte("assignment_date", endDay)
            .neq("status", "cancelled").order("id").range(f, t))).catch((err) => {
          console.warn("[warehouse-ops-range] could not load warehouse_assignments", err);
          return [] as any[];
        }),
        readAllPages<any>((f, t) =>
          supabase.from("bookings").select("id").eq("organization_id", orgId).eq("is_internal", true).order("id").range(f, t)),
      ]);
      const itemToProject = new Map<string, string>();
      for (const it of items) itemToProject.set(it.id, it.packing_id);

      const lagerBookingIds = lagerBookings.map((b: any) => b.id);
      const [allocations, shiftRows] = await Promise.all([
        readInChunks(items.map((i) => i.id), (chunk) => readAllPages<any>((f, t) =>
          supabase.from("packing_list_item_allocations")
            .select("id,packing_list_item_id,scanned_by_staff_id,scanned_by,created_at")
            .in("packing_list_item_id", chunk).gte("created_at", since7d).order("id").range(f, t))),
        readInChunks(lagerBookingIds, (chunk) => readAllPages<any>((f, t) =>
          supabase.from("time_reports")
            .select("id,staff_id,booking_id,report_date,start_time,end_time,hours_worked")
            .in("booking_id", chunk).gte("report_date", startDay).lte("report_date", endDay)
            .order("id").range(f, t))),
      ]);

      // 5. Staff-namn
      const staffIds = new Set<string>();
      list.forEach((p) => p.signed_by_staff_id && staffIds.add(p.signed_by_staff_id));
      allocations.forEach((a) => a.scanned_by_staff_id && staffIds.add(a.scanned_by_staff_id));
      plannedAssignments.forEach((a) => a.staff_id && staffIds.add(a.staff_id));
      shiftRows.forEach((r) => r.staff_id && staffIds.add(r.staff_id));
      const staff = await readInChunks([...staffIds], async (chunk) => {
        const { data, error } = await supabase.from("staff_members").select("id,name").in("id", chunk);
        if (error) throw error;
        return data || [];
      });
      const staffMap = new Map<string, string>(staff.map((s: any) => [s.id, s.name]));

      // 7. Bygg OpsJob[]
      const itemsByProject = new Map<string, any[]>();
      for (const it of items) {
        const arr = itemsByProject.get(it.packing_id) || [];
        arr.push(it);
        itemsByProject.set(it.packing_id, arr);
      }

      const assignedStaffByProject = new Map<string, OpsAssignedStaff[]>();
      for (const a of plannedAssignments) {
        if (!a.packing_id || !a.staff_id || !a.assignment_date) continue;
        const arr = assignedStaffByProject.get(a.packing_id) || [];
        arr.push({
          staffId: a.staff_id,
          name: staffMap.get(a.staff_id) || "Okänd",
          assignmentDate: a.assignment_date,
          startTime: a.start_time || null,
          endTime: a.end_time || null,
          status: a.status || "planned",
        });
        assignedStaffByProject.set(a.packing_id, arr);
      }
      for (const arr of assignedStaffByProject.values()) {
        arr.sort((a, b) => {
          const ad = `${a.assignmentDate} ${a.startTime || ""}`;
          const bd = `${b.assignmentDate} ${b.startTime || ""}`;
          return ad.localeCompare(bd) || a.name.localeCompare(b.name, "sv");
        });
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

      const OUT_DONE = new Set(["completed_in", "completed", "done", "returned"]);
      const IN_DONE = new Set(["completed", "done"]);

      const jobs: OpsJob[] = list.flatMap((p) => {
        const projItems = itemsByProject.get(p.id) || [];
        const progress = computePackingProgress(
          projItems.map((it: any) => ({
            id: it.id,
            is_packable: it.is_packable,
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
        const signedByName =
          (p.signed_by_staff_id && staffMap.get(p.signed_by_staff_id)) || p.signed_by || null;

        const outAnchor = booking?.rigdaydate || p.start_date || null;
        const inAnchor = booking?.rigdowndate || p.end_date || null;
        const allAssignments = assignedStaffByProject.get(p.id) || [];

        const base = {
          packingId: p.id,
          name: p.name,
          status: p.status,
          client: p.client_name || booking?.client || null,
          bookingId: p.booking_id,
          bookingNumber: booking?.booking_number || null,
          warehouseProjectId: p.warehouse_project_id,
          largeProjectId: p.large_project_id,
          startDate: p.start_date || booking?.rigdaydate || null,
          endDate: p.end_date || booking?.rigdowndate || null,
          signedAt: p.signed_at,
          signedByName,
          totalItems: progress.total,
          verifiedItems: progress.verified,
          percent: progress.percentage,
          workers,
          lastActivityAt,
          lastScanAt: lastWorkerActivity,
          updatedAt: p.updated_at,
        };

        // Interna lageruppgifter (utan bokning) har varken UT eller IN — en rad.
        if (!p.booking_id && p.warehouse_project_id) {
          return [
            {
              ...base,
              id: p.id,
              direction: "internal" as OpsDirection,
              anchorDate: outAnchor,
              anchorTime: booking?.rig_start_time || null,
              assignedStaff: allAssignments,
            },
          ];
        }

        const rows: OpsJob[] = [];

        // UT — packning/utlastning fram till dess att retur tagit över.
        if (!OUT_DONE.has(p.status)) {
          rows.push({
            ...base,
            id: p.id,
            direction: "out",
            anchorDate: outAnchor,
            anchorTime: booking?.rig_start_time || null,
            assignedStaff: allAssignments.filter(
              (a) => !inAnchor || a.assignmentDate !== inAnchor || outAnchor === inAnchor,
            ),
          });
        }

        // IN — retur. Egen rad så snart det finns ett rivdatum, även innan leverans.
        if (inAnchor && !IN_DONE.has(p.status)) {
          rows.push({
            ...base,
            id: `${p.id}::in`,
            direction: "in",
            anchorDate: inAnchor,
            anchorTime: booking?.rigdown_start_time || null,
            assignedStaff: allAssignments.filter((a) => a.assignmentDate === inAnchor),
          });
        }

        // Fallback: aldrig tappa en packning helt ur vyn.
        if (rows.length === 0) {
          rows.push({
            ...base,
            id: p.id,
            direction: "out",
            anchorDate: outAnchor,
            anchorTime: booking?.rig_start_time || null,
            assignedStaff: allAssignments,
          });
        }

        return rows;
      });


      // 8. Filtrera jobb till intervallet (eller alltid med om aktiva eller kommande)
      const inRange = (d: string | null) => !!d && d >= startDay && d <= endDay;
      const isCurrentlyActive = (j: OpsJob) =>
        j.status === "in_progress" || j.status === "returning" || j.status === "back";
      const DONE = new Set(["completed_out", "completed_in", "completed", "done"]);
      // En packning räknas som "kommande" så länge den inte är klar och rigdown (eller anchor) ligger idag/framåt
      const isUpcoming = (j: OpsJob) => {
        if (DONE.has(j.status)) return false;
        const last = j.endDate || j.anchorDate;
        return !!last && last >= todayStr;
      };
      // Redan nedriggade jobb (sista datum har passerat) ska aldrig ligga kvar i översikten,
      // oavsett status — de hör hemma i historiken, inte i dag-för-dag-vyn.
      const isRiggedDown = (j: OpsJob) => {
        const last = j.endDate || j.anchorDate;
        if (!last) return false;
        return last < todayStr && last < startDay;
      };
      const filteredJobs = jobs.filter(
        (j) =>
          !isRiggedDown(j) &&
          (inRange(j.anchorDate) || isCurrentlyActive(j) || isUpcoming(j)),
      );


      // 9. Scan-events i intervallet
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

      // 10. Shifts
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

      // 11. Attention
      const attention = computeAttention(filteredJobs, scans, shifts, anchorDate);

      // 12. Summary
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
}

export function computeAttention(
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
    // Endast verkliga scans får presenteras som scan-tid (updated_at != scan).
    const lastScan = j.lastScanAt ? parseISO(j.lastScanAt) : null;
    const minsSince = lastScan ? differenceInMinutes(now, lastScan) : Infinity;
    const isOverdue = j.anchorDate < todayStr;
    out.push({
      id: `late-${j.id}`,
      level: isOverdue ? "critical" : "warning",
      title: `${j.bookingNumber || j.name} — UT ${isOverdue ? "försenad" : "idag"}`,
      detail: `${j.percent}% packat${
        minsSince < Infinity ? ` · senast scan ${minutesAgo(minsSince)}` : " · ingen har scannat än"
      }`,
      jobId: j.packingId,
    });
  }

  // 2. IN ej påbörjad — back-status > 4h
  for (const j of jobs) {
    if (j.direction !== "in") continue;
    if (j.status !== "back") continue;
    out.push({
      id: `back-${j.id}`,
      level: "warning",
      title: `${j.bookingNumber || j.name} — Tillbaka, ej påbörjad`,
      detail: `Retur väntar — 0% incheckat`,
      jobId: j.packingId,
    });
  }

  // 3. Stillastående — in_progress med scans men inget de senaste 2h
  for (const j of jobs) {
    if (j.direction === "in" && j.status === "in_progress") continue;
    if (j.status !== "in_progress" && j.status !== "returning") continue;
    if (!j.lastScanAt) continue;
    const mins = differenceInMinutes(now, parseISO(j.lastScanAt));
    if (mins >= 120 && mins < 60 * 24) {
      out.push({
        id: `idle-${j.id}`,
        level: "info",
        title: `${j.bookingNumber || j.name} — paus`,
        detail: `Inget scannat på ${minutesAgo(mins)} (${j.percent}%)`,
        jobId: j.packingId,
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
