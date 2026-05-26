import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  path.resolve('src/components/project/PhaseDatesEditor.tsx'),
  'utf8',
);

describe('PhaseDatesEditor team selection UX', () => {
  it('renders explicit team selection inside the placement flow', () => {
    expect(source).toContain('Välj team');
    expect(source).toContain('SelectValue placeholder="Välj team"');
    expect(source).toContain('{teamOptions.map((t) => (');
    expect(source).toContain('<SelectItem key={t.id} value={t.id}>');
  });
});
