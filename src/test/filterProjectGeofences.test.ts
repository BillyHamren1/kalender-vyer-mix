import { describe, expect, it } from 'vitest';
import { filterProjectGeofences } from '@/lib/staff/filterProjectGeofences';

describe('filterProjectGeofences', () => {
  it('släpper rader där status=cancelled även om planning_status=planned', () => {
    const result = filterProjectGeofences([
      {
        id: 'a',
        name: 'Cancelled',
        delivery_latitude: 59.703,
        delivery_longitude: 17.62,
        address_radius_meters: null,
        status: 'cancelled',
        planning_status: 'planned',
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it('släpper rader där planning_status=cancelled', () => {
    const result = filterProjectGeofences([
      {
        id: 'a',
        name: 'Cancelled',
        delivery_latitude: 59.703,
        delivery_longitude: 17.62,
        address_radius_meters: null,
        status: 'planning',
        planning_status: 'cancelled',
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it('dedupar två aktiva projekt på samma plats och föredrar den med explicit radie', () => {
    const result = filterProjectGeofences([
      {
        id: 'gammal',
        name: 'Gammal',
        delivery_latitude: 59.703171,
        delivery_longitude: 17.62119,
        address_radius_meters: null,
        status: 'planning',
        planning_status: 'planned',
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'aktuell',
        name: 'Aktuell',
        delivery_latitude: 59.703180,
        delivery_longitude: 17.621200,
        address_radius_meters: 350,
        status: 'planning',
        planning_status: 'planned',
        created_at: '2026-05-01T00:00:00Z',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('project:aktuell');
    expect(result[0].radiusMeters).toBe(350);
  });


  it('cancelled westmans + aktiv westmans på samma plats → bara aktiv kvar', () => {
    const result = filterProjectGeofences([
      {
        id: 'cancelled',
        name: 'Westmans (cancelled)',
        delivery_latitude: 59.703171,
        delivery_longitude: 17.62119,
        address_radius_meters: null,
        status: 'cancelled',
        planning_status: 'planned',
      },
      {
        id: 'aktiv',
        name: 'Westmans 23 maj',
        delivery_latitude: 59.7035498,
        delivery_longitude: 17.6193661,
        address_radius_meters: 350,
        status: 'planning',
        planning_status: 'planned',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('project:aktiv');
  });

  it('hoppar över rader utan koordinater', () => {
    const result = filterProjectGeofences([
      {
        id: 'a',
        name: 'Saknar',
        delivery_latitude: null,
        delivery_longitude: null,
        address_radius_meters: null,
        status: 'planning',
        planning_status: 'planned',
      },
    ]);
    expect(result).toHaveLength(0);
  });

  it('behåller projekt på olika adresser även om de tillhör samma kund', () => {
    const result = filterProjectGeofences([
      {
        id: 'a',
        name: 'Adress 1',
        delivery_latitude: 59.7,
        delivery_longitude: 17.6,
        address_radius_meters: 200,
        status: 'planning',
        planning_status: 'planned',
      },
      {
        id: 'b',
        name: 'Adress 2',
        delivery_latitude: 59.8,
        delivery_longitude: 17.7,
        address_radius_meters: 200,
        status: 'planning',
        planning_status: 'planned',
      },
    ]);
    expect(result).toHaveLength(2);
  });

  describe('datumfönster (rigg → sista nedrigg)', () => {
    const base = {
      id: 'wen',
      name: 'Wenngarn',
      delivery_latitude: 59.69,
      delivery_longitude: 17.69,
      address_radius_meters: 150,
      status: 'planning',
      planning_status: 'planned',
      rigdaydate: '2026-06-05',
      rigdowndate: '2026-06-07',
      eventdate: '2026-06-06',
    } as const;

    it('visar projektet på riggdagen', () => {
      const r = filterProjectGeofences([{ ...base }], [], '2026-06-05');
      expect(r).toHaveLength(1);
    });

    it('visar projektet på sista nedriggdag', () => {
      const r = filterProjectGeofences([{ ...base }], [], '2026-06-07');
      expect(r).toHaveLength(1);
    });

    it('döljer projektet dagen innan rigg', () => {
      const r = filterProjectGeofences([{ ...base }], [], '2026-06-04');
      expect(r).toHaveLength(0);
    });

    it('döljer projektet dagen efter sista nedrigg', () => {
      const r = filterProjectGeofences([{ ...base }], [], '2026-06-08');
      expect(r).toHaveLength(0);
    });

    it('utan rigg/nedrigg — endast eventdate avgör', () => {
      const r1 = filterProjectGeofences(
        [{ ...base, rigdaydate: null, rigdowndate: null }], [], '2026-06-06');
      expect(r1).toHaveLength(1);
      const r2 = filterProjectGeofences(
        [{ ...base, rigdaydate: null, rigdowndate: null }], [], '2026-06-05');
      expect(r2).toHaveLength(0);
    });

    it('projekt utan några datum alls filtreras bort', () => {
      const r = filterProjectGeofences(
        [{ ...base, rigdaydate: null, rigdowndate: null, eventdate: null }],
        [], '2026-06-06');
      expect(r).toHaveLength(0);
    });

    it('stort projekt: start_date/end_date avgör', () => {
      const lp = {
        id: 'lp1',
        name: 'Stort',
        address_latitude: 59.69,
        address_longitude: 17.69,
        address_radius_meters: 200,
        start_date: '2026-06-01',
        end_date: '2026-06-10',
      };
      expect(filterProjectGeofences([], [lp], '2026-06-05')).toHaveLength(1);
      expect(filterProjectGeofences([], [lp], '2026-05-31')).toHaveLength(0);
      expect(filterProjectGeofences([], [lp], '2026-06-11')).toHaveLength(0);
    });

    it('utan dateStr → datumfilter hoppas över (bakåtkompatibelt)', () => {
      const r = filterProjectGeofences([{ ...base }]);
      expect(r).toHaveLength(1);
    });
  });
});
