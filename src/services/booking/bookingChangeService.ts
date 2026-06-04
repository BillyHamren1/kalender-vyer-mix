
import { supabase } from "@/integrations/supabase/client";

export interface BookingChange {
  booking_id: string;
  change_type: string;
  changed_fields: Record<string, boolean>;
  changed_at: string;
}

export const fetchRecentBookingChanges = async (bookingIds: string[]): Promise<BookingChange[]> => {
  if (bookingIds.length === 0) return [];
  
  // Triage ska BARA lysa upp ändringar som kommer från Booking-systemet (webhook
  // → edge functions → service_role). Ändringar gjorda inifrån Planning
  // (authenticated-rollen, t.ex. nya tider i personalkalendern) ska INTE
  // visas som "uppdaterad". Triggern `track_booking_changes` stämplar
  // `changed_by` med PostgreSQL-rollen som gjorde uppdateringen.
  const { data, error } = await supabase
    .from('booking_changes')
    .select('booking_id, change_type, changed_fields, changed_at, changed_by')
    .in('booking_id', bookingIds)
    .eq('changed_by', 'service_role')
    .order('changed_at', { ascending: false });

  if (error) {
    console.error('Error fetching booking changes:', error);
    return [];
  }

  // Get the most recent change for each booking
  const latestChanges = new Map<string, BookingChange>();
  
  data?.forEach(change => {
    if (!latestChanges.has(change.booking_id)) {
      latestChanges.set(change.booking_id, change as BookingChange);
    }
  });

  return Array.from(latestChanges.values());
};

export const getFieldChangeType = (changes: BookingChange[], bookingId: string, fieldName: string): string | null => {
  const change = changes.find(c => c.booking_id === bookingId);
  if (!change || !change.changed_fields[fieldName]) {
    return null;
  }
  
  return change.change_type;
};
