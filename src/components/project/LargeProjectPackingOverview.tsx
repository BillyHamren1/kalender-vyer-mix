import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Package, ExternalLink, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PACKING_STATUS_LABELS, PACKING_STATUS_COLORS, PackingStatus } from "@/types/packing";

interface PackingSummary {
  id: string;
  booking_id: string;
  name: string;
  status: PackingStatus;
  client_name: string | null;
  booking_number: string | null;
  total_items: number;
  packed_items: number;
}

interface LargeProjectPackingOverviewProps {
  largeProjectId: string;
}

const LargeProjectPackingOverview = ({ largeProjectId }: LargeProjectPackingOverviewProps) => {
  const navigate = useNavigate();
  const [packings, setPackings] = useState<PackingSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPackings = async () => {
      setLoading(true);

      // 1. Get booking IDs for this large project
      const { data: lpBookings, error: lpErr } = await supabase
        .from("large_project_bookings")
        .select("booking_id")
        .eq("large_project_id", largeProjectId);

      if (lpErr || !lpBookings?.length) {
        setPackings([]);
        setLoading(false);
        return;
      }

      const bookingIds = lpBookings.map((b) => b.booking_id);

      // 2. Get packing projects for those bookings
      const { data: packingRows, error: ppErr } = await supabase
        .from("packing_projects")
        .select("id, booking_id, name, status")
        .in("booking_id", bookingIds);

      if (ppErr || !packingRows?.length) {
        setPackings([]);
        setLoading(false);
        return;
      }

      // 3. Get booking info
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, client, booking_number")
        .in("id", bookingIds);

      const bookingMap = new Map(
        (bookings || []).map((b) => [b.id, b])
      );

      // 4. Get item counts per packing
      const packingIds = packingRows.map((p) => p.id);
      const { data: items } = await supabase
        .from("packing_list_items")
        .select("packing_id, quantity_to_pack, quantity_packed")
        .in("packing_id", packingIds);

      const itemCounts = new Map<string, { total: number; packed: number }>();
      (items || []).forEach((item) => {
        const cur = itemCounts.get(item.packing_id) || { total: 0, packed: 0 };
        cur.total += item.quantity_to_pack;
        cur.packed += item.quantity_packed;
        itemCounts.set(item.packing_id, cur);
      });

      // 5. Build summary
      const summaries: PackingSummary[] = packingRows.map((p) => {
        const booking = bookingMap.get(p.booking_id!);
        const counts = itemCounts.get(p.id) || { total: 0, packed: 0 };
        return {
          id: p.id,
          booking_id: p.booking_id!,
          name: p.name,
          status: p.status as PackingStatus,
          client_name: booking?.client || null,
          booking_number: booking?.booking_number || null,
          total_items: counts.total,
          packed_items: counts.packed,
        };
      });

      setPackings(summaries);
      setLoading(false);
    };

    fetchPackings();
  }, [largeProjectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (packings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Package className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">Inga packlistor ännu.</p>
        <p className="text-xs mt-1">Packlistor skapas automatiskt när bokningar bekräftas.</p>
      </div>
    );
  }

  const totalAll = packings.reduce((s, p) => s + p.total_items, 0);
  const packedAll = packings.reduce((s, p) => s + p.packed_items, 0);
  const progressAll = totalAll > 0 ? Math.round((packedAll / totalAll) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Aggregated summary */}
      <div className="rounded-lg border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">Övergripande packstatus</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {packedAll} / {totalAll} artiklar
          </span>
        </div>
        <Progress value={progressAll} className="h-2.5" />
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>{packings.length} packlistor</span>
          <span>{packings.filter((p) => p.status === "packed" || p.status === "delivered" || p.status === "completed").length} klara</span>
        </div>
      </div>

      {/* Per-booking cards */}
      <div className="space-y-3">
        {packings.map((p) => {
          const progress = p.total_items > 0 ? Math.round((p.packed_items / p.total_items) * 100) : 0;
          const isDone = p.status === "packed" || p.status === "delivered" || p.status === "completed";

          return (
            <div
              key={p.id}
              className="rounded-lg border border-border/60 bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {isDone && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                  <span className="font-medium text-sm truncate">
                    {p.client_name || p.name}
                  </span>
                  {p.booking_number && (
                    <span className="text-xs text-muted-foreground">#{p.booking_number}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge className={`text-xs ${PACKING_STATUS_COLORS[p.status]}`}>
                    {PACKING_STATUS_LABELS[p.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.packed_items} / {p.total_items} artiklar
                  </span>
                </div>
                <Progress value={progress} className="h-1.5 mt-2" />
              </div>

              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => navigate(`/warehouse/packing/${p.id}`)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Öppna packlista
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LargeProjectPackingOverview;
