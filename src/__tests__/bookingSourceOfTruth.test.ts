import { describe, it, expect } from 'vitest';
import {
  mapCanonicalBookingToPlanning,
  applyPlanningLocalFields,
  toCanonicalBookingFields,
  isPlanningLocalField,
  type CanonicalBooking,
} from '@/lib/booking/canonicalBooking';

const canonical: CanonicalBooking = {
  id: 'b1',
  booking_number: '2605-43',
  client: { name: 'SWEPO Group AB' },
  rig_up_dates: ['2026-09-01', '2026-09-02'],
  event_dates: ['2026-09-03'],
  rig_down_dates: ['2026-09-04'],
  delivery_address: 'Storgatan 1',
  delivery_city: 'Stockholm',
  delivery_postal_code: '11122',
  delivery_geocode: { lat: 59.3, lng: 18.1 },
  delivery_contact_name: 'Anna',
  internal_notes: 'Kör bakvägen',
  status: 'CONFIRMED',
  carry_more_than_10m: true,
  products: [{ id: 'p1', name: 'Apro 5x5', quantity: 5, unit_price: 100 }],
  attachments: [{ id: 'a1', url: 'u', file_name: 'ritning.pdf', file_type: 'pdf' }],
};

describe('kanonisk läsväg från Booking', () => {
  it('mappar kanoniska fältnamn till Plannings bokningsmodell', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.rigDayDate).toBe('2026-09-01');
    expect(b.eventDate).toBe('2026-09-03');
    expect(b.rigDownDate).toBe('2026-09-04');
    expect(b.deliveryAddress).toBe('Storgatan 1');
    expect(b.deliveryLatitude).toBe(59.3);
    expect(b.deliveryLongitude).toBe(18.1);
    expect(b.internalNotes).toBe('Kör bakvägen');
    expect(b.client).toBe('SWEPO Group AB');
    expect(b.contactName).toBe('Anna');
    expect(b.carryMoreThan10m).toBe(true);
  });

  it('läser produkter från Booking-datat', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.products).toHaveLength(1);
    expect(b.products?.[0]).toMatchObject({ id: 'p1', name: 'Apro 5x5', quantity: 5, unitPrice: 100 });
    expect(b.attachments?.[0].fileName).toBe('ritning.pdf');
  });

  it('lägger Planning-lokala fält ovanpå utan att ersätta Booking-data', () => {
    const base = mapCanonicalBookingToPlanning(canonical);
    const merged = applyPlanningLocalFields(base, {
      viewed: true,
      assigned_project_id: 'proj-1',
      assigned_project_name: 'Projekt X',
      assigned_to_project: true,
      large_project_id: 'lp-1',
    });
    expect(merged.viewed).toBe(true);
    expect(merged.assignedProjectId).toBe('proj-1');
    expect(merged.largeProjectId).toBe('lp-1');
    // Booking-ägda fält är orörda
    expect(merged.deliveryAddress).toBe(base.deliveryAddress);
    expect(merged.status).toBe('CONFIRMED');
    expect(merged.internalNotes).toBe('Kör bakvägen');
    expect(merged.products).toEqual(base.products);
  });

  it('endast Planning-specifika fält räknas som lokala', () => {
    expect(isPlanningLocalField('viewed')).toBe(true);
    expect(isPlanningLocalField('assigned_project_id')).toBe(true);
    expect(isPlanningLocalField('delivery_address')).toBe(false);
    expect(isPlanningLocalField('internal_notes')).toBe(false);
  });
});

describe('kanonisk fältmappning för skrivning', () => {
  it('normaliserar Planning-namn till Bookings kanoniska namn', () => {
    const out = toCanonicalBookingFields({
      rigdaydate: '2026-09-01',
      eventdate: '2026-09-03',
      rigdowndate: '2026-09-04',
      deliveryaddress: 'Storgatan 1',
      internalnotes: 'Not',
      contact_name: 'Anna',
      delivery_latitude: 59.3,
      delivery_longitude: 18.1,
    });
    expect(out).toEqual({
      rig_up_dates: ['2026-09-01'],
      event_dates: ['2026-09-03'],
      rig_down_dates: ['2026-09-04'],
      delivery_address: 'Storgatan 1',
      internal_notes: 'Not',
      delivery_contact_name: 'Anna',
      delivery_geocode: { lat: 59.3, lng: 18.1 },
    });
  });

  it('behåller arrayer för flerdagarsfaser', () => {
    const out = toCanonicalBookingFields({ rig_dates: ['2026-09-01', '2026-09-02'] });
    expect(out.rig_up_dates).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('är fail-closed mot okända fält', () => {
    expect(() => toCanonicalBookingFields({ some_random_field: 1 })).toThrow(/Okänt bokningsfält/);
  });

  it('skriver aldrig Planning-lokala fält till Booking', () => {
    expect(() => toCanonicalBookingFields({ viewed: true })).toThrow();
    expect(() => toCanonicalBookingFields({ assigned_project_id: 'x' })).toThrow();
  });
});
