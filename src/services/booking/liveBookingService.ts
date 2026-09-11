import { supabase } from '@/integrations/supabase/client';
import {
  mapCanonicalBookingToPlanning,
  applyPlanningLocalFields,
  toCanonicalBookingFields,
  type CanonicalBooking,
  type PlanningLocalBookingFields,
} from '@/lib/booking/canonicalBooking';
import type { Booking } from '@/types/booking';
import { notifyTimeWorkerAssignments } from '@/services/time/timeWorkerSync';


export interface ProjectBookingAttachment {
  id: string;
  booking_id: string;
  url: string;
  file_name: string | null;
  file_type: string | null;
  uploaded_at: string;
}

/** Adapts only the current attachment snapshot returned by Booking for project views. */
export const toProjectBookingAttachments = (
  bookingId: string,
  booking: Pick<Booking, 'attachments'>,
): ProjectBookingAttachment[] => (booking.attachments ?? []).map((attachment) => ({
  id: attachment.id,
  booking_id: bookingId,
  url: attachment.url,
  file_name: attachment.fileName || null,
  file_type: attachment.fileType || null,
  uploaded_at: '',
}));

/**
 * Live-läsning av en bokning direkt från Bookings export_bookings-kontrakt.
 * Den lokala Planning-kopian används INTE som källa för bokningsfält här —
 * endast Planning-lokala fält (viewed, assigned_project_*) läggs ovanpå.
 */
export const fetchLiveBookingById = async (bookingId: string): Promise<Booking> => {
  const { data, error } = await supabase.functions.invoke('booking-source-read', {
    body: { booking_id: bookingId },
  });

  if (error) throw new Error(error.message || 'Kunde inte hämta bokning från Booking');
  if (!data || (data as any).error) {
    throw new Error((data as any)?.error || 'Kunde inte hämta bokning från Booking');
  }

  const canonical = (data as any).booking as CanonicalBooking;
  const local = (data as any).planning_local as PlanningLocalBookingFields | null;
  return applyPlanningLocalFields(mapCanonicalBookingToPlanning(canonical), local);
};

/** Project views must show Bookings current attachment snapshot, never the stale local mirror. */
export const fetchLiveBookingAttachments = async (
  bookingId: string,
): Promise<ProjectBookingAttachment[]> => {
  const booking = await fetchLiveBookingById(bookingId);
  return toProjectBookingAttachments(bookingId, booking);
};

/**
 * Central skrivväg: alla ändringar av bokningsfält går via Bookings
 * update-booking-from-planning. Fältnamn normaliseras till kanoniska namn.
 * organization_id sätts av servern.
 */
export const updateBookingFieldsViaSource = async (
  bookingId: string,
  patch: Record<string, unknown>,
): Promise<void> => {
  const fields = toCanonicalBookingFields(patch);
  const { data, error } = await supabase.functions.invoke('booking-source-write', {
    body: { resource: 'booking', booking_id: bookingId, fields },
  });
  if (error) throw new Error(error.message || 'Kunde inte spara mot Booking');
  if ((data as any)?.error) throw new Error((data as any).error);
  // Uppdraget kan ha ändrat kund, tider, plats eller noteringar → skicka hela
  // den aktuella worker-projektionen till Time direkt (fire-and-forget).
  notifyTimeWorkerAssignments({ bookingIds: [bookingId], reason: 'booking_fields_changed' });
};


/** Produktändringar från Planning är fail-closed tills Booking har en central skrivväg. */
export const BOOKING_PRODUCT_WRITE_DISABLED_MESSAGE =
  'Bokningsprodukter ägs av Booking. Planning har ingen skrivväg för produkter – ändra i Booking.';

export const assertBookingProductWriteUnavailable = (): never => {
  throw new Error(BOOKING_PRODUCT_WRITE_DISABLED_MESSAGE);
};

/** Bilagor ägs av Booking; Planning saknar central skrivväg → fail-closed. */
export const BOOKING_ATTACHMENT_WRITE_DISABLED_MESSAGE =
  'Bokningsbilagor ägs av Booking. Planning har ingen central skrivväg för bilagor – ändra i Booking.';

export const assertBookingAttachmentWriteUnavailable = (): never => {
  throw new Error(BOOKING_ATTACHMENT_WRITE_DISABLED_MESSAGE);
};
