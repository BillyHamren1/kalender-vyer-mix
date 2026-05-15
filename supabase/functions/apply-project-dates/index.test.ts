// Pure validation tests för apply-project-dates.
// Edge function-internt fanns ingen export — vi duplicerar validatorn här som ren funktion
// och låser kontraktet (samma regler måste gälla i edge function).

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// Speglar logiken i index.ts. Om någon ändrar där måste de ändra här (kontrakt).
function isIsoDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

type Phase = 'rig' | 'event' | 'rigDown';

function validate(body: unknown): { ok: true; data: unknown } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body must be object' };
  const b = body as Record<string, unknown>;
  if (typeof b.project_id !== 'string') return { ok: false, error: 'project_id required' };
  if (b.project_type !== 'medium' && b.project_type !== 'large') {
    return { ok: false, error: 'project_type must be medium|large' };
  }
  if (typeof b.organization_id !== 'string') return { ok: false, error: 'organization_id required' };
  if (!b.dates || typeof b.dates !== 'object') return { ok: false, error: 'dates required' };
  const datesObj = b.dates as Record<string, unknown>;
  const cleaned: Partial<Record<Phase, string[]>> = {};
  for (const phase of ['rig', 'event', 'rigDown'] as Phase[]) {
    if (datesObj[phase] === undefined) continue;
    const arr = datesObj[phase];
    if (!Array.isArray(arr)) return { ok: false, error: `dates.${phase} must be array` };
    if (!arr.every(isIsoDate)) return { ok: false, error: `dates.${phase} must be YYYY-MM-DD strings` };
    cleaned[phase] = Array.from(new Set(arr as string[])).sort();
  }
  return { ok: true, data: { ...b, dates: cleaned } };
}

Deno.test('validate: rejects missing project_id', () => {
  const r = validate({ project_type: 'medium', organization_id: 'org1', dates: {} });
  assertEquals(r.ok, false);
});

Deno.test('validate: rejects bad project_type', () => {
  const r = validate({ project_id: 'p', project_type: 'small', organization_id: 'o', dates: {} });
  assertEquals(r.ok, false);
});

Deno.test('validate: rejects non-ISO date', () => {
  const r = validate({
    project_id: 'p', project_type: 'large', organization_id: 'o',
    dates: { rig: ['2026/05/14'] },
  });
  assertEquals(r.ok, false);
});

Deno.test('validate: accepts valid input and dedups+sorts', () => {
  const r = validate({
    project_id: 'p', project_type: 'large', organization_id: 'o',
    dates: { rig: ['2026-05-16', '2026-05-14', '2026-05-14'], event: [], rigDown: ['2026-05-20'] },
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    const data = r.data as { dates: Record<Phase, string[]> };
    assertEquals(data.dates.rig, ['2026-05-14', '2026-05-16']);
    assertEquals(data.dates.event, []);
    assertEquals(data.dates.rigDown, ['2026-05-20']);
  }
});

Deno.test('validate: empty dates object is allowed (no-op call)', () => {
  const r = validate({ project_id: 'p', project_type: 'medium', organization_id: 'o', dates: {} });
  assertEquals(r.ok, true);
});
