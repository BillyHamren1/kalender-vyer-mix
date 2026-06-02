// @vitest-environment node
/**
 * StaffDayTimeline — kontrakts-test för den kanoniska UI-modellen.
 *
 * Den här filen LÅSER fältset och segment-mappning som ny tidrapporterings-UI
 * konsumerar. Om något här ändras MÅSTE konsumenter (StaffTimeReportsList,
 * StaffTimeReportDetail) granskas.
 */
import { describe, it, expect } from 'vitest';
import {
  buildStaffDayTimeline,
  type StaffDayTimeline,
} from '../staffDayTimeline';
import type { ActualStaffDayModel } from '../actualStaffDayModel';
import type { DayBlock, PresenceBlock, JourneyBlock, GapBlock } from '../dayBlockTimeline';

const emptyModel = (date: string, withWorkday = true): ActualStaffDayModel => ({
  date,
  actualEvents: [],
  planningItems: [],
  actualVisits: [],
  reportState: {
    workday: withWorkday
      ? {
          id: 'wd1',
          started_at: `${date}T07:00:00Z`,
          ended_at: `${date}T16:00:00Z`,
        }
      : null,
    timeReports: [],
    locationEntries: [],
    travelLogs: [],
  },
  proposedReport: {
    proposedWorkdayStart: null,
    proposedWorkdayEnd: null,
    distributedMinutes: 0,
    suggestedTravelMinutes: 0,
    undistributedMinutes: 0,
    anomalies: [],
  },
  lastPingAgeMin: null,
  signalLost: false,
  workStartDecision: {} as ActualStaffDayModel['workStartDecision'],
});

const presence = (overrides: Partial<PresenceBlock>): PresenceBlock => ({
  kind: 'presence',
  presenceKind: 'project',
  id: 'p1',
  startIso: '2026-05-06T08:00:00Z',
  endIso: '2026-05-06T12:00:00Z',
  durationMin: 240,
  placeKey: 'proj-x',
  title: 'Projekt X',
  subtitle: 'Storgatan 1',
  isProject: true,
  strength: 'strong_visit',
  requiresReview: false,
  ongoing: false,
  lastPingIso: null,
  sourceEventIds: [],
  innerEvents: [],
  timer: { startedIso: null, stoppedIso: null, active: false, present: false },
  timeReport: { startedIso: null, closedIso: null, present: false },
  arrivalIso: null,
  departureIso: null,
  plannedStartIso: null,
  sources: { timeReport: false, timer: false, gpsVisit: true, assistant: false },
  evidenceLabel: 'GPS',
  confidence: 'high',
  resolvedPlace: {
    label: 'Projekt X',
    lat: null,
    lng: null,
    mapUrl: null,
    lookupStatus: 'matched_internal',
  },
  ...overrides,
});

const journey = (overrides: Partial<JourneyBlock> = {}): JourneyBlock => ({
  kind: 'journey',
  id: 'j1',
  startIso: '2026-05-06T12:00:00Z',
  endIso: '2026-05-06T12:30:00Z',
  durationMin: 30,
  fromLabel: 'A',
  toLabel: 'B',
  fromPlaceKey: 'a',
  toPlaceKey: 'b',
  bothKnown: true,
  uncertain: false,
  sourceEventIds: [],
  innerEvents: [],
  fromPlace: { label: 'A', lat: null, lng: null, mapUrl: null, lookupStatus: 'matched_internal' },
  toPlace: { label: 'B', lat: null, lng: null, mapUrl: null, lookupStatus: 'matched_internal' },
  ...overrides,
});

const gap = (overrides: Partial<GapBlock> = {}): GapBlock => ({
  kind: 'gap',
  id: 'g1',
  startIso: '2026-05-06T13:00:00Z',
  endIso: '2026-05-06T13:30:00Z',
  durationMin: 30,
  expectedLabel: null,
  reason: 'no_signal',
  explanation: 'Ingen signal',
  innerEvents: [],
  ...overrides,
});

