import { describe, it, expect } from 'vitest';

/**
 * Pure builder-test för bil-rubriken i team-headern: säkerställer formatet
 * "Bil: X" (en bil) respektive "Bil1: X, Bil2: Y" (flera).
 * Speglar formaterings-logiken i src/components/Calendar/TimeGrid.tsx.
 */
const buildVehicleLine = (names: string[]): string => {
  if (names.length === 0) return '';
  if (names.length === 1) return `Bil: ${names[0]}`;
  return names.map((n, i) => `Bil${i + 1}: ${n}`).join(', ');
};

describe('team vehicle line', () => {
  it('returnerar tom sträng utan bilar', () => {
    expect(buildVehicleLine([])).toBe('');
  });

  it('formaterar EN bil som "Bil: <namn>"', () => {
    expect(buildVehicleLine(['VW Crafter'])).toBe('Bil: VW Crafter');
  });

  it('numrerar flera bilar', () => {
    expect(buildVehicleLine(['Crafter', 'Sprinter'])).toBe(
      'Bil1: Crafter, Bil2: Sprinter'
    );
    expect(buildVehicleLine(['A', 'B', 'C'])).toBe('Bil1: A, Bil2: B, Bil3: C');
  });
});

describe('vehicle filter (own + active)', () => {
  type V = { id: string; is_external: boolean; is_active: boolean };
  const filterOwnActive = (vs: V[]) => vs.filter((v) => !v.is_external && v.is_active);

  it('filtrerar bort externa och inaktiva', () => {
    const out = filterOwnActive([
      { id: '1', is_external: false, is_active: true },
      { id: '2', is_external: true, is_active: true },
      { id: '3', is_external: false, is_active: false },
      { id: '4', is_external: false, is_active: true },
    ]);
    expect(out.map((v) => v.id)).toEqual(['1', '4']);
  });
});
