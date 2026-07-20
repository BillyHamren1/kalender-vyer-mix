/**
 * Kontrakt: import-bookings edge function MÅSTE skicka request-headern
 * 'x-lovable-change-source: booking-import' via supabase-js global headers.
 * Utan detta klassar `track_booking_changes`-triggern skrivningen som
 * intern och externa Booking-uppdateringar syns aldrig i "Uppdaterade
 * bokningar"-listan.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('import-bookings change-source header contract', () => {
  const src = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'import-bookings', 'index.ts'),
    'utf8'
  );

  it('skickar x-lovable-change-source: booking-import via global headers', () => {
    expect(src).toMatch(/global\s*:\s*\{[\s\S]{0,200}headers\s*:\s*\{[\s\S]{0,200}'x-lovable-change-source'\s*:\s*'booking-import'/);
  });
});

describe('bookingChangeService source filter contract', () => {
  const src = readFileSync(
    join(process.cwd(), 'src', 'services', 'booking', 'bookingChangeService.ts'),
    'utf8'
  );

  it("filtrerar changed_by till ['booking-import','booking-webhook']", () => {
    expect(src).toMatch(/\.in\(\s*'changed_by'\s*,\s*\[\s*'booking-import'\s*,\s*'booking-webhook'\s*\]\s*\)/);
    expect(src).not.toMatch(/\.eq\(\s*'changed_by'\s*,\s*'service_role'\s*\)/);
  });
});
