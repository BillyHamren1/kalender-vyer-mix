// @vitest-environment node
/**
 * Regressionstest — Eduards 00:00-fel (FA Warehouse-natten).
 *
 * Scenario:
 *   - Date: 2026-05-06
 *   - Visit FA Warehouse 00:00–07:00 (känd plats)
 *   - Workday started_at 05:47
 *   - Timer-bevis (LTE) från 05:47 → öppen
 *   - Inga timers/time_reports/assistant-events i fönstret 00:00–05:47
 *
 * Förväntat efter fix:
 *   - dayBlockTimeline-block för FA får INTE börja 00:00 — det ska klippas
 *     till workday-start 05:47.
 *   - proposedReport.proposedWorkdayStart får INTE bli 00:00 — bara känd
 *     plats räcker inte för att flytta workday-start.
 *   - En anomaly "GPS-aktivitet före arbetsdagens start" ska finnas och
 *     kräva manuell granskning (suggestion-text utan auto-justering).
 *
 * Ska faila på koden FÖRE fixen och passera EFTER fixen.
 */
import { describe, it, expect } from 'vitest';
import { buildActualStaffDayModel, type BuildActualStaffDayInput } from '../actualStaffDayModel';
import { buildDayBlockTimeline, type PresenceBlock, type VisitInfo } from '../dayBlockTimeline';
import type { PlaceVisit } from '../pingPlaceSegments';

const date = '2026-05-06';
const FA = { id: 'site-fa', name: 'FA Warehouse', lat: 59.30, lng: 18.00, radiusMeters: 100 };

const baseInput = (over: Partial<BuildActualStaffDayInput>): BuildActualStaffDayInput => ({
  date,
  workday: null,
  timeReports: [],
  locationEntries: [],
  travelLogs: [],
  assistantEvents: [],
  flags: [],
  visits: [],
  travels: [],
  pings: [],
  latestPing: null,
  knownSites: [FA],
  privateZones: [],
  plannedAssignments: [],
  now: new Date(`${date}T20:00:00Z`),
  ...over,
});

describe('Pre-workday midnight visit on known site (Eduards 00:00-bug)', () => {
  const faVisit: PlaceVisit = {
    placeKey: `site:${FA.id}`,
    knownSite: { id: FA.id, name: FA.name },
    centre: { lat: FA.lat, lng: FA.lng },
    start: `${date}T00:00:00Z`,
    end: `${date}T07:00:00Z`,
    durationMin: 420,
    pingCount: 60,
    pings: [],
  };

  const buildModel = () => buildActualStaffDayModel(baseInput({
    visits: [faVisit],
    workday: {
      id: 'wd-1',
      started_at: `${date}T05:47:00Z`,
      ended_at: null,
    },
    locationEntries: [{
      id: 'lte-1',
      entered_at: `${date}T05:47:00Z`,
      exited_at: null,
      label: 'FA Warehouse',
      isPresenceOnly: false,
      hours: 0,
      source: 'manual',
    }],
    pings: [
      { recorded_at: `${date}T00:00:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
      { recorded_at: `${date}T05:47:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
      { recorded_at: `${date}T07:00:00Z`, latitude: FA.lat, longitude: FA.lng, accuracy: 10 } as any,
    ],
  }));

  it('proposedWorkdayStart får INTE bli 00:00 enbart för att GPS låg på känd plats', () => {
    const m = buildModel();
    expect(m.proposedReport.proposedWorkdayStart).toBe(`${date}T05:47:00Z`);
    expect(m.proposedReport.proposedWorkdayStart).not.toBe(`${date}T00:00:00Z`);
  });

  it('skapar correction-anomaly som kräver granskning, inte auto-justering', () => {
    const m = buildModel();
    const preWd = m.proposedReport.anomalies.find(a => a.id.startsWith('pre-wd:'));
    expect(preWd).toBeDefined();
    expect(preWd!.severity).toBe('warning');
    // Suggestion ska indikera att admin måste välja, inte att vi auto-flyttar workday-start.
    expect(preWd!.suggestion ?? '').toMatch(/inga timers|stödjer arbete|manuellt|ignorera/i);
  });

  it('dayBlockTimeline klipper FA-blocket till workday-start 05:47, INTE 00:00', () => {
    const m = buildModel();
    const visitMap = new Map<string, VisitInfo>();
    for (const v of m.actualVisits) {
      visitMap.set(v.key, {
        knownSiteId: v.knownSiteId,
        label: v.label,
        durationMin: v.durationMin,
        end: v.end,
        centre: v.centre,
      });
    }
    const blocks = buildDayBlockTimeline({
      allEvents: m.actualEvents,
      actualVisits: m.actualVisits,
      visitByKey: visitMap,
      workContextStartIso: m.reportState.workday?.started_at ?? null,
    });

    const presence = blocks.filter((b): b is PresenceBlock => b.kind === 'presence');
    expect(presence.length).toBeGreaterThan(0);
    const fa = presence.find(b => b.placeKey === `site:${FA.id}`);
    expect(fa).toBeDefined();
    expect(fa!.startIso).toBe(`${date}T05:47:00Z`);
    expect(fa!.startIso).not.toBe(`${date}T00:00:00Z`);
    expect(fa!.clippedFromIso).toBe(`${date}T00:00:00Z`);
    expect(fa!.clippedReason).toBe('clipped_to_work_context_start');
  });
});
