import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, AlertTriangle, CheckCircle2, Rows3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ProjectTransportWidget from "@/components/project/ProjectTransportWidget";
import PickupStopsSection from "@/components/pickup/PickupStopsSection";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";

interface Props { largeProjectId: string; bookings: any[]; }

const LargeProjectLogisticsWorkspace = ({ largeProjectId, bookings }: Props) => {
  const bookingIds = useMemo(() => bookings.map(b => b.booking_id).filter(Boolean), [bookings]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(bookingIds[0] || null);
  const activeBookingId = bookingIds.includes(selectedBookingId || "") ? selectedBookingId : bookingIds[0] || null;

  const { data: assignments = [] } = useQuery({
    queryKey: ["large-project-transport-summary", largeProjectId, bookingIds.join(",")],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      const { data, error } = await supabase.from("transport_assignments").select("id, booking_id, status, partner_response").in("booking_id", bookingIds);
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const needsAction = assignments.filter((a: any) => a.partner_response === "declined" || (!a.status || a.status === "pending") && !a.partner_response).length;
  const confirmed = assignments.filter((a: any) => a.partner_response === "accepted" || a.status === "confirmed").length;

  return <div className="space-y-5">
    <Card className="border-border/60 shadow-sm"><CardContent className="p-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div><h3 className="text-sm font-semibold flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />Logistik för hela projektet</h3><p className="text-xs text-muted-foreground mt-1">Välj leverans för att boka och följa transport. Sammanfattningen räknar samtliga bokningar i projektet.</p></div>
        <div className="flex gap-2 text-xs"><span className="rounded-md border px-2.5 py-1.5 flex gap-1.5 items-center"><Rows3 className="h-3.5 w-3.5" />{bookingIds.length} leveranser</span><span className="rounded-md border px-2.5 py-1.5 flex gap-1.5 items-center"><CheckCircle2 className="h-3.5 w-3.5" />{confirmed} bekräftade</span><span className="rounded-md border px-2.5 py-1.5 flex gap-1.5 items-center"><AlertTriangle className="h-3.5 w-3.5" />{needsAction} åtgärd</span></div>
      </div>
      {bookingIds.length > 1 && <div className="flex gap-2 overflow-x-auto mt-4 pt-4 border-t border-border/50">{bookings.map((b:any) => <Button key={b.booking_id} variant={activeBookingId === b.booking_id ? "default" : "outline"} size="sm" className="shrink-0" onClick={() => setSelectedBookingId(b.booking_id)}>{getLargeProjectBookingLabel(b)}</Button>)}</div>}
    </CardContent></Card>
    <ProjectTransportWidget bookingId={activeBookingId} />
    <PickupStopsSection parent={{ type: "large_project", id: largeProjectId }} />
  </div>;
};
export default LargeProjectLogisticsWorkspace;
