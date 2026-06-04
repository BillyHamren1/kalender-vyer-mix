import { describe, it, expect } from 'vitest';
import { buildDayPartition } from '../dayPartition';

/**
 * Regression — Andis Grinbergs 2026-06-02 (Tid & Lön vs GPS-satellit divergens).
 *
 * Råmönstret i staff_gps_day_snapshots:
 *   work FA Warehouse  04:53–09:40
 *   private Boende - Vällsta 09:40:49–09:40:54   (~5 s, geo-noise)
 *   unknown_place      09:40:54–10:17           (~36 min, pings just utanför fence)
 *   work FA Warehouse  10:17–16:09
 *
 * Förväntat efter Pass 2c + Pass 4: ETT sammanhängande FA Warehouse-block.
 * Den 5-sekunders private-flapen ska absorberas av föregående FA Warehouse,
 * så same-site sandwich-regeln kan kollapsa unknown-blocket in i samma
 * FA Warehouse-vistelse. Tid & Lön och GPS-satellit ska därmed visa exakt
 * samma platsklassning för dagen.
 */
describe('dayPartition — short private flap between same-target stays', () => {
  it('kollapsar work(A) → 5s private(B) → unknown_place → work(A) till ETT work(A)-block', () => {
    const visits = [
      {
        start: '2026-06-02T04:53:43.064Z',
        end: '2026-06-02T09:40:49.070Z',
        knownSite: { id: 'loc:fa', name: 'FA Warehouse' },
      },
      {
        start: '2026-06-02T09:40:49.070Z',
        end: '2026-06-02T09:40:54.999Z',
        knownSite: { id: 'loc:vallsta', name: 'Boende - Vällsta' },
      },
      {
        start: '2026-06-02T10:17:01.101Z',
        end: '2026-06-02T16:09:39.078Z',
        knownSite: { id: 'loc:fa', name: 'FA Warehouse' },
      },
    ];
    // Pings: FA-zon, kort dropp till Vällsta-zon, sedan ~36 min strö-pings
    // strax utanför FA-fence (alla nära FA, ingen displacement >= 500 m).
    const pings = [
      { recorded_at: '2026-06-02T04:53:43.064Z', lat: 59.49145, lng: 17.85536 },
      { recorded_at: '2026-06-02T08:00:00.000Z', lat: 59.49145, lng: 17.85536 },
      { recorded_at: '2026-06-02T09:40:49.070Z', lat: 59.4913, lng: 17.8529 },
      { recorded_at: '2026-06-02T09:40:54.999Z', lat: 59.4913, lng: 17.8529 },
      { recorded_at: '2026-06-02T09:55:00.000Z', lat: 59.49150, lng: 17.85510 },
      { recorded_at: '2026-06-02T10:10:00.000Z', lat: 59.49152, lng: 17.85508 },
      { recorded_at: '2026-06-02T10:17:01.101Z', lat: 59.49145, lng: 17.85536 },
      { recorded_at: '2026-06-02T14:00:00.000Z', lat: 59.49145, lng: 17.85536 },
      { recorded_at: '2026-06-02T16:09:39.078Z', lat: 59.49145, lng: 17.85536 },
    ];
    const out = buildDayPartition({
      pings,
      visits,
      privateGeofenceIds: ['loc:vallsta'],
    });
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].type).toBe('work');
    expect(out.segments[0].knownSiteId).toBe('loc:fa');
    expect(out.unknownMin).toBe(0);
    expect(out.privateMin).toBe(0);
  });

  it('rör INTE en kort private(B)-stay som följs av en annan stay än prev', () => {
    // Här finns ingen återgång till A — flapen ska inte absorberas på fel sätt.
    const visits = [
      {
        start: '2026-06-02T04:53:00.000Z',
        end: '2026-06-02T05:00:00.000Z',
        knownSite: { id: 'loc:fa', name: 'FA Warehouse' },
      },
      {
        start: '2026-06-02T05:00:00.000Z',
        end: '2026-06-02T05:00:30.000Z',
        knownSite: { id: 'loc:vallsta', name: 'Boende - Vällsta' },
      },
      {
        start: '2026-06-02T05:00:30.000Z',
        end: '2026-06-02T10:00:00.000Z',
        knownSite: { id: 'loc:other', name: 'Annan Plats' },
      },
    ];
    const pings = [
      { recorded_at: '2026-06-02T04:53:00.000Z', lat: 59.49, lng: 17.85 },
      { recorded_at: '2026-06-02T05:00:00.000Z', lat: 59.491, lng: 17.853 },
      { recorded_at: '2026-06-02T05:00:30.000Z', lat: 59.50, lng: 17.86 },
      { recorded_at: '2026-06-02T10:00:00.000Z', lat: 59.50, lng: 17.86 },
    ];
    const out = buildDayPartition({
      pings,
      visits,
      privateGeofenceIds: ['loc:vallsta'],
    });
    // Pass 2c absorberar den 30 s-private(B)-flapen in i föregående FA
    // (samma regel) — men FA och "Annan Plats" har olika target och får
    // INTE slås ihop. Resultatet ska vara två stays.
    const stayIds = out.segments
      .filter((s) => s.type === 'work' || s.type === 'private')
      .map((s) => s.knownSiteId);
    expect(stayIds).toContain('loc:fa');
    expect(stayIds).toContain('loc:other');
  });
});
