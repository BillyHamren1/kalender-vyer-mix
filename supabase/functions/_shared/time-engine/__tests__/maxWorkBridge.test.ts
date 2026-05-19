// Regressions: a single signal_gap longer than maxWorkBridgeMinutes must NOT
// be bridged inside one work block. Two short arrivals on the same target with
// a 7-hour gap between them = two separate work blocks (staff went home), not
// one 7-hour "work" block.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildReportCandidateBlocks } from '../buildReportCandidateBlocks.ts';
import type { PresenceDayBlock } from '../buildReportCandidateBlocks.ts';

const date = '2026-05-19';
const STAFF = 'staff-1';
const ORG = 'org-1';

function onsite(startAt: string, endAt: string, mins: number): PresenceDayBlock {
  return {
    id: `os-${startAt}`,
    kind: 'confirmed_on_site',
    startAt,
    endAt,
    durationMinutes: mins,
    targetType: 'booking',
    targetId: 'booking-1',
    targetLabel: 'Logosol AB (#2603-122)',
    evidence: {},
  } as any;
}

function gap(startAt: string, endAt: string, mins: number): PresenceDayBlock {
  return {
    id: `gap-${startAt}`,
    kind: 'signal_gap',
    startAt,
    endAt,
    durationMinutes: mins,
    targetType: null,
    targetId: null,
    targetLabel: null,
    evidence: {},
  } as any;
}

Deno.test('long signal_gap (>120 min) splits work — not bridged', () => {
  // Arrival 22:59→23:01 (2 min), gap 23:01→06:11 (432 min), return 06:11→06:13 (2 min)
  const presence: PresenceDayBlock[] = [
    onsite('2026-05-18T22:59:00Z', '2026-05-18T23:01:00Z', 2),
    gap('2026-05-18T23:01:00Z', '2026-05-19T06:11:00Z', 430),
    onsite('2026-05-19T06:11:00Z', '2026-05-19T06:13:00Z', 2),
  ];

  const res = buildReportCandidateBlocks({
    staffId: STAFF,
    organizationId: ORG,
    date,
    presenceDayBlocks: presence,
  });

  const workBlocks = res.blocks.filter((b) => b.kind === 'work');
  assertEquals(workBlocks.length, 2, `expected 2 work blocks, got ${workBlocks.length}: ${JSON.stringify(res.blocks.map(b=>({k:b.kind,s:b.startAt,e:b.endAt,d:b.durationMinutes})))}`);
  // None of them should be the bogus 7h block
  for (const w of workBlocks) {
    assert(w.durationMinutes < 60, `work block too long: ${w.durationMinutes} min`);
  }
});

Deno.test('short signal_gap (<120 min) is still bridged inside same work', () => {
  const presence: PresenceDayBlock[] = [
    onsite('2026-05-19T08:00:00Z', '2026-05-19T09:00:00Z', 60),
    gap('2026-05-19T09:00:00Z', '2026-05-19T09:45:00Z', 45),
    onsite('2026-05-19T09:45:00Z', '2026-05-19T11:00:00Z', 75),
  ];

  const res = buildReportCandidateBlocks({
    staffId: STAFF,
    organizationId: ORG,
    date,
    presenceDayBlocks: presence,
  });

  const workBlocks = res.blocks.filter((b) => b.kind === 'work');
  assertEquals(workBlocks.length, 1, 'short gap should bridge into one work block');
  assert(workBlocks[0].durationMinutes >= 175, 'bridged duration covers full span');
});
