/**
 * Lagerkalendern: Lager-tagg + tillgänglighet ska räcka för bemanning.
 * Ingen separat "lageraktivering" får spärra personal.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/WarehouseCalendarPage.tsx'),
  'utf8',
);

describe('Lagerkalenderns bemanningsregel', () => {
  it('skickar inte aktiverings-id:n som hård spärr till kalendern', () => {
    expect(page).not.toMatch(/activatedStaffIds=\{activeStaffIds\}/);
    expect(page).not.toMatch(/activatedStaffByDate=\{activeStaffIdsByDate\}/);
  });

  it('använder inte längre useWarehouseAvailableStaff för att filtrera personal', () => {
    expect(page).not.toMatch(/useWarehouseAvailableStaff\(/);
  });

  it('behåller Lager-taggfiltret i personal-operationerna', () => {
    expect(page).toMatch(/useUnifiedStaffOperations\(currentWeekStart, 'weekly', 'Lager'\)/);
  });
});

describe('Tillgänglighetsregeln (unavailable/blocked filtreras bort)', () => {
  const service = fs.readFileSync(
    path.join(process.cwd(), 'src/services/staffAvailabilityService.ts'),
    'utf8',
  );

  it('behandlar unavailable och blocked som ej tillgänglig', () => {
    expect(service).toMatch(/availability_type === 'unavailable'/);
    expect(service).toMatch(/availability_type === 'blocked'/);
  });

  it('behandlar saknad post som tillgänglig', () => {
    expect(service).toMatch(/No records = available by default/);
  });
});
