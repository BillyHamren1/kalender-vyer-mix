/**
 * Mapping from Time's REAL deployed v2 schemas to the Planning module's view
 * models. Nothing is invented: every field comes from the exact Time payload
 * (`time-source-status.v1`, `time-review-queue.v1`, `time-day-detail.v1`,
 * `publication-preview.v1`, `personnel-activation-support.v1`).
 */

import {
  TIME_V2_CONTRACT_VERSION,
  type TimeV2Overview,
  type TimeV2PersonnelDetail,
  type TimeV2PersonnelDirectory,
  type TimeV2PreviewBundle,
  type TimeV2PreviewSection,
  type TimeV2QueueGroup,
  type TimeV2QueueRow,
  type TimeV2ReviewQueue,
  type TimeV2SubmissionDetail,
} from './contract';

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const bool = (v: unknown): boolean => v === true;

/* ------------------------------- status ---------------------------------- */

/** `time-source-status.v1` + `time-review-queue.v1` → landing overview. */
export function mapStatusToOverview(status: unknown, queue?: unknown): TimeV2Overview {
  const s = obj(status);
  const q = obj(queue);
  const counts = obj(q.counts);
  const attestable = num(counts.needs_review);
  return {
    source: {
      contractVersion: str(s.adapterVersion) ?? TIME_V2_CONTRACT_VERSION,
      generatedAt: str(s.generatedAt),
      staging: true,
      healthy: s.reachable === undefined ? true : bool(s.reachable),
      message: str(s.blocker),
    },
    personnel: {
      totalPersonnel: num(s.personnelCount),
      withActiveAppAccount: 0,
      invitedNotActivated: 0,
      blocked: 0,
    },
    reviewQueue: {
      submitted: attestable,
      awaitingCorrection: num(counts.correction),
      resubmitted: 0,
      readyForAttest: attestable,
      attested: num(counts.approved),
    },
    independentlyAttestable: attestable > 0,
    previewAvailable: num(counts.approved) > 0,
  };
}

/** Personnel counters come from `personnel.accounts`, not from status. */
export function mapPersonnelAccountsToOverviewCounts(accounts: unknown): TimeV2Overview['personnel'] {
  const rows = arr(accounts);
  return {
    totalPersonnel: rows.length,
    withActiveAppAccount: rows.filter((r) => r.accountState === 'active').length,
    invitedNotActivated: rows.filter((r) => r.accountState === 'invited').length,
    blocked: rows.filter((r) => r.accountState === 'suspended' || r.accountState === 'closed').length,
  };
}

/* ------------------------------ review queue ------------------------------ */

const GROUPS: TimeV2QueueGroup[] = ['needs_review', 'correction', 'approved', 'missing'];

function mapDayItem(item: Json, group: TimeV2QueueGroup): TimeV2QueueRow | null {
  const id = str(item.submissionId);
  const date = str(item.workDate);
  if (!id || !date) return null;
  const payroll = obj(item.payroll);
  const project = obj(item.project);
  const pending = (d: Json) => d.state === 'pending';
  return {
    submissionId: id,
    group,
    state: str(item.state) ?? 'unknown',
    date,
    personnelId: str(item.workerId),
    personnelName: str(item.workerName) ?? 'Okänd personal',
    projectId: null,
    projectName: null,
    totalMinutes: 0,
    travelMinutes: 0,
    breakMinutes: 0,
    revision: num(item.version),
    submittedAt: null,
    correctionRequestedAt: item.state === 'correction_requested' ? date : null,
    resubmittedAt: item.state === 'resubmitted' ? date : null,
    attestable: pending(payroll) || pending(project),
    payrollAttestable: pending(payroll),
    projectAttestable: pending(project),
    isTestFixture: false,
  };
}

/** `time-review-queue.v1` → flat queue rows keeping Time's own grouping. */
export function mapReviewQueue(raw: unknown): TimeV2ReviewQueue {
  const r = obj(raw);
  const groups = obj(r.groups);
  const rows: TimeV2QueueRow[] = [];
  for (const group of GROUPS) {
    for (const item of arr(groups[group])) {
      const row = mapDayItem(item, group);
      if (row) rows.push(row);
    }
  }
  return {
    contractVersion: TIME_V2_CONTRACT_VERSION,
    generatedAt: str(r.generatedAt),
    stale: false,
    rows,
  };
}

/* ---------------------------- submission detail --------------------------- */

