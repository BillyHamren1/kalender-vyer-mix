/**
 * Versioned READ-ONLY boundary against the EventFlow Time handoff contract.
 *
 * Planning never reads Time tables directly and never writes Planning-owned
 * source records (bookings, projects, customers, locations, schedules,
 * assignments) through this module. Everything here is a typed projection of
 * Time's own versioned adapter contract.
 *
 * Time evidence this boundary targets:
 *  - Time commit                 2c80569eb4ff0b4864183c26d23398eafd3ef31f
 *  - Adapter contract commit     89cb089ceaa57197d4eeb8bd22a3f7b2aebdf809
 */

export const TIME_V2_CONTRACT_VERSION = 'v1' as const;

export const TIME_V2_ENDPOINTS = {
  sourceStatus: 'source-status',
  personnelAccounts: 'personnel-accounts',
  reviewQueue: 'review-queue',
  dayDetail: 'day-detail',
  corrections: 'corrections',
  attestability: 'attestability',
  preview: 'preview',
} as const;

export type TimeV2EndpointKey = keyof typeof TIME_V2_ENDPOINTS;

export function timeV2EndpointPath(key: TimeV2EndpointKey): string {
  return `/api/time/${TIME_V2_CONTRACT_VERSION}/${TIME_V2_ENDPOINTS[key]}`;
}

export function buildTimeV2Url(
  baseUrl: string,
  key: TimeV2EndpointKey,
  params?: Record<string, string | undefined>,
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const url = new URL(base + timeV2EndpointPath(key));
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

/* ------------------------------- read models ------------------------------ */

export interface TimeV2SourceStatus {
  contractVersion: string;
  /** ISO timestamp of the newest data the Time source has produced. */
  generatedAt: string | null;
  /** Seconds since generatedAt, computed client-side at render time. */
  staging: boolean;
  healthy: boolean;
  message: string | null;
}

export interface TimeV2PersonnelAccountStatus {
  totalPersonnel: number;
  withActiveAppAccount: number;
  invitedNotActivated: number;
  blocked: number;
}

export interface TimeV2ReviewQueueCounts {
  submitted: number;
  awaitingCorrection: number;
  resubmitted: number;
  readyForAttest: number;
  attested: number;
}

export interface TimeV2Overview {
  source: TimeV2SourceStatus;
  personnel: TimeV2PersonnelAccountStatus;
  reviewQueue: TimeV2ReviewQueueCounts;
  /** Whether Time reports this tenant's days as independently attestable. */
  independentlyAttestable: boolean;
  previewAvailable: boolean;
}

/* ------------------------------ normalisation ----------------------------- */

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const bool = (v: unknown): boolean => v === true;

export function normalizeSourceStatus(raw: unknown): TimeV2SourceStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    contractVersion: str(r.contract_version ?? r.contractVersion) ?? TIME_V2_CONTRACT_VERSION,
    generatedAt: str(r.generated_at ?? r.generatedAt),
    staging: bool(r.staging),
    healthy: r.healthy === undefined ? true : bool(r.healthy),
    message: str(r.message),
  };
}

export function normalizePersonnel(raw: unknown): TimeV2PersonnelAccountStatus {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    totalPersonnel: num(r.total_personnel ?? r.totalPersonnel),
    withActiveAppAccount: num(r.with_active_app_account ?? r.withActiveAppAccount),
    invitedNotActivated: num(r.invited_not_activated ?? r.invitedNotActivated),
    blocked: num(r.blocked),
  };
}

export function normalizeReviewQueue(raw: unknown): TimeV2ReviewQueueCounts {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    submitted: num(r.submitted),
    awaitingCorrection: num(r.awaiting_correction ?? r.awaitingCorrection),
    resubmitted: num(r.resubmitted),
    readyForAttest: num(r.ready_for_attest ?? r.readyForAttest),
    attested: num(r.attested),
  };
}

