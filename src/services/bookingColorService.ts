import { supabase } from '@/integrations/supabase/client';

export type BookingColorPreset = 'transport' | 'rental' | 'custom';

/**
 * Preset → hex. "custom" hanteras separat (frontend skickar in hex direkt).
 * Blå = transport, Orange = endast uthyrning.
 */
export const BOOKING_COLOR_PRESETS: Record<Exclude<BookingColorPreset, 'custom'>, { label: string; hex: string }> = {
  transport: { label: 'Transport', hex: '#BFDBFE' /* blue-200 */ },
  rental: { label: 'Endast uthyrning', hex: '#FED7AA' /* orange-200 */ },
};

/**
 * Spara en färgmärkning på en bokning. `color = null` rensar märkningen.
 */
export async function setBookingCalendarColor(bookingId: string, color: string | null): Promise<void> {
  const { error } = await supabase
    .from('bookings')
    .update({ calendar_color: color })
    .eq('id', bookingId);
  if (error) throw error;
}
