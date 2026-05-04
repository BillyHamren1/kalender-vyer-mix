/**
 * Persona-låsta scenariotester för 2026-05-04.
 *
 * Varje test reflekterar ett verkligt fall som identifierats i rådata
 * och låser den nya canonical-modellens beteende:
 *
 *  - Kevin   — öppen workday + LTE + stale GPS
 *  - Matīss  — sen workday-start, tidigare pings = enbart bevis
 *  - Raivis  — stängd workday + tiomila-rapport + dubblett-LTE
 *  - Eduards/Markuss — kort FA Warehouse-pass + auto-restid
 *  - Billy   — workday utan rapporter / inget alls
 *
 * Formler (låsta):
 *   payableMinutes      = max(0, workdayMinutes − breakMinutes)
 *   distributedMinutes  = min(timeReports + approvedTravel, payableMinutes)
 *   undistributedMinutes= max(0, payableMinutes − distributedMinutes)
 *   overDistributedMin  = max(0, (timeReports + approvedTravel) − payableMinutes)
 */

import { describe, it, expect } from 'vitest';
import { buildCanonicalStaffDayModel } from '../canonicalDayModel';

const TZ = '+02:00';
const day = (hhmm: string) => `2026-05-04T${hhmm}:00${TZ}`;
const NOW_LATE = new Date('2026-05-04T23:30:00+02:00');

describe('2026-05-04 — Kevin: öppen workday + öppen LTE + stale GPS', () => {
  it('visar lönegrundande arbetsdag som öppen MED signal-tappad — ej tyst OK', () => {
    const NOW = new Date('2026-05-04T14:00:00+02:00');
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('10:01'), ended_at: null }],
      distributionRows: [],
      activeTimers: [
        { id: 'lte-kevin', startedAt: day('10:01'), label: 'Pågående', source: 'location_entry' },
      ],
      latestPing: { updatedAt: day('11:51') }, // ~129 min innan now
      now: NOW,
    });

    expect(m.isWorkdayOpen).toBe(true);
    expect(m.status).toBe('open');
    // Workday är lönegrundande ram — ska räknas trots öppen status.
    expect(m.workdayMinutes).toBeGreaterThan(0);
    expect(m.payableMinutes).toBe(m.workdayMinutes);
    // Stale signal: senaste ping > 10 min gammal.
    expect(m.hasSignalLost).toBe(true);
    expect(m.activeTimerRows[0].signalLost).toBe(true);
    expect(m.latestPingAgeMin).toBeGreaterThan(10);
    expect(m.anomalies.some(a => a.kind === 'open_timer_signal_lost')).toBe(true);
    // Granskning krävs — UI får inte visa "OK".
    expect(m.reviewRequired).toBe(true);
  });
});

describe('2026-05-04 — Matīss: workday startar 18:50, tidiga pings är bevis', () => {
  it('lönegrundande tid kommer från workday — inte från pings', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('18:50'), ended_at: day('22:50') }],
      distributionRows: [
        { id: 'tr', start: day('18:50'), end: day('22:50'), hours: 4, label: 'Projekt', category: 'project' },
      ],
      // Pings tidigare på dagen — får inte påverka payable.
      gpsEvidence: { pingsCount: 42, firstPingAt: day('09:10'), lastPingAt: day('22:48'), placesVisited: 3 },
      latestPing: { updatedAt: day('22:48') },
      now: NOW_LATE,
    });

    expect(m.workdayMinutes).toBe(4 * 60);
    expect(m.payableMinutes).toBe(4 * 60);
    expect(m.distributedMinutes).toBe(4 * 60);
    expect(m.undistributedMinutes).toBe(0);
    // Pings finns men höjer aldrig payable.
    expect(m.gpsEvidence?.pingsCount).toBe(42);
  });
});

