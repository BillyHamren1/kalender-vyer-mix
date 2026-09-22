import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ProjectProductsList — tillbehörsbadge', () => {
  const filePath = path.resolve(__dirname, '../components/project/ProjectProductsList.tsx');
  const source = fs.readFileSync(filePath, 'utf-8');

  it('renderar ingen "Tillbehör"-badge bredvid tillbehörsrader', () => {
    // Badgen får inte finnas i renderChildRow eller annan JSX.
    const badgePattern = /<span[^>]*>\s*Tillbehör\s*<\/span>/;
    expect(source).not.toMatch(badgePattern);
  });
});
