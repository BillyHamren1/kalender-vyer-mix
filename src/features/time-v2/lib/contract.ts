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
