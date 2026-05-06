// @vitest-environment node
/**
 * StaffDayTimeline — UI scenario contract.
 *
 * Låser att huvudvyn (segments + status + payable_minutes + label) bara
 * exponerar StaffDayTimeline-modellen — aldrig GPS-rådata, assistant_events,
 * tekniska auto-repair-källor eller automagisk travel för långa glapp.
 *
 * Speglar de 10 UI-scenarierna i instruktionen så att en regression genast
 * fångas på kontraktsnivå (utan att rendera React).
 */
import { describe, it, expect } from 'vitest';
import {
  buildStaffDayTimeline,
  type StaffDayTimeline,
} from '../staffDayTimeline';
import type { ActualStaffDayModel } from '../actualStaffDayModel';
import type { DayBlock, PresenceBlock, JourneyBlock, GapBlock } from '../dayBlockTimeline';
import {
  evaluateDayApprovability,
  evaluateAdminTimeReview,
  type ReviewWorkdayInput,
} from '../../admin/adminTimeReviewEngine';

// ── Fabriker ─────────────────────────────────────────────────────────

const baseModel = (
  date: string,
  workday: { started_at: string; ended_at: string | null } | null = {
    started_at: `${date}T07:00:00Z`,
    ended_at: `${date}T16:00:00Z`,
  },
): ActualStaffDayModel => ({
  date,
  actualEvents: [],
  planningItems: [],
  actualVisits: [],
  reportState: {
    workday: workday ? { id: 'wd1', ...workday } : null,
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

const presence = (overrides: Partial<PresenceBlock> = {}): PresenceBlock => ({
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

const gap = (overrides: Partial<GapBlock> = {}): GapBlock => ({
  kind: 'gap',
  id: 'g1',
  startIso: '2026-05-06T13:00:00Z',
  endIso: '2026-05-06T13:30:00Z',
  durationMin: 30,
  expectedLabel: 'Glapp i GPS',
  reason: 'no_signal',
  explanation: 'Signal tappad mellan 13:00 och 13:30',
  innerEvents: [],
  ...overrides,
});

const buildPerson = (
  staffId: string,
  blocks: DayBlock[],
  modelOverrides?: (m: ActualStaffDayModel) => void,
) => {
  const m = baseModel('2026-05-06');
  modelOverrides?.(m);
  return buildStaffDayTimeline({
    staff_id: staffId,
    staff_name: `Person ${staffId}`,
    model: m,
    blocks,
  });
};

// ── Scenarier ────────────────────────────────────────────────────────

describe('StaffDayTimeline UI-scenarios', () => {
  // 1. Workday + projektsegment ger clean timeline.
  it('1) workday + projekt → status=closed, ett rent project-segment, inga reviews', () => {
    const out = buildPerson('s1', [presence({})]);
    expect(out.segments).toHaveLength(1);
    expect(out.segments[0].kind).toBe('project');
    expect(out.segments[0].label).toBe('Projekt X');
    expect(out.review_required).toBe(false);
    expect(out.status).toBe('closed');
  });

  // 2. Workday utan time_reports → unknown men kan godkännas.
  it('2) workday utan time_reports → segment finns (gap som "Ej fördelat") och dagen är godkännbar', () => {
    const out = buildPerson('s1', [
      gap({
        id: 'g-full',
        startIso: '2026-05-06T07:00:00Z',
        endIso: '2026-05-06T16:00:00Z',
        durationMin: 540,
      }),
    ]);
    // Huvudvyn visar "Ej fördelat", inte teknisk explanation:
    expect(out.segments[0].kind).toBe('unknown');
    expect(out.segments[0].label).toBe('Ej fördelat');
    expect(out.segments[0].subtitle).toBeNull();

    // Approvability: oallokerad tid är `info` → blockerar inte (testas i scenario 7).
    const review = evaluateAdminTimeReview({
      workday: { started_at: '2026-05-06T07:00:00Z', ended_at: '2026-05-06T16:00:00Z' },
      workEntries: [],
    });
    const ap = evaluateDayApprovability(review, {
      workday: { started_at: '2026-05-06T07:00:00Z', ended_at: '2026-05-06T16:00:00Z' },
    });
    expect(ap.canApprove).toBe(true);
  });

  // 3. GPS-rådata visas inte som huvudsegment.
  it('3) huvudvyns segments innehåller bara project/travel/warehouse/break/other/unknown — aldrig GPS-rådata', () => {
    const out = buildPerson('s1', [presence({}), gap({})]);
    const allowed = new Set(['project', 'travel', 'warehouse', 'break', 'other', 'unknown']);
    for (const s of out.segments) {
      expect(allowed.has(s.kind)).toBe(true);
      // Ingen rå evidence-label får läcka in i huvudfältet:
      expect(s.label).not.toMatch(/gps_|server_background|backfill|auto_repair|gps_on_known_work_site/i);
    }
  });

  // 4. assistant_events visas bara i evidence, aldrig som segments.
  it('4) assistant_events exponeras i evidence, inte i segments', () => {
    const out = buildPerson('s1', [presence({})]);
    expect(out.evidence).toBeDefined();
    expect(Array.isArray(out.evidence.assistantEventIds)).toBe(true);
    // Huvudvyn ska aldrig ha en segment med kind='assistant' eller liknande.
    for (const s of out.segments) {
      expect(s.kind).not.toMatch(/assistant|event|raw/);
    }
  });

  // 5. Dubbla workdays / överlappande aktivitet → review_required.
  it('5) överlappande aktivitet ger anomaly + status=review_required', () => {
    const review = evaluateAdminTimeReview({
      workday: { started_at: '2026-05-06T07:00:00Z', ended_at: '2026-05-06T16:00:00Z' },
      workEntries: [
        { id: 'a', start_time: '2026-05-06T08:00:00Z', end_time: '2026-05-06T11:00:00Z', hours_worked: 3 },
        { id: 'b', start_time: '2026-05-06T10:30:00Z', end_time: '2026-05-06T12:00:00Z', hours_worked: 1.5 },
      ],
    });
    expect(review.anomalies.some((a) => a.kind === 'overlap')).toBe(true);

    // På timeline-sidan: lägg in en anomaly i model och säkerställ status flippar.
    const out = buildPerson('s1', [presence({})], (m) => {
      m.proposedReport.anomalies.push({
        id: 'overlap',
        label: 'Överlappande aktivitet',
        detail: 'Två time_reports överlappar',
        severity: 'warning',
      });
    });
    expect(out.status).toBe('review_required');
    expect(out.review_count).toBeGreaterThan(0);
  });

  // 6. Travel gap >180 min blir unknown/review, inte automatisk resa.
  it('6) ett 4-timmars glapp får ALDRIG bli ett travel-segment automatiskt', () => {
    const longGap = gap({
      id: 'g-long',
      startIso: '2026-05-06T08:00:00Z',
      endIso: '2026-05-06T12:00:00Z',
      durationMin: 240,
    });
    const out = buildPerson('s1', [longGap]);
    expect(out.segments[0].kind).toBe('unknown');
    expect(out.segments[0].kind).not.toBe('travel');
    expect(out.segments[0].reviewRequired).toBe(true);
    expect(out.segments[0].payable).toBe(false);
    expect(out.segments[0].label).toBe('Ej fördelat');
  });

  // 7. Oallokerad tid blockerar inte godkännande.
  it('7) anomaly unallocated_time är severity=info och blockerar inte approve', () => {
    const review = evaluateAdminTimeReview({
      workday: { started_at: '2026-05-06T07:00:00Z', ended_at: '2026-05-06T16:00:00Z' },
      workEntries: [
        // 4h reported i en 9h-workday → 5h ofördelat
        { id: 'a', start_time: '2026-05-06T08:00:00Z', end_time: '2026-05-06T12:00:00Z', hours_worked: 4 },
      ],
    });
    const unallocated = review.anomalies.find((a) => a.kind === 'unallocated_time');
    expect(unallocated).toBeDefined();
    expect(unallocated!.severity).toBe('info');

    const ap = evaluateDayApprovability(review, {
      workday: { started_at: '2026-05-06T07:00:00Z', ended_at: '2026-05-06T16:00:00Z' },
    });
    expect(ap.canApprove).toBe(true);
    expect(ap.blockers).not.toContain('unresolved_critical_anomaly');
  });

  // 8. Auto-repair / synthetic stop syns inte som huvudsegment.
  it('8) ett block som "ser ut som" auto-repair får aldrig leaka tekniska labels in i segments', () => {
    // Simulerar att ett presence-block hade evidenceLabel="auto_repair_from_timer"
    // — det får INTE gå in i huvudfältet `label`.
    const out = buildPerson('s1', [
      presence({
        id: 'p-auto',
        evidenceLabel: 'auto_repair_from_timer',
        // Den mänskliga labeln kommer alltid från resolvedPlace.label / title:
        title: 'Projekt X',
      }),
    ]);
    expect(out.segments[0].label).toBe('Projekt X');
    expect(out.segments[0].label).not.toMatch(/auto_repair|backfill|server_background/i);
  });

  // 9. Aktiv timer / pågående segment exponeras med ongoing=true (driver "På projekt nu"-UI).
  it('9) pågående presence → ongoing=true och endIso=null, status=open', () => {
    const out = buildPerson(
      's1',
      [
        presence({
          id: 'p-ongoing',
          ongoing: true,
          endIso: null as unknown as string,
          durationMin: 120,
        }),
      ],
      (m) => {
        m.reportState.workday = {
          id: 'wd1',
          started_at: '2026-05-06T07:00:00Z',
          ended_at: null, // workday öppen
        };
      },
    );
    expect(out.segments[0].ongoing).toBe(true);
    expect(out.segments[0].endIso).toBeNull();
    // En öppen workday + pågående segment = inte "closed".
    expect(out.status).not.toBe('closed');
  });

  // 10. Alla personer får samma struktur oavsett datakälla.
  it('10) tre olika personer → identiskt nyckelset på StaffDayTimeline', () => {
    const a = buildPerson('a', [presence({})]); // ren projektdag
    const b = buildPerson('b', [gap({})]); // bara glapp
    const c = buildPerson('c', []); // tom dag
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    const keysC = Object.keys(c).sort();
    expect(keysB).toEqual(keysA);
    expect(keysC).toEqual(keysA);
    // …och alla segment har samma fältsignatur:
    const segKeys = (t: StaffDayTimeline) =>
      t.segments[0] ? Object.keys(t.segments[0]).sort() : [];
    expect(segKeys(b)).toEqual(segKeys(a));
  });
});
