// Contract test: låser UI-koden vid att gå genom projectDateAuthority.
// Förbjuder direkta .update({ rigdaydate / eventdate / rigdowndate }) i src/ samt
// direktanrop till deprekerade propagateProjectDatesToBookings.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const ALLOW = new Set([
  'services/projectDateAuthority.ts',
  'services/largeProjectScheduleSync.ts',
  'test/projectDatesAuthorityLock.contract.test.ts',
  'test/projectDateAuthority.contract.test.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('Project Dates Authority — lockning', () => {
  const files = walk(ROOT);

  it('ingen UI-fil skriver direkt till bookings.{phase}date', () => {
    const offenders: string[] = [];
    const re = /\.update\s*\(\s*\{[^}]*\b(rigdaydate|eventdate|rigdowndate)\s*:/;
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1).split('\\').join('/');
      if (ALLOW.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      if (re.test(src)) offenders.push(rel);
    }
    expect(offenders, `Direktskrivning till bookings.{phase}date — använd writeProjectDates:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('ingen kod importerar deprekerad propagateProjectDatesToBookings', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1).split('\\').join('/');
      if (ALLOW.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      if (/propagateProjectDatesToBookings/.test(src)) offenders.push(rel);
    }
    expect(offenders, `Använd writeProjectDates istället:\n${offenders.join('\n')}`).toEqual([]);
  });
});
