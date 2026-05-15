/**
 * Lager 3.9 — Read-only audit av WorkdayAllocation + AI reviewer.
 *
 * Kör 9 scenarier som speglar verkliga problemfall och loggar:
 *   A. LocationTruthV2 sequence
 *   B. WorkdayAllocation sequence
 *   C. Tidskoppling per target
 *   D. Warnings/proposals
 *   E. AI-review-triggers
 *   F. Vad som kräver mänsklig granskning
 *
 * Strikt read-only — inga DB-anrop, ingen AI, inga mutationer.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildWorkdayAllocationFromLocationTruth } from './buildWorkdayAllocationFromLocationTruth.ts';
import { buildAiWorkdayReviewInput, reviewWorkdayWithAi } from './aiWorkdayReviewer.ts';
import type {
  LocationTruthResult,
  LocationTruthSegment,
  LocationTruthTargetType,
  FinalLocationTruthSegmentType,
} from './buildLocationTruthFromDayEvidence.ts';

const ENVELOPE = {
  startAt: '2026-05-15T07:00:00.000Z',
  endAt: '2026-05-15T18:00:00.000Z',
  isOpen: false,
  startSource: 'active_time_registration' as const,
  endSource: 'active_time_registration_stop' as const,
  warnings: [],
};

function fakeLT(segments: LocationTruthSegment[]): LocationTruthResult {
  return {
    segments,
    diagnostics: {
      staffId: 'staff-1', date: '2026-05-15', builtAtIso: '2026-05-15T00:00:00Z',
      buildDurationMs: 0, warnings: [],
    } as any,
  } as LocationTruthResult;
}

function siteSeg(opts: {
  id: string; start: string; end: string;
  t: LocationTruthTargetType; targetId?: string; label?: string;
  hasAssignment?: boolean;
  status?: string;
}): LocationTruthSegment {
  const targetId = opts.targetId ?? `${opts.t}-1`;
  const label = opts.label ?? `${opts.t} ${targetId}`;
  const matched = { targetType: opts.t, targetId, label };
  const finalType: FinalLocationTruthSegmentType =
    opts.t === 'private_zone' ? 'private_residence' : 'known_site';
  const status = opts.status
    ?? (opts.hasAssignment === false ? 'unassigned_but_present' : 'matched_eventflow_target');
  return {
    id: opts.id, staffId: 'staff-1', startAt: opts.start, endAt: opts.end,
    type: finalType === 'private_residence' ? 'private_residence' : 'known_target',
    finalType,
    confidence: 'high',
    physicalLocation: { label, address: `${label} adress` } as any,
    matchedTarget: matched,
    businessContext: { status, matchedTarget: matched },
    evidence: {
      assignmentSupportsTarget: opts.hasAssignment !== false,
      pingCount: 5,
    } as any,
    warnings: [],
    diagnostics: {} as any,
  } as any;
}

function knownAddrSeg(id: string, start: string, end: string): LocationTruthSegment {
  return {
    id, staffId: 'staff-1', startAt: start, endAt: end,
    type: 'known_address', finalType: 'known_address',
    confidence: 'high',
    physicalLocation: { label: 'Adress utan target', address: 'Storgatan 5' } as any,
    matchedTarget: null,
    businessContext: { status: 'known_address_no_eventflow_target' },
    evidence: { pingCount: 6 } as any,
    warnings: [], diagnostics: {} as any,
  } as any;
}

function privateSeg(id: string, start: string, end: string): LocationTruthSegment {
  return siteSeg({ id, start, end, t: 'private_zone', targetId: 'home-1', label: 'Hem' });
}

function movementSeg(opts: {
  id: string; start: string; end: string;
  fromType?: LocationTruthTargetType | null;
  toType?: LocationTruthTargetType | null;
  distanceMeters?: number | null;
}): LocationTruthSegment {
  const meta: Record<string, unknown> = {};
  if (opts.fromType) meta.fromTarget = { targetType: opts.fromType, targetId: 'x', label: 'x' };
  if (opts.toType) meta.toTarget = { targetType: opts.toType, targetId: 'y', label: 'y' };
  if (typeof opts.distanceMeters === 'number') meta.distanceMeters = opts.distanceMeters;
  return {
    id: opts.id, staffId: 'staff-1', startAt: opts.start, endAt: opts.end,
    type: 'movement', finalType: 'movement', confidence: 'medium',
    evidence: { pingCount: 3 } as any,
    warnings: [],
    diagnostics: { decisionReason: 'detected_true_movement', movementMeta: meta } as any,
    businessContext: { status: 'unresolved_business_context' },
  } as any;
}

function fmt(seg: any): string {
  const t = `${seg.startAt.slice(11, 16)}-${seg.endAt.slice(11, 16)}`;
  const tgt = seg.targetType ? `${seg.targetType}:${seg.targetId ?? '?'}` : '—';
  return `${t} ${seg.allocationType.padEnd(28)} ${tgt}  warn=[${seg.warnings.join(',')}]  bc=${seg.businessContextStatus ?? '—'}`;
}

function fmtLT(seg: LocationTruthSegment): string {
  const t = `${seg.startAt.slice(11, 16)}-${seg.endAt.slice(11, 16)}`;
  const m = seg.matchedTarget ? `${seg.matchedTarget.targetType}:${seg.matchedTarget.targetId}` : '—';
  return `${t} ${(seg.finalType as string).padEnd(20)} matched=${m} bc=${(seg.businessContext as any)?.status ?? '—'}`;
}

function audit(name: string, lt: LocationTruthSegment[], assignments: any[] = []) {
  const wda = buildWorkdayAllocationFromLocationTruth({
    dayEvidence: { assignments: { items: assignments } } as any,
    locationTruthV2: fakeLT(lt),
    workdayEnvelope: ENVELOPE,
  });
  const aiInput = buildAiWorkdayReviewInput({
    dayEvidence: null, locationTruthV2: fakeLT(lt), workdayAllocation: wda,
  });
  const aiOut = reviewWorkdayWithAi(aiInput);

  const triggers = aiInput.diagnostics.triggerCounts;
  const triggerSummary = Object.entries(triggers).filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}=${v}`).join(', ') || 'inga';

  console.log(`\n══════════════ ${name} ══════════════`);
  console.log('A. LocationTruthV2 sequence:');
  for (const s of lt) console.log('  · ' + fmtLT(s));
  console.log('B. WorkdayAllocation sequence:');
  for (const s of wda.segments) console.log('  · ' + fmt(s));
  console.log('C. Tidskoppling:');
  const byType = new Map<string, number>();
  for (const s of wda.segments) {
    const dur = (Date.parse(s.endAt) - Date.parse(s.startAt)) / 60000;
    const key = `${s.allocationType}${s.targetId ? '→' + s.targetId : ''}`;
    byType.set(key, (byType.get(key) ?? 0) + dur);
  }
  for (const [k, v] of byType) console.log(`  · ${k}: ${v} min`);
  console.log('D. Warnings/Proposals:');
  console.log(`  · proposals: ${wda.proposals.map((p) => `${p.proposalType}(${p.reason},conf=${p.confidence})`).join(' | ') || 'inga'}`);
  const allWarn = wda.segments.flatMap((s) => s.warnings);
  console.log(`  · warnings totalt: ${allWarn.join(', ') || 'inga'}`);
  console.log(`E. AI-review skulle triggas: ${aiInput.segmentCases.length} segment, ${aiInput.proposalCases.length} förslag (${triggerSummary})`);
  console.log(`   reviewer=${aiOut.reviewer.kind}, summary="${aiOut.summary}"`);
  console.log('F. Kräver mänsklig granskning:');
  const human: string[] = [];
  for (const s of wda.segments) {
    if (s.allocationType === 'needs_work_allocation_review') human.push(`${s.startAt.slice(11, 16)} needs_review`);
    if (s.warnings.includes('staff_not_assigned_to_matched_target')) human.push(`${s.startAt.slice(11, 16)} bekräfta tilldelning`);
    if (s.warnings.includes('planning_geo_mismatch')) human.push(`${s.startAt.slice(11, 16)} planering vs GPS`);
    if (s.warnings.includes('no_project_link')) human.push(`${s.startAt.slice(11, 16)} koppla projekt`);
    if (s.warnings.includes('supplier_visit_without_project_context')) human.push(`${s.startAt.slice(11, 16)} supplier saknar projekt`);
    if (s.warnings.includes('long_travel_over_150km')) human.push(`${s.startAt.slice(11, 16)} attestera lång resa`);
    if (s.warnings.includes('movement_missing_anchor')) human.push(`${s.startAt.slice(11, 16)} movement utan anchor`);
  }
  for (const p of wda.proposals) {
    if (p.proposalType === 'suggest_workday_end') human.push(`${(p.suggestedEndAt ?? p.startAt).slice(11, 16)} bekräfta dagsslut`);
  }
  console.log('  · ' + (human.join(' | ') || 'inget'));

  assert(Array.isArray(wda.segments));
  return { wda, aiInput, aiOut };
}

// ── Case 1 — Person på projekt utan assignment ─────────────────────────
Deno.test('Lager 3.9 — Case 1: projekt utan assignment', () => {
  audit('Case 1 — projekt utan assignment', [
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T16:00:00Z',
      t: 'project', targetId: 'proj-A', hasAssignment: false }),
  ]);
});

// ── Case 2 — Supplierbesök ─────────────────────────────────────────────
Deno.test('Lager 3.9 — Case 2: supplierbesök', () => {
  audit('Case 2 — supplierbesök (utan kontext)', [
    siteSeg({ id: 's1', start: '2026-05-15T10:00:00Z', end: '2026-05-15T11:00:00Z',
      t: 'supplier', hasAssignment: false }),
  ]);
});

// ── Case 3 — Warehouse under aktiv arbetsdag ───────────────────────────
Deno.test('Lager 3.9 — Case 3: warehouse under arbetsdag', () => {
  audit('Case 3 — warehouse under arbetsdag', [
    siteSeg({ id: 's1', start: '2026-05-15T07:30:00Z', end: '2026-05-15T08:30:00Z',
      t: 'warehouse', targetId: 'wh-1', hasAssignment: true }),
    siteSeg({ id: 's2', start: '2026-05-15T09:00:00Z', end: '2026-05-15T16:00:00Z',
      t: 'project', targetId: 'proj-7', hasAssignment: true }),
  ]);
});

// ── Case 4 — Large project / child booking-problem ─────────────────────
Deno.test('Lager 3.9 — Case 4: large project utan geo (child booking matchar)', () => {
  audit('Case 4 — large project / child booking', [
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T17:00:00Z',
      t: 'large_project', targetId: 'lp-22', hasAssignment: false,
      status: 'large_project_missing_geo' }),
  ]);
});

// ── Case 5 — Known address utan EventFlow-target ───────────────────────
Deno.test('Lager 3.9 — Case 5: known address utan target', () => {
  audit('Case 5 — known_address utan EventFlow-target', [
    knownAddrSeg('s1', '2026-05-15T09:00:00Z', '2026-05-15T15:00:00Z'),
  ]);
});

// ── Case 6 — Långt gap samma plats ─────────────────────────────────────
Deno.test('Lager 3.9 — Case 6: långt gap samma plats', () => {
  audit('Case 6 — långt gap samma plats (delas upp av Lager 2)', [
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T10:00:00Z',
      t: 'project', targetId: 'proj-7', hasAssignment: true }),
    // gap 10:00–13:00 (Lager 2 lämnar gap)
    siteSeg({ id: 's2', start: '2026-05-15T13:00:00Z', end: '2026-05-15T17:00:00Z',
      t: 'project', targetId: 'proj-7', hasAssignment: true }),
  ]);
});

// ── Case 7 — Hem/private efter sista jobb > 90 min ─────────────────────
Deno.test('Lager 3.9 — Case 7: hem > 90 min efter sista jobb', () => {
  audit('Case 7 — hem > 90 min efter sista jobb', [
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T15:00:00Z',
      t: 'project', targetId: 'proj-7', hasAssignment: true }),
    privateSeg('s2', '2026-05-15T15:30:00Z', '2026-05-15T18:00:00Z'),
  ]);
});

// ── Case 8 — Planering säger A men GPS säger B ─────────────────────────
Deno.test('Lager 3.9 — Case 8: planning_geo_mismatch', () => {
  audit('Case 8 — planning säger A, GPS säger B', [
    siteSeg({ id: 's1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T16:00:00Z',
      t: 'project', targetId: 'proj-B-actual', hasAssignment: true,
      status: 'planning_geo_mismatch' }),
  ], [{ projectId: 'proj-A-planned', startAt: '2026-05-15T08:00:00Z', endAt: '2026-05-15T16:00:00Z' }]);
});

// ── Case 9 — Movement mellan warehouse och projekt ─────────────────────
Deno.test('Lager 3.9 — Case 9: movement warehouse → project', () => {
  audit('Case 9 — movement warehouse → project', [
    siteSeg({ id: 's1', start: '2026-05-15T07:30:00Z', end: '2026-05-15T08:00:00Z',
      t: 'warehouse', hasAssignment: true }),
    movementSeg({ id: 'm1', start: '2026-05-15T08:00:00Z', end: '2026-05-15T08:45:00Z',
      fromType: 'warehouse', toType: 'project', distanceMeters: 18000 }),
    siteSeg({ id: 's2', start: '2026-05-15T08:45:00Z', end: '2026-05-15T16:00:00Z',
      t: 'project', targetId: 'proj-7', hasAssignment: true }),
  ]);
});
