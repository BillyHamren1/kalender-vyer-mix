// customerPickupService — toggle "Kund hämtar själv" på en booking eller
// standalone-projekt och spegla flaggan till calendar_events så att kalendern
// kan färga rig/rivning rosa/lila utan extra join.

import { supabase } from "@/integrations/supabase/client";

const STANDALONE_PREFIX = "project-";

export interface ToggleCustomerPickupInput {
  /** booking_id som syns i calendar_events. För standalone-projekt: `project-{projectId}`. */
  bookingId: string;
  value: boolean;
}

export async function setCustomerPickupForBooking({ bookingId, value }: ToggleCustomerPickupInput) {
  // Spegla alltid till calendar_events först — så UI uppdateras direkt.
  const { error: calErr } = await supabase
    .from("calendar_events")
    .update({ customer_pickup: value })
    .eq("booking_id", bookingId);
  if (calErr) throw calErr;

  // Skriv till källan (booking eller standalone-project).
  if (bookingId.startsWith(STANDALONE_PREFIX)) {
    const projectId = bookingId.slice(STANDALONE_PREFIX.length);
    const { error } = await supabase
      .from("projects")
      .update({ customer_pickup: value })
      .eq("id", projectId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("bookings")
      .update({ customer_pickup: value })
      .eq("id", bookingId);
    if (error) throw error;
  }
}

export async function fetchCustomerPickupForBooking(bookingId: string): Promise<boolean> {
  if (bookingId.startsWith(STANDALONE_PREFIX)) {
    const projectId = bookingId.slice(STANDALONE_PREFIX.length);
    const { data } = await supabase
      .from("projects")
      .select("customer_pickup")
      .eq("id", projectId)
      .maybeSingle();
    return Boolean((data as any)?.customer_pickup);
  }
  const { data } = await supabase
    .from("bookings")
    .select("customer_pickup")
    .eq("id", bookingId)
    .maybeSingle();
  return Boolean((data as any)?.customer_pickup);
}
