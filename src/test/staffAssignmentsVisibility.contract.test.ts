/**
 * Kontraktstest för personalkalenderns visning av staff_assignments.
 *
 * Regel (locked): `fetchAllAssignments` får ALDRIG filtrera bort en sparad
 * staff_assignment baserat på `staff_availability`-status (blocked/unavailable).
 * Admin har medvetet planerat in personalen — raden måste alltid visas i
 * personalkalendern. Annars uppstår buggen: badge syns vid drop (optimistic),
 * men försvinner vid refresh när läsningen filtrerar bort den.
 *
 * Detta test kontrollerar käll-koden statiskt så att filtret inte återinförs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, '../hooks/useUnifiedStaffOperations.tsx'),
  'utf8',
);

describe('staff assignments visibility contract', () => {
  it('fetchAllAssignments får inte filtrera bort blocked/unavailable rader', () => {
    // Plocka ut hela fetchAllAssignments-funktionen
    const fnMatch = SOURCE.match(
      /async function fetchAllAssignments[\s\S]*?\n\}\n/,
    );
    expect(fnMatch, 'fetchAllAssignments saknas').toBeTruthy();
    const body = fnMatch![0];

    // Får ALDRIG läsa staff_availability i denna funktion
    expect(
      body.includes('staff_availability'),
      'fetchAllAssignments får inte läsa staff_availability — det orsakar att personal försvinner vid refresh',
    ).toBe(false);

    // Får ALDRIG ha någon "isBlocked"-baserad filtrering
    expect(
      /isBlocked\s*\(/.test(body),
      'fetchAllAssignments får inte filtrera assignments via isBlocked()',
    ).toBe(false);

    // Får ALDRIG anropa Supabase med blocked/unavailable-strängar
    expect(
      /['"](blocked|unavailable)['"]/i.test(body),
      'fetchAllAssignments får inte filtrera på blocked/unavailable-status',
    ).toBe(false);
  });

  it('handleStaffDrop invaliderar cache efter lyckad write', () => {
    // Plocka ut handleStaffDrop
    const fnMatch = SOURCE.match(
      /const handleStaffDrop = useCallback\(async[\s\S]*?\n  \}, \[[^\]]*\]\);\n/,
    );
    expect(fnMatch, 'handleStaffDrop saknas').toBeTruthy();
    const body = fnMatch![0];

    // Räkna invalidateQueries({ queryKey: ['staff-assignments-all'] })
    const matches = body.match(
      /queryClient\.invalidateQueries\(\s*\{\s*queryKey:\s*\[['"]staff-assignments-all['"]\]/g,
    );
    expect(
      (matches?.length ?? 0) >= 2,
      'handleStaffDrop måste invalidera staff-assignments-all i BÅDE success- och error-grenen (annars hänger optimistic data kvar tills refresh och kan försvinna)',
    ).toBe(true);
  });
});
