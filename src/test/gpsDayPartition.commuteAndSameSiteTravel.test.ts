import { describe, it, expect } from 'vitest';
import { buildDayPartition } from '@/lib/staff-gps/dayPartition';

const D = '2026-06-03';
const t = (hhmm: string) => `${D}T${hhmm}:00.000Z`;
const ping = (hhmm: string, lat = 59.65, lng = 17.72) => ({
  recorded_at: t(hhmm),
  lat,
  lng,
});

// Koordinater: Boende Venngarn ≈ 59.65,17.72  /  Westmans (Solna) ≈ 59.36,17.99 (>20 km bort)
const HOME = { lat: 59.65, lng: 17.72 };
const WORK = { lat: 59.36, lng: 17.99 };

describe('dayPartition — Regel 2 & 3: commute travel → private', () => {
  it('Resa boende → jobb klassas som private (icke-payable)', () => {
    const pings = [
      { recorded_at: t('06:23'), ...HOME },
      { recorded_at: t('07:08'), ...HOME },
      // Drive
      { recorded_at: t('07:30'), lat: 59.5, lng: 17.85 },
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('11:00'), ...WORK },
    ];
    const visits = [
      { start: t('06:23'), end: t('07:08'), knownSite: { id: 'home', name: 'Boende - Venngarn' } },
      { start: t('08:00'), end: t('11:00'), knownSite: { id: 'proj:A', name: 'Westmans' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: ['home'] });

    const travelSegs = p.segments.filter((s) => s.type === 'travel');
    expect(travelSegs.length).toBe(0); // commute har omklassats
    expect(p.travelMin).toBe(0);
    expect(p.privateMin).toBeGreaterThan(0);
    // Etikett bevarad
    const privateLabels = p.segments.filter((s) => s.type === 'private').map((s) => s.label);
    expect(privateLabels.some((l) => l.includes('Resa') && l.includes('Boende'))).toBe(true);
  });

  it('Resa jobb → boende klassas som private', () => {
    const pings = [
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('16:00'), ...WORK },
      { recorded_at: t('16:30'), lat: 59.5, lng: 17.85 },
      { recorded_at: t('17:15'), ...HOME },
      { recorded_at: t('22:00'), ...HOME },
    ];
    const visits = [
      { start: t('08:00'), end: t('16:00'), knownSite: { id: 'proj:A', name: 'Westmans' } },
      { start: t('17:15'), end: t('22:00'), knownSite: { id: 'home', name: 'Boende - Venngarn' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: ['home'] });

    expect(p.travelMin).toBe(0);
    const reclassified = p.segments.filter(
      (s) => s.type === 'private' && /Resa/.test(s.label)
    );
    expect(reclassified.length).toBeGreaterThan(0);
  });
});

describe('dayPartition — Regel 4 & 5: same-site travel absorberas', () => {
  it('Westmans → Resa → Westmans (samma knownSiteId) kollapsas till EN stay', () => {
    const pings = [
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('08:43'), ...WORK },
      // kort utflykt 500m bort
      { recorded_at: t('08:50'), lat: 59.365, lng: 17.995 },
      { recorded_at: t('09:00'), ...WORK },
      { recorded_at: t('11:00'), ...WORK },
    ];
    const visits = [
      { start: t('08:00'), end: t('08:43'), knownSite: { id: 'proj:A', name: 'Westmans' } },
      { start: t('09:00'), end: t('11:00'), knownSite: { id: 'proj:A', name: 'Westmans' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });

    expect(p.segments.filter((s) => s.type === 'travel').length).toBe(0);
    const work = p.segments.filter((s) => s.type === 'work');
    expect(work.length).toBe(1);
    expect(work[0].label).toBe('Westmans');
  });

  it('Westmans (id A) → Resa → Westmans (id B) men SAMMA LABEL kollapsas', () => {
    // Två geofences för samma projekt — projekt + booking-syskon, eller large+booking.
    const pings = [
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('08:43'), ...WORK },
      { recorded_at: t('08:50'), lat: 59.365, lng: 17.995 },
      { recorded_at: t('09:00'), ...WORK },
      { recorded_at: t('11:00'), ...WORK },
    ];
    const visits = [
      { start: t('08:00'), end: t('08:43'), knownSite: { id: 'project:9e48c30a', name: 'Westmans Uthyrning - 4 juni 2026' } },
      { start: t('09:00'), end: t('11:00'), knownSite: { id: 'project:2a1c1262', name: 'Westmans Uthyrning - 4 juni 2026' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });

    expect(p.segments.filter((s) => s.type === 'travel').length).toBe(0);
    const work = p.segments.filter((s) => s.type === 'work');
    expect(work.length).toBe(1);
  });

  it('Resa Westmans → AnnanAdress (olika label) BEVARAS (Regel 5)', () => {
    const pings = [
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('09:00'), ...WORK },
      { recorded_at: t('09:30'), lat: 59.40, lng: 18.10 },
      { recorded_at: t('10:00'), lat: 59.42, lng: 18.20 },
      { recorded_at: t('12:00'), lat: 59.42, lng: 18.20 },
    ];
    const visits = [
      { start: t('08:00'), end: t('09:00'), knownSite: { id: 'proj:A', name: 'Westmans' } },
      { start: t('10:00'), end: t('12:00'), knownSite: { id: 'proj:B', name: 'Annan adress' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: [] });

    const travel = p.segments.filter((s) => s.type === 'travel');
    expect(travel.length).toBe(1);
    expect(travel[0].fromLabel).toBe('Westmans');
    expect(travel[0].toLabel).toBe('Annan adress');
  });
});

describe('dayPartition — Regel 1: boende före första jobb är private', () => {
  it('Boende-stayen är private och räknas inte som arbete', () => {
    const pings = [
      { recorded_at: t('06:23'), ...HOME },
      { recorded_at: t('07:08'), ...HOME },
      { recorded_at: t('08:00'), ...WORK },
      { recorded_at: t('11:00'), ...WORK },
    ];
    const visits = [
      { start: t('06:23'), end: t('07:08'), knownSite: { id: 'home', name: 'Boende - Venngarn' } },
      { start: t('08:00'), end: t('11:00'), knownSite: { id: 'proj:A', name: 'Westmans' } },
    ];
    const p = buildDayPartition({ pings, visits, privateGeofenceIds: ['home'] });
    const boende = p.segments.find((s) => s.knownSiteId === 'home');
    expect(boende?.type).toBe('private');
    expect(p.workMin).toBeGreaterThan(0); // Westmans räknas
    expect(p.travelMin).toBe(0); // commute private
  });
});
