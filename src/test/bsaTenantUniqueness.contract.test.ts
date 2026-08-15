/**
 * STEG 4Q — canonical unique identity för booking_staff_assignments.
 *
 * Kravet: den ENDA unika nyckeln (utöver PK på id) ska vara
 *   organization_id + booking_id + staff_id + assignment_date
 *
 * Testet failar om någon migration återinför en global unikhet på
 * booking_id + staff_id + assignment_date utan organization_id, eller om
 * någon DB-funktion använder legacy-ON CONFLICT-targeten.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const MIG_DIR = join(repoRoot, 'supabase/migrations');
const migrations = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const sqlByFile = migrations.map((f) => ({
  file: f,
  sql: readFileSync(join(MIG_DIR, f), 'utf8'),
}));

const LEGACY_KEY = /\(\s*booking_id\s*,\s*staff_id\s*,\s*assignment_date\s*\)/i;
const DROP_4Q = sqlByFile.filter(({ sql }) => sql.includes('STEG 4Q')).pop();

function statementsMentioningBsa(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => /booking_staff_assignments/i.test(s));
}

describe('STEG 4Q — tenant-safe BSA uniqueness', () => {
  it('4Q-migrationen finns och droppar legacy-nyckeln', () => {
    expect(DROP_4Q, 'STEG 4Q-migration saknas').toBeTruthy();
    expect(DROP_4Q!.sql).toMatch(
      /DROP CONSTRAINT IF EXISTS booking_staff_assignments_booking_id_staff_id_assignment_da_key/i,
    );
    expect(DROP_4Q!.sql).toMatch(
      /DROP INDEX IF EXISTS public\.booking_staff_assignments_booking_id_staff_id_assignment_da_key/i,
    );
  });

  it('4Q-migrationen gör ingen datamutation på toppnivå', () => {
    // Ta bort alla dollar-quotade kroppar (funktions-/DO-block) — de innehåller
    // legitim runtime-logik och är inte migrationens egna datamutationer.
    const topLevel = DROP_4Q!.sql.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, ' BODY ');
    expect(topLevel).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE)\b/i);
  });


  it('ingen senare migration återinför global unikhet utan organization_id', () => {
    const idx4q = migrations.indexOf(DROP_4Q!.file);
    const offenders: string[] = [];
    for (const { file, sql } of sqlByFile.slice(idx4q)) {
      for (const stmt of statementsMentioningBsa(sql)) {
        const isUniqueCreate =
          /CREATE\s+UNIQUE\s+INDEX/i.test(stmt) ||
          /ADD\s+CONSTRAINT[\s\S]*UNIQUE/i.test(stmt);
        if (!isUniqueCreate) continue;
        if (LEGACY_KEY.test(stmt) && !/organization_id/i.test(stmt)) {
          offenders.push(`${file}: ${stmt.slice(0, 160)}`);
        }
      }
    }
    expect(offenders, `Global BSA-unikhet återinförd:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('ingen migration efter 4Q använder legacy ON CONFLICT-target', () => {
    const idx4q = migrations.indexOf(DROP_4Q!.file);
    const offenders: string[] = [];
    for (const { file, sql } of sqlByFile.slice(idx4q)) {
      for (const stmt of statementsMentioningBsa(sql)) {
        const m = stmt.match(/ON CONFLICT\s*\([^)]*\)/gi) ?? [];
        for (const c of m) {
          if (LEGACY_KEY.test(c) && !/organization_id/i.test(c)) {
            offenders.push(`${file}: ${c}`);
          }
        }
      }
    }
    expect(offenders, `Legacy ON CONFLICT kvar:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('tenant-safe index skapas i repo-historiken', () => {
    const found = sqlByFile.some(({ sql }) =>
      /booking_staff_assignments_org_booking_staff_date_uidx/i.test(sql),
    );
    expect(found).toBe(true);
  });
});
