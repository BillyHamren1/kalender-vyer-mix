import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/components/staff/StaffGanttView.tsx');
const source = fs.readFileSync(file, 'utf8');

describe('staff time reports calendar parity', () => {
  it('uses the same compact slot rhythm as the personnel calendar', () => {
    expect(source).toContain('const SLOT_PX = 25;');
    expect(source).toContain('const HOUR_PX = SLOT_PX * 2;');
  });

  it('matches the tighter calendar rail and column widths', () => {
    expect(source).toContain('const COL_MIN = 95;');
    expect(source).toContain('const RAIL_PX = 28;');
  });
});