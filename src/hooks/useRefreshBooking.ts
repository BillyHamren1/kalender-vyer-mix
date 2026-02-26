import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useRefreshBooking = (bookingId: string | null, projectId: string) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const refreshBooking = async () => {
    if (!bookingId) {
      toast.error("Ingen bokning kopplad till detta projekt");
      return;
    }

    setIsRefreshing(true);
    try {
      // Get user's organization_id to avoid fallback resolution in edge function
      const { data: { user } } = await supabase.auth.getUser();
      let orgId: string | undefined;
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();
        orgId = profile?.organization_id ?? undefined;
      }

      const { data, error } = await supabase.functions.invoke("import-bookings", {
        body: { booking_id: bookingId, syncMode: "single", organization_id: orgId },
      });

      if (error) throw error;

      const results = data?.results;
      const updated = results?.updated_bookings?.length ?? 0;
      const imported = results?.imported ?? 0;
      const attachments = results?.attachments_imported ?? 0;
      const products = results?.products_imported ?? 0;

      // Invalidate all related caches
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["booking-attachments", bookingId] });

      if (imported > 0 || updated > 0) {
        const parts: string[] = [];
        if (products > 0) parts.push(`${products} produkter`);
        if (attachments > 0) parts.push(`${attachments} bilagor`);
        toast.success(
          parts.length > 0
            ? `Bokning uppdaterad – ${parts.join(", ")} synkade`
            : "Bokning uppdaterad"
        );
      } else {
        toast.info("Bokningen är redan uppdaterad, inga ändringar hittades");
      }
    } catch (err: any) {
      console.error("Error refreshing booking:", err);
      toast.error("Kunde inte uppdatera bokning: " + (err.message || "okänt fel"));
    } finally {
      setIsRefreshing(false);
    }
  };

  return { refreshBooking, isRefreshing };
};
