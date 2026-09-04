import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Kontrakt: det konstanta interna Lager-projektet är organisationsstyrt
 * (organizations.internal_lager_enabled). Frans August har det påslaget;
 * övriga organisationer ska inte ha Lager liggande som en konstant i
 * kalender, projektlista eller mobilapp.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('internal-lager-org-flag', () => {
  it('kalenderblocket gates av organisationsflaggan', () => {
    const src = read('src/hooks/useInternalLagerCalendarEvents.ts');
    expect(src).toContain('useInternalLagerEnabled');
    expect(src).toContain('enabled: internalLagerEnabled');
  });

  it('projektlistan döljer interna projekt när flaggan är av', () => {
    const src = read('src/components/project/UnifiedProjectList.tsx');
    expect(src).toContain('useInternalLagerEnabled');
    expect(src).toContain('if (isInternal && !internalLagerEnabled) return;');
  });

  it('mobil-appens Lager-bro gates av organisationsflaggan', () => {
    const src = read('supabase/functions/mobile-app-api/index.ts');
    expect(src).toContain('internal_lager_enabled');
    expect(src).toContain('if (lagerDates.length > 0 && internalLagerEnabled)');
  });

  it('hooken läser organizations.internal_lager_enabled', () => {
    const src = read('src/hooks/useInternalLagerEnabled.ts');
    expect(src).toContain(".from('organizations')");
    expect(src).toContain('internal_lager_enabled');
  });
});