export function normalizeOverview(raw: unknown): TimeV2Overview {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    source: normalizeSourceStatus(r.source ?? r.source_status),
    personnel: normalizePersonnel(r.personnel ?? r.personnel_accounts),
    reviewQueue: normalizeReviewQueue(r.review_queue ?? r.reviewQueue),
    independentlyAttestable: bool(r.independently_attestable ?? r.independentlyAttestable),
    previewAvailable: bool(r.preview_available ?? r.previewAvailable),
  };
}

/** Human-readable freshness label. Never invents a value. */
export function describeFreshness(generatedAt: string | null, now: Date = new Date()): string {
  if (!generatedAt) return 'Okänd färskhet';
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return 'Okänd färskhet';
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60000));
  if (mins < 1) return 'Uppdaterad nyss';
  if (mins < 60) return `Uppdaterad för ${mins} min sedan`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Uppdaterad för ${hours} h sedan`;
  return `Uppdaterad för ${Math.round(hours / 24)} dygn sedan`;
}

/* ============================ review queue (v1) ============================ */

/** Canonical queue groups exposed by the Time contract. */
export const TIME_V2_QUEUE_GROUPS = ['needs_review', 'correction', 'approved', 'missing'] as const;
export type TimeV2QueueGroup = (typeof TIME_V2_QUEUE_GROUPS)[number];

export const TIME_V2_QUEUE_GROUP_LABELS: Record<TimeV2QueueGroup, string> = {
  needs_review: 'Behöver granskas',
  correction: 'Korrigering pågår',
  approved: 'Godkända',
  missing: 'Saknas',
};

export interface TimeV2QueueRow {
  submissionId: string;
  group: TimeV2QueueGroup;
  /** Contract state string exactly as Time reports it. */
  state: string;
  date: string;               // YYYY-MM-DD
  personnelId: string | null;
  personnelName: string;
  projectId: string | null;
  projectName: string | null;
  totalMinutes: number;
  travelMinutes: number;
  breakMinutes: number;
  revision: number;
  submittedAt: string | null;
  correctionRequestedAt: string | null;
  resubmittedAt: string | null;
  attestable: boolean;
  payrollAttestable: boolean;
  projectAttestable: boolean;
  isTestFixture: boolean;
}

export interface TimeV2ReviewQueue {
  contractVersion: string;
  generatedAt: string | null;
  stale: boolean;
  rows: TimeV2QueueRow[];
}

export interface TimeV2QueueFilters {
  from?: string;
  to?: string;
  personnelId?: string;
  projectId?: string;
  group?: TimeV2QueueGroup | 'all';
  query?: string;
}

const parseGroup = (v: unknown): TimeV2QueueGroup => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (TIME_V2_QUEUE_GROUPS as readonly string[]).includes(s) ? (s as TimeV2QueueGroup) : 'missing';
};

export function normalizeQueueRow(raw: unknown): TimeV2QueueRow | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.submission_id ?? r.submissionId ?? r.id);
  const date = str(r.date ?? r.work_date ?? r.workDate);
  if (!id || !date) return null;
  return {
    submissionId: id,
    group: parseGroup(r.group ?? r.queue_group ?? r.queueGroup),
    state: str(r.state ?? r.status) ?? 'unknown',
    date,
    personnelId: str(r.personnel_id ?? r.personnelId),
    personnelName: str(r.personnel_name ?? r.personnelName) ?? 'Okänd personal',
    projectId: str(r.project_id ?? r.projectId),
    projectName: str(r.project_name ?? r.projectName),
    totalMinutes: num(r.total_minutes ?? r.totalMinutes),
    travelMinutes: num(r.travel_minutes ?? r.travelMinutes),
    breakMinutes: num(r.break_minutes ?? r.breakMinutes),
    revision: num(r.revision),
    submittedAt: str(r.submitted_at ?? r.submittedAt),
    correctionRequestedAt: str(r.correction_requested_at ?? r.correctionRequestedAt),
    resubmittedAt: str(r.resubmitted_at ?? r.resubmittedAt),
    attestable: bool(r.attestable),
    payrollAttestable: bool(r.payroll_attestable ?? r.payrollAttestable),
    projectAttestable: bool(r.project_attestable ?? r.projectAttestable),
    isTestFixture: bool(r.is_test_fixture ?? r.isTestFixture ?? r.test_fixture),
  };
}

export function normalizeReviewQueueList(raw: unknown): TimeV2ReviewQueue {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.rows) ? r.rows : Array.isArray(r.items) ? r.items : Array.isArray(raw) ? (raw as unknown[]) : [];
  return {
    contractVersion: str(r.contract_version ?? r.contractVersion) ?? TIME_V2_CONTRACT_VERSION,
    generatedAt: str(r.generated_at ?? r.generatedAt),
    stale: bool(r.stale),
    rows: list.map(normalizeQueueRow).filter((x): x is TimeV2QueueRow => x !== null),
  };
}

/** Pure client-side filtering over contract fields only. Never re-derives time. */
export function filterQueueRows(rows: TimeV2QueueRow[], f: TimeV2QueueFilters): TimeV2QueueRow[] {
  const q = (f.query ?? '').trim().toLowerCase();
  return rows.filter((row) => {
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
    if (f.personnelId && row.personnelId !== f.personnelId) return false;
    if (f.projectId && row.projectId !== f.projectId) return false;
    if (f.group && f.group !== 'all' && row.group !== f.group) return false;
    if (q) {
      const hay = `${row.personnelName} ${row.projectName ?? ''} ${row.state}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function groupQueueRows(rows: TimeV2QueueRow[]): Record<TimeV2QueueGroup, TimeV2QueueRow[]> {
  const out = { needs_review: [], correction: [], approved: [], missing: [] } as Record<TimeV2QueueGroup, TimeV2QueueRow[]>;
  for (const r of rows) out[r.group].push(r);
  return out;
}

