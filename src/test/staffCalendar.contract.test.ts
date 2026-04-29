// @vitest-environment node
/**
 * Contract test — locks the canonical staff_assignments write path.
 *
 * Rule: only `src/services/staffAssignmentCore.ts` is allowed to mutate
 * `public.staff_assignments` (upsert / delete). Every other write path
 * MUST delegate to it. This test fails if a duplicate writer reappears.
 *
 * Why: prior to consolidation there were 5 hooks and 4 services all
 * writing directly to the table. Different optimistic-update strategies
 * caused jobs to "move" or "disappear" depending on which path the UI
 * happened to use. See plan in .lovable/plan.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const ALLOWED_WRITER = 'services/staffAssignmentCore.ts';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'test') continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('staff_assignments — single writer contract', () => {
  const files = walk(SRC).filter((f) => !f.endsWith(ALLOWED_WRITER));

  it('only staffAssignmentCore writes to public.staff_assignments', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      // Look for `.from('staff_assignments')` followed (within same chain or
      // soon after) by `.upsert(` / `.delete(` / `.insert(` / `.update(`.
      // Simple heuristic: split into statements and inspect.
      const idx = src.indexOf("from('staff_assignments')");
      const idx2 = src.indexOf('from("staff_assignments")');
      if (idx === -1 && idx2 === -1) continue;
      // Any mutating call in the file referencing staff_assignments?
      const re = /\.from\(['"]staff_assignments['"]\)[\s\S]{0,400}?\.(upsert|insert|update|delete)\s*\(/;
      if (re.test(src)) {
        offenders.push(file.replace(SRC + '/', 'src/'));
      }
    }
    expect(offenders, `Direct staff_assignments mutation found outside ${ALLOWED_WRITER}:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('legacy duplicate hooks are gone', () => {
    const banned = [
      'src/hooks/useReliableStaffOperations.ts',
      'src/hooks/useDateAwareStaffOperations.tsx',
      'src/hooks/useStaffOperations.tsx',
      'src/services/enhancedStaffService.ts',
      'src/components/Calendar/StaffAssignmentRow.tsx',
      'src/hooks/useStaffBookingConnection.tsx',
    ];
    const present: string[] = [];
    for (const rel of banned) {
      const full = join(process.cwd(), rel);
      try {
        statSync(full);
        present.push(rel);
      } catch {
        /* good — file is gone */
      }
    }
    expect(present, `Duplicate legacy modules reappeared:\n${present.join('\n')}`).toEqual([]);
  });
});