/** `time-day-detail.v1` → immutable snapshot detail. Time stays the owner. */
export function mapDayDetail(raw: unknown): TimeV2SubmissionDetail | null {
  const r = obj(raw);
  const head = obj(r.head);
  const snapshot = obj(r.snapshot);
  const evidence = obj(r.evidence);
  const attestable = obj(r.attestable);
  const id = str(head.submissionId);
  const date = str(head.workDate);
  if (!id || !date) return null;

  const totals = obj(snapshot.totals);
  const blocks = arr(snapshot.blocks);
  const payroll = obj(head.payroll);
  const project = obj(head.project);
  const decisions = arr(r.revisions);
  const correctionEntry = decisions.find((d) => d.event === 'correction_requested');

  const targets = new Map<string, { targetId: string | null; targetName: string; minutes: number }>();
  for (const block of blocks) {
    const target = obj(block.target);
    const label = str(target.label);
    if (!label) continue;
    const key = str(target.externalId) ?? label;
    const entry = targets.get(key) ?? { targetId: str(target.externalId), targetName: label, minutes: 0 };
    entry.minutes += num(block.durationMinutes);
    targets.set(key, entry);
  }

  const evidenceRefs = [
    ...arr(evidence.messages).map((e) => ({ id: String(e.id), kind: 'message', label: str(e.jobLabel) ?? 'Meddelande', at: str(e.at) })),
    ...arr(evidence.media).map((e) => ({ id: String(e.id), kind: 'media', label: str(e.fileName) ?? str(e.jobLabel) ?? 'Media', at: str(e.at) })),
    ...arr(evidence.scans).map((e) => ({ id: String(e.id), kind: 'scan', label: str(e.itemCode) ?? 'Skanning', at: str(e.at) })),
  ];

  return {
    submissionId: id,
    date,
    personnelName: str(head.workerName) ?? 'Okänd personal',
    personnelId: str(head.workerId),
    state: str(head.state) ?? 'unknown',
    group: head.state === 'correction_requested' ? 'correction' : snapshot.id ? 'needs_review' : 'missing',
    revision: num(head.version),
    submittedAt: str(snapshot.createdAt),
    snapshotVersion: str(head.snapshotHash) ?? str(snapshot.snapshotHash),
    immutable: !!snapshot.id,
    totals: {
      totalMinutes: num(totals.workMinutes) + num(totals.travelMinutes),
      workMinutes: num(totals.workMinutes),
      travelMinutes: num(totals.travelMinutes),
      breakMinutes: num(totals.breakMinutes),
    },
    targets: [...targets.values()],
    segments: blocks.map((b, i) => ({
      id: str(b.id) ?? `block-${i}`,
      kind: str(b.kind) ?? 'unknown',
      label: str(obj(b.target).label) ?? str(b.kind) ?? 'Segment',
      startsAt: str(b.startAt),
      endsAt: str(b.endAt),
      minutes: num(b.durationMinutes),
      locked: bool(b.locked),
      note: str(b.confidence),
      targetId: str(obj(b.target).externalId),
      targetName: str(obj(b.target).label),
    })),

    decisions: decisions.map((d, i) => ({
      id: `${str(d.event) ?? 'event'}-${i}`,
      action: str(d.event) ?? 'unknown',
      actor: str(d.actorRole),
      at: str(d.at),
      revision: num(d.version),
      comment: str(d.reason),
    })) as TimeV2SubmissionDetail['decisions'],
    evidence: evidenceRefs as TimeV2SubmissionDetail['evidence'],
    correction: {
      requested: bool(r.awaitingResubmission),
      requestedAt: str(correctionEntry?.at),
      reason: str(correctionEntry?.reason),
      resubmittedAt: bool(r.isResubmission) ? str(snapshot.createdAt) : null,
    },
    attestability: {
      payroll: bool(attestable.payroll),
      project: bool(attestable.project),
      payrollAttested: ['approved', 'locked'].includes(String(payroll.state)),
      projectAttested: ['approved', 'locked'].includes(String(project.state)),
      blockedReason: bool(r.awaitingResubmission)
        ? 'Väntar på ny version från medarbetaren.'
        : !attestable.payroll && !attestable.project
          ? 'Time rapporterar inga attesterbara domäner för den här dagen.'
          : null,
    },
    isTestFixture: false,
  };
}

/* --------------------------------- preview -------------------------------- */