/* ========================== submission detail (v1) ========================= */

export interface TimeV2SnapshotSegment {
  id: string;
  kind: string;              // work | travel | break | gap ... exactly as Time reports
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  minutes: number;
  targetId: string | null;
  targetName: string | null;
  locked: boolean;
  note: string | null;
}

export interface TimeV2DecisionEntry {
  id: string;
  at: string | null;
  actor: string | null;
  action: string;
  comment: string | null;
  revision: number;
}

export interface TimeV2EvidenceRef {
  id: string;
  kind: string;              // scan | message | photo | document
  label: string;
  at: string | null;
  /** Bounded reference only — Planning never inlines or re-derives evidence. */
  reference: string | null;
}

export interface TimeV2SubmissionDetail {
  submissionId: string;
  date: string;
  personnelName: string;
  personnelId: string | null;
  state: string;
  group: TimeV2QueueGroup;
  revision: number;
  submittedAt: string | null;
  /** Immutable payload hash/version reported by Time for the frozen snapshot. */
  snapshotVersion: string | null;
  immutable: boolean;
  totals: { totalMinutes: number; workMinutes: number; travelMinutes: number; breakMinutes: number };
  targets: Array<{ targetId: string | null; targetName: string; minutes: number }>;
  segments: TimeV2SnapshotSegment[];
  decisions: TimeV2DecisionEntry[];
  evidence: TimeV2EvidenceRef[];
  correction: { requested: boolean; requestedAt: string | null; reason: string | null; resubmittedAt: string | null };
  attestability: {
    payroll: boolean;
    project: boolean;
    payrollAttested: boolean;
    projectAttested: boolean;
    blockedReason: string | null;
  };
  isTestFixture: boolean;
}

