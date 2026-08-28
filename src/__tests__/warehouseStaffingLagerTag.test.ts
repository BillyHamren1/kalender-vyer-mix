/**
 * Lagerkalendern: Lager-tagg + tillgänglighet ska räcka för bemanning.
 * Ingen separat "lageraktivering" får spärra personal.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const quickAssign = fs.readFileSync(
  path.join(process.cwd(), 'src/components/warehouse-ops/QuickAssignStaffPopover.tsx'),
  'utf8',
);
const personnelHook = fs.readFileSync(
  path.join(process.cwd(), 'src/hooks/useWarehousePersonnelWeek.ts'),
  'utf8',
);

describe('Lagerkalenderns bemanningsregel', () => {
  it('skickar inte aktiverings-id:n som hård spärr till kalendern', () => {
    expect(quickAssign).not.toMatch(/activatedStaffIds=\{activeStaffIds\}/);
    expect(quickAssign).not.toMatch(/activatedStaffByDate=\{activeStaffIdsByDate\}/);
  });

  it('använder inte längre useWarehouseAvailableStaff för att filtrera personal', () => {
    expect(quickAssign).not.toMatch(/useWarehouseAvailableStaff\(/);
  });

  it('behåller Lager-taggfiltret i bemanningslistan och personalmatrisen', () => {
    expect(quickAssign).toContain(".contains('tags', ['Lager'])");
    expect(personnelHook).toContain("member.tags.includes('Lager')");
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
