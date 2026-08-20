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

  it('har ingen blockering av utskriftsknappen', () => {
    expect(source).not.toMatch(/printBlocked/);
    expect(source).not.toMatch(/disabled=\{print/);
  });

  it('skickar preliminär-markering till utskriften', () => {
    expect(source).toContain('preliminaryNotice: printPreliminaryReason');
  });

  it('markerar utskriften när WMS eller integritet inte är verifierad', () => {
    expect(source).toContain("wmsPreflightState !== 'pass'");
    expect(source).toContain('printPreliminaryReason');
  });

  it('renderar stämpeln i utskriftens HTML', () => {
    const printer = fs.readFileSync(printerPath, 'utf8');
    expect(printer).toContain('PRELIMINÄR');
    expect(printer).toContain('preliminaryNotice');
  });
});