export function normalizeSubmissionDetail(raw: unknown): TimeV2SubmissionDetail | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const body = (r.submission ?? r.detail ?? r) as Record<string, unknown>;
  const id = str(body.submission_id ?? body.submissionId ?? body.id);
  const date = str(body.date ?? body.work_date ?? body.workDate);
  if (!id || !date) return null;

  const arr = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : [];

  const totals = (body.totals ?? {}) as Record<string, unknown>;
  const attest = (body.attestability ?? {}) as Record<string, unknown>;
  const corr = (body.correction ?? {}) as Record<string, unknown>;

  return {
    submissionId: id,
    date,
    personnelName: str(body.personnel_name ?? body.personnelName) ?? 'Okänd personal',
    personnelId: str(body.personnel_id ?? body.personnelId),
    state: str(body.state ?? body.status) ?? 'unknown',
    group: parseGroup(body.group ?? body.queue_group ?? body.queueGroup),
    revision: num(body.revision),
    submittedAt: str(body.submitted_at ?? body.submittedAt),
    snapshotVersion: str(body.snapshot_version ?? body.snapshotVersion ?? body.payload_hash),
    immutable: body.immutable === undefined ? true : bool(body.immutable),
    totals: {
      totalMinutes: num(totals.total_minutes ?? totals.totalMinutes),
      workMinutes: num(totals.work_minutes ?? totals.workMinutes),
      travelMinutes: num(totals.travel_minutes ?? totals.travelMinutes),
      breakMinutes: num(totals.break_minutes ?? totals.breakMinutes),
    },
    targets: arr(body.targets).map((t) => ({
      targetId: str(t.target_id ?? t.targetId),
      targetName: str(t.target_name ?? t.targetName) ?? 'Okänt mål',
      minutes: num(t.minutes),
    })),
    segments: arr(body.segments ?? body.timeline).map((s, i) => ({
      id: str(s.id) ?? `seg-${i}`,
      kind: str(s.kind ?? s.type) ?? 'unknown',
      label: str(s.label) ?? str(s.kind ?? s.type) ?? 'Segment',
      startsAt: str(s.starts_at ?? s.startsAt ?? s.start),
      endsAt: str(s.ends_at ?? s.endsAt ?? s.end),
      minutes: num(s.minutes),
      targetId: str(s.target_id ?? s.targetId),
      targetName: str(s.target_name ?? s.targetName),
      locked: bool(s.locked),
      note: str(s.note),
    })),
    decisions: arr(body.decisions ?? body.decision_chain).map((d, i) => ({
      id: str(d.id) ?? `dec-${i}`,
      at: str(d.at ?? d.created_at ?? d.createdAt),
      actor: str(d.actor ?? d.actor_name ?? d.actorName),
      action: str(d.action) ?? 'unknown',
      comment: str(d.comment ?? d.reason),
      revision: num(d.revision),
    })),
    evidence: arr(body.evidence ?? body.evidence_refs).map((e, i) => ({
      id: str(e.id) ?? `ev-${i}`,
      kind: str(e.kind ?? e.type) ?? 'unknown',
      label: str(e.label ?? e.name) ?? 'Referens',
      at: str(e.at ?? e.created_at ?? e.createdAt),
      reference: str(e.reference ?? e.ref ?? e.url),
    })),
    correction: {
      requested: bool(corr.requested) || !!str(corr.requested_at ?? corr.requestedAt),
      requestedAt: str(corr.requested_at ?? corr.requestedAt),
      reason: str(corr.reason),
      resubmittedAt: str(corr.resubmitted_at ?? corr.resubmittedAt),
    },
    attestability: {
      payroll: bool(attest.payroll ?? attest.payroll_attestable),
      project: bool(attest.project ?? attest.project_attestable),
      payrollAttested: bool(attest.payroll_attested ?? attest.payrollAttested),
      projectAttested: bool(attest.project_attested ?? attest.projectAttested),
      blockedReason: str(attest.blocked_reason ?? attest.blockedReason),
    },
    isTestFixture: bool(body.is_test_fixture ?? body.isTestFixture ?? body.test_fixture),
  };
}

export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
