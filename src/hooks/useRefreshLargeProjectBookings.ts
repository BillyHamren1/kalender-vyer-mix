import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getOrganizationId } from "@/hooks/useOrganizationId";

/**
 * Tvångsynkar alla underbokningar i ett stort projekt mot externa Booking-systemet
 * via `import-bookings` (syncMode='single'). Används som "fail-safe" när inkrementella
 * webhook-baserade synken inte plockat upp ändringar.
 *
 * Lyssnar dessutom realtime på `bookings` + `booking_changes` för de aktuella
 * booking_ids och invalidierar `large-project-bookings-full`-queryn så vyn
 * uppdateras automatiskt så fort en rad ändras (oavsett om det är webhook,
 * manuell sync eller annan klient som triggat ändringen).
 */
export function useRefreshLargeProjectBookings(
  largeProjectId: string | null,
  bookingIds: string[],
) {
  const queryClient = useQueryClient();
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // Realtime: invalidera när någon av underbokningarna ändras.
  useEffect(() => {
    if (!largeProjectId || bookingIds.length === 0) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["large-project-bookings-full", largeProjectId] });
      queryClient.invalidateQueries({ queryKey: ["large-project", largeProjectId] });
      queryClient.invalidateQueries({ queryKey: ["unseen-booking-updates"] });
    };

    const filter = `id=in.(${bookingIds.join(",")})`;
    const changeFilter = `booking_id=in.(${bookingIds.join(",")})`;

    const channel = supabase
      .channel(`lp-bookings-${largeProjectId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_changes", filter: changeFilter },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [largeProjectId, bookingIds.join(","), queryClient]);

  const refreshOne = async (bookingId: string) => {
    setRefreshingId(bookingId);
    try {
      const orgId = (await getOrganizationId()) ?? undefined;
      const { data, error } = await supabase.functions.invoke("import-bookings", {
        body: {
          syncMode: "single",
          booking_id: bookingId,
          organization_id: orgId,
          skip_review: true,
        },
      });
      if (error) throw error;
      const r = data?.results;
      const updated = (r?.updated_bookings?.length ?? 0) > 0;
      const productChanges = (r?.products_updated_bookings?.length ?? 0) > 0;
      if (updated || productChanges) {
        toast.success("Bokning uppdaterad från Booking");
      } else {
        toast.info("Bokningen var redan i synk");
      }
      queryClient.invalidateQueries({ queryKey: ["large-project-bookings-full", largeProjectId] });
      queryClient.invalidateQueries({ queryKey: ["large-project", largeProjectId] });
    } catch (err: any) {
      console.error("[useRefreshLargeProjectBookings] refreshOne failed:", err);
      toast.error("Kunde inte uppdatera bokning: " + (err?.message || "okänt fel"));
    } finally {
      setRefreshingId(null);
    }
  };

  const refreshAll = async () => {
    if (bookingIds.length === 0) {
      toast.info("Inga bokningar att uppdatera");
      return;
    }
    setIsRefreshingAll(true);
    let updatedCount = 0;
    let failedCount = 0;
    try {
      const orgId = (await getOrganizationId()) ?? undefined;
      // Begränsad parallellism för att inte hamra externa API:t.
      const CONCURRENCY = 3;
      let cursor = 0;
      const worker = async () => {
        while (cursor < bookingIds.length) {
          const idx = cursor++;
          const id = bookingIds[idx];
          try {
            const { data, error } = await supabase.functions.invoke("import-bookings", {
              body: {
                syncMode: "single",
                booking_id: id,
                organization_id: orgId,
                skip_review: true,
              },
            });
            if (error) throw error;
            const r = data?.results;
            const updated =
              (r?.updated_bookings?.length ?? 0) > 0 ||
              (r?.products_updated_bookings?.length ?? 0) > 0;
            if (updated) updatedCount++;
          } catch (err) {
            console.error("[useRefreshLargeProjectBookings] booking failed:", id, err);
            failedCount++;
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, bookingIds.length) }, () => worker()),
      );
      queryClient.invalidateQueries({ queryKey: ["large-project-bookings-full", largeProjectId] });
      queryClient.invalidateQueries({ queryKey: ["large-project", largeProjectId] });
      if (failedCount > 0) {
        toast.error(
          `Uppdaterat ${updatedCount} bokningar – ${failedCount} misslyckades. Se konsolen.`,
        );
      } else if (updatedCount > 0) {
        toast.success(`Uppdaterat ${updatedCount} av ${bookingIds.length} bokningar`);
      } else {
        toast.info(`Alla ${bookingIds.length} bokningar var redan i synk`);
      }
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return { refreshAll, refreshOne, isRefreshingAll, refreshingId };
}
