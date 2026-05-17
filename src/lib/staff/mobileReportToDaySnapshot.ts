/**
 * mobileReportToDaySnapshot — adapter from the new MobileDayReport
 * (Time Engine cache via get-mobile-staff-day-report) to the legacy
 * StaffDaySnapshot shape consumed by TodayTab / TimeReportTab /
 * StaffDayDetailSheet.
 *
 * Pure mapping. No DB, no recomputation.
 */
import type { MobileDayReport, MobileSegment, MobileSegmentKind } from '@/types/mobileDayReport';
import type {
  StaffDayActive,
  StaffDayActionNeeded,
  StaffDaySegment,
  StaffDaySegmentKind,
  StaffDaySnapshot,
  StaffDayTotals,
} from '@/hooks/useStaffDaySnapshot';

const MAX_SEG_MS = 18 * 60 * 60 * 1000;

function mapKind(k: MobileSegmentKind): StaffDaySegmentKind {
  switch (k) {
    case 'project': return 'project';
    case 'booking': return 'booking';
    case 'large_project': return 'booking';
    case 'warehouse': return 'warehouse';
    case 'location': return 'location';
    case 'travel': return 'travel';
    case 'break': return 'break';
    case 'needs_review': return 'other_place';
    case 'unknown': return 'unknown';
    default: return 'unknown';
  }
}

function mapSegment(s: MobileSegment): StaffDaySegment {
  return {
    kind: mapKind(s.kind),
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    durationMinutes: s.durationMinutes,
    isActive: s.isActive,
    label: s.label,
    source: 'mobile_day_report',
    statusLabel: s.statusLabel,
    confidence: (s as any).confidence ?? null,
    warningLabel: (s as any).warningLabel ?? null,
    refs: {
      bookingId: s.bookingId,
      largeProjectId: s.largeProjectId,
      locationId: s.locationId,
    },
    approved: null,
  };
}

function buildActive(report: MobileDayReport): StaffDayActive | null {
  const last = report.segments[report.segments.length - 1];
  if (!last || !last.isActive) return null;
  const started = new Date(last.startedAt).getTime();
  const dur = Number.isFinite(started)
    ? Math.max(0, Math.round((Date.now() - started) / 60_000))
    : last.durationMinutes;
  // Clamp absurd values too.
  const safeDur = dur > 18 * 60 ? last.durationMinutes : dur;
  const kind: StaffDayActive['kind'] =
    last.kind === 'travel' ? 'location'
    : last.kind === 'project' || last.kind === 'large_project' ? 'project'
    : last.kind === 'location' || last.kind === 'warehouse' ? 'location'
    : 'booking';
  return {
    kind,
    startedAt: last.startedAt,
    durationMinutes: safeDur,
    label: last.label,
    statusLabel: last.statusLabel,
    confidence: null,
    locationEntryId: last.sourceBlockId || last.id,
    bookingId: last.bookingId,
    largeProjectId: last.largeProjectId,
    locationId: last.locationId,
  };
}

function buildTotals(report: MobileDayReport): StaffDayTotals {
  const sum = report.summary;
  // Sanity: gross from workday window if present, else fall back to summary.
  let gross = sum.workMinutes + sum.travelMinutes; // workable minutes
  if (report.workday?.startedAt) {
    const start = new Date(report.workday.startedAt).getTime();
    const end = report.workday.endedAt
      ? new Date(report.workday.endedAt).getTime()
      : Date.now();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const wallMin = Math.round((end - start) / 60_000);
      // Drop ghost workdays > 18h.
      if (wallMin <= 18 * 60) gross = wallMin;
    }
  }
  return {
    workdayMinutes: gross,
    allocatedProjectMinutes: sum.workMinutes,
    travelMinutes: sum.travelMinutes,
    unallocatedMinutes: 0,
    liveMinutes: 0,
    isWorkdayOpen: !!report.workday?.isOpen,
    grossWorkdayMinutes: gross,
    breakMinutes: sum.breakMinutes,
    payableMinutes: sum.payableMinutes,
    projectMinutes: sum.workMinutes,
    transportMinutes: sum.travelMinutes,
    otherPlaceMinutes: sum.reviewMinutes,
  };
}

function mapActions(report: MobileDayReport): StaffDayActionNeeded[] {
  return report.actionsNeeded.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    severity: a.severity,
  }));
}

export function mobileReportToDaySnapshot(report: MobileDayReport): StaffDaySnapshot {
  // Drop ghost segments > 18h (defence-in-depth — server already filters).
  const safeSegments = report.segments.filter((s) => {
    if (!s.endedAt) return true;
    const a = new Date(s.startedAt).getTime();
    const b = new Date(s.endedAt).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
    return b - a <= MAX_SEG_MS;
  });

  const wd = report.workday;
  return {
    date: report.date,
    staffId: report.staffId,
    workday: wd
      ? {
          id: 'mobile-report',
          startedAt: wd.startedAt,
          endedAt: wd.endedAt,
          isOpen: wd.isOpen,
          statusLabel: wd.isOpen ? 'Arbetsdag igång' : 'Arbetsdag avslutad',
          reviewStatus: null,
          reviewReasons: [],
          approved: false,
          adminNote: null,
          durationMinutes: 0,
        }
      : null,
    active: buildActive({ ...report, segments: safeSegments }),
    totals: buildTotals({ ...report, segments: safeSegments }),
    segments: safeSegments.map(mapSegment),
    flags: [],
    actionsNeeded: mapActions(report),
    trackingPolicy: report.trackingPolicy as any,
    assistantEvents: [],
    attestation: report.submission
      ? {
          id: 'mobile-submission',
          breakMinutes: report.submission.breakMinutes,
          comment: report.submission.comment,
          status: report.submission.status === 'approved' ? 'locked' : 'attested',
          attestedAt: report.submission.submittedAt,
          attestedBy: null,
          locked: report.submission.status === 'approved',
          requestedStartAt: report.submission.requestedStartAt,
          requestedEndAt: report.submission.requestedEndAt,
        }
      : null,
    lastUpdatedAt: report.lastUpdatedAt ?? new Date().toISOString(),
    // Time Legacy Purge 4 — bär GPS evidence till UI utan att räkna som arbete.
    gpsEvidence: (report as any).gpsEvidence ?? null,
  };
}
