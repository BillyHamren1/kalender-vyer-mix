import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import LiveBookingProductsList from "./LiveBookingProductsList";
import { BookingCostsPanel } from "./BookingCostsPanel";

export interface ProjectAdditionBooking {
  id: string;
  booking_number: string | null;
  addition_number: number | null;
}

/**
 * Confirmed Sales additions attached to this normal project. Each addition is
 * its own Booking (own rows, own invoice); Sales stays the row authority, so
 * rows/costs are read live per addition booking ID — never merged into the root.
 */
export async function fetchProjectAdditionBookings(projectId: string, rootBookingId: string): Promise<ProjectAdditionBooking[]> {
  const { data, error } = await (supabase as any)
    .from("bookings")
    .select("id, booking_number, addition_number")
    .eq("parent_booking_id", rootBookingId)
    .eq("assigned_project_id", projectId)
    .eq("status", "CONFIRMED")
    .order("addition_number", { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  return ((data ?? []) as ProjectAdditionBooking[]).filter((b) => b.id !== rootBookingId && !seen.has(b.id) && seen.add(b.id));
}

export function useProjectAdditionBookings(projectId?: string | null, rootBookingId?: string | null) {
  return useQuery({
    queryKey: ["project-addition-bookings", projectId, rootBookingId],
    queryFn: () => fetchProjectAdditionBookings(projectId!, rootBookingId!),
    enabled: Boolean(projectId && rootBookingId),
  });
}

const label = (b: ProjectAdditionBooking) =>
  `Tillägg${b.addition_number ? ` ${b.addition_number}` : ""}${b.booking_number ? ` · Bokning ${b.booking_number}` : ""}`;

export function ProjectAdditionProducts({ projectId, rootBookingId }: { projectId: string; rootBookingId: string | null }) {
  const { data } = useProjectAdditionBookings(projectId, rootBookingId);
  if (!data?.length) return null;
  return (
    <section aria-label="Tillägg" className="space-y-4">
      {data.map((b) => (
        <div key={b.id} className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{label(b)}</h3>
          <LiveBookingProductsList bookingId={b.id} />
        </div>
      ))}
    </section>
  );
}

export function ProjectAdditionCosts({ projectId, rootBookingId }: { projectId: string; rootBookingId: string | null }) {
  const { data } = useProjectAdditionBookings(projectId, rootBookingId);
  if (!data?.length) return null;
  return (
    <section aria-label="Tilläggens kostnader" className="space-y-4">
      {data.map((b) => (
        <div key={b.id} className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{label(b)}</h3>
          <BookingCostsPanel bookingId={b.id} projectId={projectId} />
        </div>
      ))}
    </section>
  );
}
