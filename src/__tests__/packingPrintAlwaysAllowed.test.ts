import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const componentPath = path.join(
  process.cwd(),
  'src/components/packing/DesktopChecklistView.tsx',
);
const printerPath = path.join(process.cwd(), 'src/lib/packing/printPackingList.ts');

describe('Packlistans utskrift', () => {
  const source = fs.readFileSync(componentPath, 'utf8');
  const printer = fs.readFileSync(printerPath, 'utf8');

  it('har ingen blockering av utskriftsknappen', () => {
    expect(source).not.toMatch(/printBlocked/);
    expect(source).not.toMatch(/disabled=\{print/);
  });

  it('skickar ingen preliminär-markering till utskriften', () => {
    expect(source).not.toContain('preliminaryNotice');
  });

  it('renderar ingen PRELIMINÄR-stämpel i utskriftens HTML', () => {
    expect(printer).not.toContain('PRELIMINÄR');
    expect(printer).not.toContain('preliminaryNotice');
  });
});