function mapPreviewSection(raw: unknown, domain: 'payroll' | 'project'): TimeV2PreviewSection {
  const r = obj(raw);
  const totals = obj(r.totals);
  const lines = arr(r.lines).map((l) => {
    const quantity = obj(l.quantity);
    return {
      lineId: String(l.id ?? ''),
      label: str(l.subjectLabel) ?? String(l.subjectId ?? ''),
      targetId: str(l.subjectId),
      minutes: quantity.kind === 'time' ? num(quantity.minutes) : 0,
      // Time reports rate status only; Planning never computes an amount.
      amount: null,
      currency: null,
      note: str(l.note) ?? str(obj(l.rate).status),
    };
  }).filter((l) => l.lineId);
  const exceptions = arr(r.exceptions);
  return {
    domain,
    attested: lines.length > 0,
    generatedAt: str(r.generatedAt),
    amountsAvailable: false,
    totalMinutes: num(totals.minutes),
    totalAmount: null,
    currency: null,
    lines,
    blockedReason: lines.length === 0
      ? (str(obj(exceptions[0]).label) ?? 'Time rapporterar inga attesterade rader för den här domänen.')
      : null,
  };
}

/** Two `publication-preview.v1` payloads → one Planning preview bundle. */
export function mapPreviewBundle(
  payroll: unknown,
  project: unknown,
  submissionId: string,
  revision: number,
  snapshotVersion: string | null,
): TimeV2PreviewBundle {
  const p = obj(payroll);
  return {
    submissionId,
    revision,
    snapshotVersion,
    previewOnly: true,
    isTestFixture: String(p.marker ?? '').includes('TEST'),
    payroll: mapPreviewSection(payroll, 'payroll'),
    project: mapPreviewSection(project, 'project'),
  };
}

/* -------------------------------- personnel ------------------------------- */

/** `personnel.accounts` → Planning personnel directory (identity domains kept apart). */
export function mapPersonnelDirectory(raw: unknown, generatedAt: string | null): TimeV2PersonnelDirectory {
  return {
    generatedAt,
    rows: arr(raw)
      .map((p) => {
        const id = str(p.personnelId);
        if (!id) return null;
        const state = String(p.accountState ?? 'none');
        return {
          personnelId: id,
          personnelName: str(p.displayName) ?? id,
          hubAccount: { present: false, state: str(p.sourceSystem) },
          appAccount: {
            state: (['none', 'invited', 'active', 'suspended'].includes(state) ? state : 'none') as
              TimeV2PersonnelDirectory['rows'][number]['appAccount']['state'],
            activationIssuedAt: null,
            activationExpiresAt: null,
            activationConsumedAt: null,
          },
          lastAppAccessAt: null,
          lastEvidenceSyncAt: null,
          lastSubmissionSyncAt: null,
          visibleAssignments: 0,
          isTestFixture: false,
        };
      })
      .filter((x): x is TimeV2PersonnelDirectory['rows'][number] => !!x),
  };
}

/** `personnel.detail` + `personnel-activation-support.v1` → support detail. */
export function mapPersonnelDetail(
  detail: unknown,
  support: unknown,
  personnelId: string,
): TimeV2PersonnelDetail | null {
  const person = obj(obj(detail).person);
  const s = obj(support);
  const visibility = obj(s.assignmentVisibility);
  const state = String(s.accountState ?? person.accountState ?? 'none');
  const id = str(person.id) ?? personnelId;
  if (!id) return null;
  return {
    personnelId: id,
    personnelName: str(person.displayName) ?? id,
    hubAccount: { present: false, state: str(person.sourceSystem) },
    appAccount: {
      state: (['none', 'invited', 'active', 'suspended'].includes(state) ? state : 'none') as
        TimeV2PersonnelDetail['appAccount']['state'],
      activationIssuedAt: null,
      activationExpiresAt: null,
      activationConsumedAt: null,
    },
    lastAppAccessAt: str(s.lastSuccessfulAppAccessAt),
    lastEvidenceSyncAt: str(s.lastEvidenceSyncAt),
    lastSubmissionSyncAt: str(s.lastSubmissionSyncAt),
    visibleAssignments: num(visibility.assignmentCount),
    isTestFixture: false,
    assignments: [],
    diagnostics: [
      {
        id: 'assignment_visibility',
        label: str(visibility.sourceLabel) ?? 'Tilldelningssynlighet',
        ok: visibility.state === 'visible',
        detail: str(visibility.detail),
      },
      {
        id: 'can_use_app',
        label: 'Appåtkomst',
        ok: bool(s.canUseApp),
        detail: bool(s.canUseApp) ? 'Kontot kan använda personalappen.' : `Appstatus: ${state}.`,
      },
    ],
  };
}
