import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProjectTransportAssignment {
  id: string;
  booking_id: string;
  vehicle_id: string;
  transport_date: string;
  transport_time: string | null;
  pickup_address: string | null;
  status: string | null;
  partner_response: string | null;
  partner_responded_at: string | null;
  created_at: string;
  stop_order: number | null;
  driver_notes: string | null;
  vehicle: {
    id: string;
    name: string;
    contact_person: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    is_external: boolean;
    vehicle_type: string | null;
  } | null;
}

export interface TransportEmailLogEntry {
  id: string;
  assignment_id: string;
  booking_id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  custom_message: string | null;
  sent_at: string;
  email_type: string;
}

export const useProjectTransport = (bookingId: string | null | undefined) => {
  const queryClient = useQueryClient();

  const assignmentsQuery = useQuery({
    queryKey: ["project-transport-assignments", bookingId],
    queryFn: async (): Promise<ProjectTransportAssignment[]> => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("transport_assignments")
        .select(`
          id, booking_id, vehicle_id, transport_date, transport_time,
          pickup_address, status, partner_response, partner_responded_at,
          created_at, stop_order, driver_notes,
          vehicle:vehicles!vehicle_id (
            id, name, contact_person, contact_email, contact_phone, is_external, vehicle_type
          )
        `)
        .eq("booking_id", bookingId)
        .order("transport_date", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as ProjectTransportAssignment[];
    },
    enabled: !!bookingId,
  });

  const emailLogsQuery = useQuery({
    queryKey: ["project-transport-email-logs", bookingId],
    queryFn: async (): Promise<TransportEmailLogEntry[]> => {
      if (!bookingId) return [];
      const { data, error } = await supabase
        .from("transport_email_log")
        .select("*")
        .eq("booking_id", bookingId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      return (data || []) as TransportEmailLogEntry[];
    },
    enabled: !!bookingId,
  });

  // Subscribe to real-time changes on transport_assignments for this booking
  useEffect(() => {
    if (!bookingId) return;

    const channel = supabase
      .channel(`project-transport-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transport_assignments',
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          console.log('[useProjectTransport] Real-time update detected, invalidating...');
          queryClient.invalidateQueries({ queryKey: ["project-transport-assignments", bookingId] });
          queryClient.invalidateQueries({ queryKey: ["project-transport-email-logs", bookingId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bookingId, queryClient]);

  return {
    assignments: assignmentsQuery.data || [],
    emailLogs: emailLogsQuery.data || [],
    isLoading: assignmentsQuery.isLoading || emailLogsQuery.isLoading,
    refetch: () => {
      assignmentsQuery.refetch();
      emailLogsQuery.refetch();
    },
  };
};
