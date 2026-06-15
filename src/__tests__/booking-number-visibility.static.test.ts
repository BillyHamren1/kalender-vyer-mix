import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * SÄKERHETSREGEL: Bokningsnummer (booking_number) MÅSTE visas i alla vyer
 * där en bokning identifieras (lista, kort, header, packlist-grupp).
 * Att packa "Almedalen 2026" utan nummer är livsfarligt — fel kund/projekt.
 * Dessa tester låser att vyerna refererar packing.booking.booking_number
 * eller group.bookingNumber så att en utvecklare inte tar bort det av misstag.
 */
describe('Booking number is shown wherever a booking is identified', () => {
  const cases: Array<{ file: string; needles: RegExp[] }> = [
    {
      file: 'src/components/packing/PackingCard.tsx',
      needles: [/packing\.booking\?\.booking_number/, /#\{packing\.booking\.booking_number\}/],
    },
    {
      file: 'src/components/scanner/calendar/PackingCard.tsx',
      needles: [/packing\.booking\?\.booking_number/, /#\{packing\.booking\.booking_number\}/],
    },
    {
      file: 'src/components/scanner/VerificationView.tsx',
      needles: [/packing\?\.booking\?\.booking_number/, /#\{packing\.booking\.booking_number\}/],
    },
    {
      file: 'src/pages/PackingDetail.tsx',
      needles: [/booking\?\.booking_number/, /#\{booking\.booking_number\}/],
    },
    {
      file: 'src/components/packing/PackingListTab.tsx',
      needles: [/group\.bookingNumber/, /#\{group\.bookingNumber\}/],
    },
    {
      file: 'src/components/packing/DesktopChecklistView.tsx',
      needles: [/group\.bookingNumber/, /\{group\.bookingNumber\}/],
    },
  ];

  for (const { file, needles } of cases) {
    it(`${file} renderar booking_number`, () => {
      const src = read(file);
      for (const n of needles) {
        expect(src, `${file} saknar match för ${n}`).toMatch(n);
      }
    });
  }
});

describe('BookingGroup-typen exponerar booking_number + eventdate', () => {
  const src = read('src/hooks/usePackingList.tsx');

  it('BookingGroup har bookingNumber + eventdate', () => {
    const idx = src.indexOf('export interface BookingGroup');
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(idx, idx + 400);
    expect(body).toMatch(/bookingNumber:\s*string\s*\|\s*null/);
    expect(body).toMatch(/eventdate:\s*string\s*\|\s*null/);
  });

  it('fetchBookingGroups hämtar booking_number + eventdate från bookings', () => {
    expect(src).toMatch(/\.select\(['"]id,\s*client,\s*booking_number,\s*eventdate[^)]*['"]\)/);
  });
});