describe('buildStaffDayTimeline — fältkontrakt', () => {
  it('exponerar exakt det dokumenterade fältsetet', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [],
    });
    const keys = Object.keys(out).sort();
    expect(keys).toEqual(
      [
        'date',
        'evidence',
        'payable_minutes',
        'review_count',
        'review_required',
        'segments',
        'staff_id',
        'staff_name',
        'status',
        'workday_end',
        'workday_start',
        'workday_suggested',
      ],
    );
  });

  it('mappar presence(project) → segment.kind=project, payable=true', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [presence({})],
    });
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].kind).toBe('project');
    expect(out.segments[0].payable).toBe(true);
    expect(out.payable_minutes).toBe(240);
  });

  it('mappar presence(location) → warehouse, payable=true', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [presence({ id: 'p2', presenceKind: 'location', isProject: false })],
    });
    expect(out.segments[0].kind).toBe('warehouse');
    expect(out.segments[0].payable).toBe(true);
  });

  it('mappar presence(unknown) → unknown, reviewRequired=true, payable=false', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [presence({ id: 'p3', presenceKind: 'unknown', isProject: false })],
    });
    expect(out.segments[0].kind).toBe('unknown');
    expect(out.segments[0].reviewRequired).toBe(true);
    expect(out.segments[0].payable).toBe(false);
    expect(out.payable_minutes).toBe(0);
    expect(out.review_required).toBe(true);
  });

  it('mappar journey → travel, payable=true, label "Resa"', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [journey()],
    });
    expect(out.segments[0].kind).toBe('travel');
    // Ensam resa utan arbete blir unresolved och får "Behöver kontroll" i subtitle.
    expect(out.segments[0].label).toBe('Resa');
    expect(out.segments[0].payable).toBe(true);
    expect(out.segments[0].subtitle).toContain('A → B');
    expect(out.segments[0].travelAllocationReason).toBe('unresolved_travel_allocation');
  });


  it('mappar gap → unknown, reviewRequired=true, ej payable', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [gap()],
    });
    expect(out.segments[0].kind).toBe('unknown');
    expect(out.segments[0].reviewRequired).toBe(true);
    expect(out.segments[0].payable).toBe(false);
    expect(out.review_required).toBe(true);
  });

  it('status=no_workday när workday saknas och inga segments finns', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06', false),
      blocks: [],
    });
    expect(out.status).toBe('no_workday');
  });

  it('status=closed för avslutad workday utan reviews', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [presence({})],
    });
    expect(out.status).toBe('closed');
  });

  it('status=review_required när unknown-block eller anomalies finns', () => {
    const m = emptyModel('2026-05-06');
    m.proposedReport.anomalies.push({
      id: 'a1',
      label: 'Test',
      detail: 'd',
      severity: 'warning',
    });
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: m,
      blocks: [presence({})],
    });
    expect(out.status).toBe('review_required');
    expect(out.review_count).toBeGreaterThan(0);
  });

  it('sorterar segments kronologiskt', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [
        gap({ id: 'g', startIso: '2026-05-06T15:00:00Z', endIso: '2026-05-06T15:30:00Z' }),
        presence({ id: 'p', startIso: '2026-05-06T08:00:00Z', endIso: '2026-05-06T12:00:00Z' }),
        journey({ id: 'j', startIso: '2026-05-06T12:00:00Z', endIso: '2026-05-06T12:30:00Z' }),
      ],
    });
    expect(out.segments.map((s) => s.id)).toEqual(['p', 'j', 'g']);
  });

  it('payable_minutes summerar endast project + warehouse + travel', () => {
    const out = buildStaffDayTimeline({
      staff_id: 's1',
      staff_name: 'Anna',
      model: emptyModel('2026-05-06'),
      blocks: [
        presence({ id: 'p1', durationMin: 100 }), // project = +100
        presence({ id: 'p2', presenceKind: 'location', isProject: false, durationMin: 50 }), // warehouse = +50
        presence({ id: 'p3', presenceKind: 'unknown', isProject: false, durationMin: 999 }), // unknown = 0
        journey({ durationMin: 30 }), // travel = +30
        gap({ durationMin: 999 }), // unknown = 0
      ],
    });
    expect(out.payable_minutes).toBe(180);
  });
});

// Smoke: type-snapshot så TS-kontrakt inte tappas av misstag.
const _typecheck: StaffDayTimeline = {
  staff_id: '',
  staff_name: '',
  date: '',
  workday_start: null,
  workday_end: null,
  workday_suggested: false,
  status: 'open',
  payable_minutes: 0,
  segments: [],
  review_required: false,
  review_count: 0,
  evidence: {},
};
void _typecheck;
