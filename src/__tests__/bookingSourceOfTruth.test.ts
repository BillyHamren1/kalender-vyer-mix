import { describe, it, expect } from 'vitest';
import {
  mapCanonicalBookingToPlanning,
  applyPlanningLocalFields,
  toCanonicalBookingFields,
  isPlanningLocalField,
  splitTimeRange,
  joinTimeRange,
  EVENT_TIME_UNSUPPORTED_MESSAGE,
  type CanonicalBooking,
} from '@/lib/booking/canonicalBooking';
import { assertBookingAttachmentWriteUnavailable } from '@/services/booking/liveBookingService';

/** Exakta fältnamn enligt Bookings verifierade export_bookings-kontrakt. */
const canonical: CanonicalBooking = {
  id: 'b1',
  booking_number: '2605-43',
  client: { name: 'SWEPO Group AB' },
  clientName: 'SWEPO Group AB',
  rig_up_dates: ['2026-09-01', '2026-09-02'],
  event_dates: ['2026-09-03'],
  rig_down_dates: ['2026-09-04'],
  rig_up_time: '08:00 - 12:00',
  rig_down_time: '16:00 - 18:00',
  delivery_address: 'Storgatan 1',
  delivery_city: 'Stockholm',
  delivery_postal_code: '11122',
  delivery_geocode: { lat: 59.3, lng: 18.1 },
  delivery_contact_name: 'Anna',
  delivery_contact_phone: '070',
  contact_email: 'anna@example.com',
  internal_notes: 'Kör bakvägen',
  status: 'CONFIRMED',
  carry_more_than_10m: true,
  map_snapshot_url: 'https://cdn/map.png',
  products: [
    {
      booking_product_id: 'bp1',
      product_name: 'Apro 5x5',
      quantity: 5,
      unit_price: 100,
      total: 500,
      is_package_component: false,
      inventory_package_id: 'pkg1',
    },
    {
      id: 'bp2',
      product_name: 'Transparent vägg',
      quantity: 10,
      total: 0,
      parent_product_id: 'bp1',
      is_package_component: true,
    },
  ],
  attachments: [
    { file_name: 'ritning.pdf', mime_type: 'application/pdf', public_url: 'https://cdn/r.pdf', path: 'org/b1/r.pdf' },
  ],
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
    expect(b.contactEmail).toBe('anna@example.com');
    expect(b.carryMoreThan10m).toBe(true);
    expect(b.mapDrawingUrl).toBe('https://cdn/map.png');
  });

  it('delar rig_up_time och rig_down_time i start/slut', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.rigStartTime).toBe('08:00');
    expect(b.rigEndTime).toBe('12:00');
    expect(b.rigDownStartTime).toBe('16:00');
    expect(b.rigDownEndTime).toBe('18:00');
  });

  it('hittar aldrig på eventtider (saknar kanonisk källa)', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.eventStartTime).toBeNull();
    expect(b.eventEndTime).toBeNull();
  });

  it('splitTimeRange hanterar enkla och tomma värden', () => {
    expect(splitTimeRange('08:00')).toEqual({ start: '08:00', end: null });
    expect(splitTimeRange('08:00-12:00')).toEqual({ start: '08:00', end: '12:00' });
    expect(splitTimeRange(null)).toEqual({ start: null, end: null });
    expect(joinTimeRange('08:00', '12:00')).toBe('08:00 - 12:00');
    expect(joinTimeRange('08:00', undefined)).toBe('08:00');
    expect(joinTimeRange(undefined, undefined)).toBeNull();
  });

  it('mappar produkter från booking_product_id/product_name utan undefined-id', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.products).toHaveLength(2);
    expect(b.products?.[0]).toMatchObject({
      id: 'bp1',
      name: 'Apro 5x5',
      quantity: 5,
      unitPrice: 100,
      totalPrice: 500,
      parentPackageId: 'pkg1',
    });
    expect(b.products?.[1]).toMatchObject({ id: 'bp2', parentProductId: 'bp1', isPackageComponent: true });
    expect(b.products?.every((p) => p.id && p.name)).toBe(true);
  });

  it('filtrerar bort produktrader utan id eller namn', () => {
    const b = mapCanonicalBookingToPlanning({
      ...canonical,
      products: [{ quantity: 2 }, { booking_product_id: 'x', product_name: '' }],
    });
    expect(b.products).toEqual([]);
  });

  it('mappar bilagor med stabil fallback-id från path/public_url', () => {
    const b = mapCanonicalBookingToPlanning(canonical);
    expect(b.attachments?.[0]).toEqual({
      id: 'org/b1/r.pdf',
      url: 'https://cdn/r.pdf',
      fileName: 'ritning.pdf',
      fileType: 'application/pdf',
    });
    const onlyUrl = mapCanonicalBookingToPlanning({
      ...canonical,
      attachments: [{ file_name: 'a.pdf', public_url: 'https://cdn/a.pdf' }],
    });
    expect(onlyUrl.attachments?.[0].id).toBe('https://cdn/a.pdf');
  });

  it('lägger Planning-lokala fält ovanpå utan att ersätta Booking-data', () => {
    const base = mapCanonicalBookingToPlanning(canonical);
    const merged = applyPlanningLocalFields(base, {
      viewed: true,
      assigned_project_id: 'proj-1',
      assigned_project_name: 'Projekt X',
      assigned_to_project: true,
    });
    expect(merged.viewed).toBe(true);
    expect(merged.assignedProjectId).toBe('proj-1');
    expect(merged.deliveryAddress).toBe(base.deliveryAddress);
    expect(merged.status).toBe('CONFIRMED');
    expect(merged.products).toEqual(base.products);
  });

  it('endast viewed och assigned_project_* är Planning-lokala', () => {
    expect(isPlanningLocalField('viewed')).toBe(true);
    expect(isPlanningLocalField('assigned_project_id')).toBe(true);
    expect(isPlanningLocalField('large_project_id')).toBe(false);
    expect(isPlanningLocalField('delivery_address')).toBe(false);
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
      contact_email: 'anna@example.com',
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
      contact_email: 'anna@example.com',
      delivery_geocode: { lat: 59.3, lng: 18.1 },
    });
    expect(out).not.toHaveProperty('delivery_contact_email');
  });

  it('slår ihop rig-tider till rig_up_time och rig_down_time', () => {
    const out = toCanonicalBookingFields({
      rig_start_time: '08:00',
      rig_end_time: '12:00',
      rigdown_start_time: '16:00',
      rigdown_end_time: '18:00',
    });
    expect(out).toEqual({ rig_up_time: '08:00 - 12:00', rig_down_time: '16:00 - 18:00' });
    expect(out).not.toHaveProperty('rig_start_time');
    expect(out).not.toHaveProperty('rigdown_end_time');
  });

  it('behåller arrayer för flerdagarsfaser', () => {
    const out = toCanonicalBookingFields({ rig_dates: ['2026-09-01', '2026-09-02'] });
    expect(out.rig_up_dates).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('är fail-closed för eventtider som saknar kanonisk källa', () => {
    expect(() => toCanonicalBookingFields({ event_start_time: '10:00' })).toThrow(EVENT_TIME_UNSUPPORTED_MESSAGE);
    expect(() => toCanonicalBookingFields({ event_end_time: '14:00' })).toThrow(EVENT_TIME_UNSUPPORTED_MESSAGE);
  });

  it('sparar inte giltiga fält delvis när patchen innehåller eventtid', () => {
    expect(() =>
      toCanonicalBookingFields({ internalnotes: 'Not', event_start_time: '10:00' }),
    ).toThrow(EVENT_TIME_UNSUPPORTED_MESSAGE);
  });

  it('är fail-closed mot okända fält och Planning-lokala fält', () => {
    expect(() => toCanonicalBookingFields({ some_random_field: 1 })).toThrow(/Okänt bokningsfält/);
    expect(() => toCanonicalBookingFields({ viewed: true })).toThrow();
    expect(() => toCanonicalBookingFields({ assigned_project_id: 'x' })).toThrow();
  });
});

describe('bilageskrivning', () => {
  it('är fail-closed tills Booking har en central endpoint', () => {
    expect(() => assertBookingAttachmentWriteUnavailable()).toThrow(/Bokningsbilagor ägs av Booking/);
  });
});
