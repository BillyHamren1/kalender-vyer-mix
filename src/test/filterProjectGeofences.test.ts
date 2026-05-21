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

  it('dedupar två projekt på samma plats och föredrar den med explicit radie', () => {
    const result = filterProjectGeofences([
      {
        id: 'gammal',
        name: 'Gammal (cancelled men dyker upp)',
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
        delivery_latitude: 59.7035498,
        delivery_longitude: 17.6193661,
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
});
