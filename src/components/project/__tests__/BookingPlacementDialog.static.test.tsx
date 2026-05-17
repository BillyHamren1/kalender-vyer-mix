import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('src/components/project/BookingPlacementDialog.tsx'),
  'utf8',
);

describe('BookingPlacementDialog team selection UX', () => {
  it('renders explicit team selection buttons above the calendar', () => {
    expect(source).toContain('Välj vilket team blocket ska placeras i');
    expect(source).toContain("aria-pressed={isSelected}");
    expect(source).toContain("teamOptions.map((team) => {");
    expect(source).toContain("onClick={() => updateCurrent({ teamId: team.id })}");
  });
});