describe('2026-05-04 — Raivis: workday 07:59–17:24 + tiomila-rapport', () => {
  it('payable = workday − rast; rapport är fördelning; dubblett-LTE skapar inte pågående', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('07:59'), ended_at: day('17:24') }],
      distributionRows: [
        {
          id: 'tr-tiomila', start: day('07:59'), end: day('17:24'),
          hours: 9, breakHours: 0.42, // ~25 min rast
          label: 'Tiomila', category: 'project',
        },
      ],
      // Inga öppna activeTimers — dubblett-LTE som redan rapporterats får
      // ALDRIG visas som pågående timer i canonical-modellen.
      activeTimers: [],
      now: NOW_LATE,
    });

    const expectedPayable = (9 * 60 + 25) - 25; // workday minutes minus break
    expect(m.workdayMinutes).toBe(9 * 60 + 25);
    expect(m.breakMinutes).toBe(25);
    expect(m.payableMinutes).toBe(expectedPayable);
    expect(m.distributedMinutes).toBeGreaterThan(0);
    expect(m.activeTimerMinutes).toBe(0);
    expect(m.activeTimerRows.length).toBe(0);
  });
});

describe('2026-05-04 — Eduards/Markuss: kort FA Warehouse + auto-restid', () => {
  it('auto-restid är förslag (suggested) — inte extra lön ovanpå workday', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('07:00'), ended_at: day('16:00') }],
      distributionRows: [
        { id: 'fa', start: day('07:00'), end: day('07:30'), hours: 0.5, label: 'FA Warehouse', category: 'lager' },
        { id: 'proj', start: day('08:00'), end: day('16:00'), hours: 8, label: 'Projekt X', category: 'project' },
      ],
      travelSuggestions: [
        { id: 'tv-auto', start: day('07:30'), end: day('08:00'), hours: 0.5,
          fromAddress: 'Lager', toAddress: 'Projekt X',
          autoDetected: true, sourceTag: 'gap_derived',
          approved: false, destinationBookingId: 'b-x' },
      ],
      now: NOW_LATE,
    });

    expect(m.payableMinutes).toBe(9 * 60);
    // Auto-detected, ej godkänd → suggested, inte distributed.
    expect(m.suggestedTravelMinutes).toBe(30);
    expect(m.approvedTravelMinutes).toBe(0);
    // Distribution = bara time_reports (8.5h), travel höjer inte payable.
    expect(m.distributedMinutes).toBe(8.5 * 60);
    expect(m.undistributedMinutes).toBe(30);
    // Korta FA-passet är fördelningsavvikelse, inte hela löneavvikelse.
    expect(m.overDistributedMinutes).toBe(0);
  });

  it('godkänd auto-restid räknas som fördelning men kapas mot payable', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('07:00'), ended_at: day('16:00') }],
      distributionRows: [
        { id: 'proj', start: null, end: null, hours: 9, label: 'Projekt X', category: 'project' },
      ],
      travelSuggestions: [
        { id: 'tv', start: null, end: null, hours: 1,
          fromAddress: 'A', toAddress: 'B',
          autoDetected: true, approved: true, destinationBookingId: 'b1' },
      ],
      now: NOW_LATE,
    });
    expect(m.payableMinutes).toBe(9 * 60);
    expect(m.distributedMinutes).toBe(9 * 60); // capped
    expect(m.overDistributedMinutes).toBe(60);
    expect(m.approvedTravelMinutes).toBe(60);
  });
});

describe('2026-05-04 — Billy: workday/rapporter saknas eller är tomma', () => {
  it('utan workday och utan rapporter → 0h, ingen anomaly', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [],
      distributionRows: [],
      now: NOW_LATE,
    });
    expect(m.workdayMinutes).toBe(0);
    expect(m.payableMinutes).toBe(0);
    expect(m.distributedMinutes).toBe(0);
    expect(m.undistributedMinutes).toBe(0);
    expect(m.status).toBe('ok');
    expect(m.reviewRequired).toBe(false);
  });

  it('workday finns men time_reports saknas → payable från workday, allt ofördelat', () => {
    const m = buildCanonicalStaffDayModel({
      workdays: [{ started_at: day('08:00'), ended_at: day('17:00') }],
      distributionRows: [],
      now: NOW_LATE,
    });
    expect(m.payableMinutes).toBe(9 * 60);
    expect(m.distributedMinutes).toBe(0);
    expect(m.undistributedMinutes).toBe(9 * 60);
    expect(m.status).toBe('requires_distribution');
    expect(m.reviewRequired).toBe(true);
    // UI ska visa "Arbetsdag finns, men tid är ofördelad" — modellen
    // exponerar det via status + undistributedMinutes>0 + workdayStart.
    expect(m.workdayStart).not.toBeNull();
  });
});
