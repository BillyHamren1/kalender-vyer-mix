import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('src/components/project/PhaseDatesEditor.tsx'),
  'utf8',
);

describe('PhaseDatesEditor team selection UX', () => {
  it('renders explicit team selection inside the placement flow', () => {
    expect(source).toContain('text-muted-foreground">Team</Label>');
    expect(source).toContain('<Select value={teamId} onValueChange={setTeam} disabled={locked}>');
    expect(source).toContain('{teamOptions.map((t) => (');
    expect(source).toContain('<SelectItem key={t.id} value={t.id}>');
  });
});
