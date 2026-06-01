import { describe, it, expect } from 'vitest';
import {
  formatTeamVehicleLine,
  vehicleNames,
  type TeamVehicleInfo,
} from '@/lib/teamVehicles';

/**
 * Pure builder-test för bil-rubriken: säkerställer formatet
 * "Bil: X" (en bil) respektive "Bil1: X, Bil2: Y" (flera).
 * Driver både personalkalenderns header och mobilens jobbkort.
 */

describe('formatTeamVehicleLine', () => {
  it('returnerar tom sträng utan bilar', () => {
    expect(formatTeamVehicleLine([])).toBe('');
  });

  it('hanterar icke-array säkert', () => {
    expect(formatTeamVehicleLine(null as unknown as string[])).toBe('');
    expect(formatTeamVehicleLine(undefined as unknown as string[])).toBe('');
  });

  it('formaterar EN bil som "Bil: <namn>"', () => {
    expect(formatTeamVehicleLine(['VW Crafter'])).toBe('Bil: VW Crafter');
  });

  it('numrerar flera bilar', () => {
    expect(formatTeamVehicleLine(['Crafter', 'Sprinter'])).toBe(
      'Bil1: Crafter, Bil2: Sprinter',
    );
    expect(formatTeamVehicleLine(['A', 'B', 'C'])).toBe(
      'Bil1: A, Bil2: B, Bil3: C',
    );
  });
});

describe('vehicleNames', () => {
  it('plockar ut namn och filtrerar bort tomma', () => {
    const vs: TeamVehicleInfo[] = [
      { id: '1', name: 'Crafter', registration_number: 'ABC123' },
      { id: '2', name: '   ', registration_number: null },
      { id: '3', name: 'Sprinter', registration_number: null },
    ];
    expect(vehicleNames(vs)).toEqual(['Crafter', 'Sprinter']);
  });

  it('hanterar null/undefined', () => {
    expect(vehicleNames(null)).toEqual([]);
    expect(vehicleNames(undefined)).toEqual([]);
  });
});

describe('vehicle filter (own + active) — speglar useTeamVehiclesForDay', () => {
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
