
import { supabase } from "@/integrations/supabase/client";

export interface BookingChange {
  booking_id: string;
  change_type: string;
  changed_fields: Record<string, boolean>;
  changed_at: string;
}

export const fetchRecentBookingChanges = async (bookingIds: string[]): Promise<BookingChange[]> => {
  if (bookingIds.length === 0) return [];
  
  const { data, error } = await supabase
    .from('booking_changes')
    .select('booking_id, change_type, changed_fields, changed_at')
    .in('booking_id', bookingIds)
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
