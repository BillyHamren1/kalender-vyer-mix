import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computePackingProgress } from "@/lib/packing/progress";

/**
 * Operations Board data hook.
 * Fetches all non-archived packing projects with progress + recent worker activity.
 * Refetches every 30s in the background.
 */

export type OpsDirection = "out" | "in" | "internal";

export interface OpsWorker {
  staffId: string;
  name: string;
  lastActivityAt: string;
}

export interface OpsProject {
  id: string;
  name: string;
  status: string; // raw db status
  client: string | null;
  bookingId: string | null;
  bookingNumber: string | null;
  warehouseProjectId: string | null;
  largeProjectId: string | null;
  startDate: string | null; // packing start (rig date typically)
  endDate: string | null;
  signedAt: string | null;
  signedByName: string | null;
  direction: OpsDirection;
  totalItems: number;
  verifiedItems: number;
  percent: number;
  workers: OpsWorker[];
  lastActivityAt: string | null; // most recent scan/sign/update
  updatedAt: string;
}

const ACTIVE_STATUSES = ["pending", "planning", "in_progress", "ready", "ready_for_pickup", "packed", "delivered", "back", "returning"];
// We also pull recently signed (last 48h) to populate "Klart nyligen".

interface RawProject {
  id: string;
  name: string;
  status: string;
  client_name: string | null;
  booking_id: string | null;
  warehouse_project_id: string | null;
  large_project_id: string | null;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  signed_by: string | null;
  signed_by_staff_id: string | null;
  updated_at: string;
}

export function useWarehouseOpsBoard() {
  return useQuery<OpsProject[]>({
    queryKey: ["warehouse-ops-board"],
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
    queryFn: async () => {
      const cutoff48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();


      // 1. Fetch active or recently-signed packing_projects
      const { data: projects, error: projErr } = await supabase
        .from("packing_projects")
        .select(
          "id,name,status,client_name,booking_id,warehouse_project_id,large_project_id,start_date,end_date,signed_at,signed_by,signed_by_staff_id,updated_at"
        )
        .or(`status.in.(${ACTIVE_STATUSES.join(",")}),signed_at.gte.${cutoff48h}`)
        .order("start_date", { ascending: true, nullsFirst: false })
        .limit(500);

      if (projErr) throw projErr;
      const list = (projects || []) as RawProject[];
      if (list.length === 0) return [];

      const ids = list.map((p) => p.id);
      const bookingIds = [...new Set(list.map((p) => p.booking_id).filter(Boolean))] as string[];

      // 2. Items (for progress calc) — include booking_products.parent_product_id via relation
      const itemsRes = await supabase
        .from("packing_list_items")
        .select(
          "id,packing_id,excluded,quantity_to_pack,quantity_packed,booking_product_id,booking_products(id,parent_product_id)"
        )
        .in("packing_id", ids)
        .limit(20000);
      if (itemsRes.error) throw itemsRes.error;
      const items = (itemsRes.data || []) as any[];

      // 3. Recent allocations (workers who scanned)
      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      const itemIds = (items || []).map((i: any) => i.id);
      let allocations: any[] = [];
      if (itemIds.length > 0) {
        // chunk to keep URL short
        const chunkSize = 200;
        for (let i = 0; i < itemIds.length; i += chunkSize) {
          const slice = itemIds.slice(i, i + chunkSize);
          const { data: allocs, error: allocErr } = await supabase
            .from("packing_list_item_allocations")
            .select("packing_list_item_id,scanned_by_staff_id,scanned_by,created_at")
            .in("packing_list_item_id", slice)
            .gte("created_at", since)
            .limit(5000);
          if (allocErr) throw allocErr;
          allocations = allocations.concat(allocs || []);
        }
      }

      // 4. Staff names
      const staffIds = new Set<string>();
      list.forEach((p) => p.signed_by_staff_id && staffIds.add(p.signed_by_staff_id));
      allocations.forEach((a) => a.scanned_by_staff_id && staffIds.add(a.scanned_by_staff_id));
      let staffMap = new Map<string, string>();
      if (staffIds.size > 0) {
        const { data: staff } = await supabase
          .from("staff_members")
          .select("id,name")
          .in("id", [...staffIds]);
        staffMap = new Map((staff || []).map((s: any) => [s.id, s.name]));
      }

      // 5. Bookings (for client + direction hints)
      let bookingMap = new Map<string, any>();
      if (bookingIds.length > 0) {
        const { data: bks } = await supabase
          .from("bookings")
          .select("id,client,booking_number,rigdaydate,rigdowndate")
          .in("id", bookingIds);
        bookingMap = new Map((bks || []).map((b: any) => [b.id, b]));
      }


      // 6. Group items per project & build workers per project
      const itemsByProject = new Map<string, any[]>();
      for (const it of items) {
        const arr = itemsByProject.get(it.packing_id as string) || [];
        arr.push(it);
        itemsByProject.set(it.packing_id as string, arr);
      }
      const itemToProject = new Map<string, string>();
      for (const it of items) itemToProject.set(it.id as string, it.packing_id as string);

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

      // 7. Build OpsProject entries
      const result: OpsProject[] = list.map((p) => {
        const projItems = itemsByProject.get(p.id) || [];
        const progressInput = projItems.map((it: any) => ({
          id: it.id,
          excluded: it.excluded,
          quantity_to_pack: Number(it.quantity_to_pack) || 0,
          quantity_packed: it.quantity_packed,
          booking_products: it.booking_products
            ? {
                id: it.booking_products.id,
                parent_product_id: it.booking_products.parent_product_id,
              }
            : null,
        }));
        const progress = computePackingProgress(progressInput);

        const workersMap = workersByProject.get(p.id) || new Map();
        const workers = [...workersMap.values()].sort((a, b) =>
          a.lastActivityAt > b.lastActivityAt ? -1 : 1
        );

        const lastWorkerActivity = workers[0]?.lastActivityAt || null;
        const lastActivityAt =
          [lastWorkerActivity, p.signed_at, p.updated_at]
            .filter(Boolean)
            .sort()
            .reverse()[0] || p.updated_at;

        const booking = p.booking_id ? bookingMap.get(p.booking_id) : null;
        // Härled riktning från packing-status (event_type finns inte på bookings)
        const isReturnPhase =
          p.status === "back" ||
          p.status === "returning" ||
          p.status === "returned" ||
          p.status === "delivered";
        let direction: OpsDirection = "out";
        if (isReturnPhase) direction = "in";
        if (!p.booking_id && p.warehouse_project_id) direction = "internal";


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
          startDate: p.start_date || booking?.rigdaydate || null,
          endDate: p.end_date || booking?.rigdowndate || null,
          signedAt: p.signed_at,
          signedByName,
          direction,
          totalItems: progress.total,
          verifiedItems: progress.verified,
          percent: progress.percentage,
          workers,
          lastActivityAt,
          updatedAt: p.updated_at,
        };
      });

      return result;
    },
  });
}
