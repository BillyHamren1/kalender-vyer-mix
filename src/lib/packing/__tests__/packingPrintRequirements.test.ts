import { describe, expect, it } from 'vitest';
import { derivePackingPrintRequirements } from '../packingPrintRequirements';

describe('derivePackingPrintRequirements', () => {
  it('flags missing laser and drawing for a levelled floor', () => {
    const requirements = derivePackingPrintRequirements([
      { name: 'Kassettgolv 4x9 – byggs nivellerat helt i våg', quantity: 1 },
    ]);

    expect(requirements).toContain('OBS – avvägt/nivellerat golv: laser saknas i packlistan.');
    expect(requirements).toContain('Avvägt/nivellerat golv: ritning ska följa med packningen.');
  });

  it('confirms the requested companion products when present', () => {
    const requirements = derivePackingPrintRequirements([
      { name: 'H MT Spett', quantity: 4 },
      { name: 'Hammare', quantity: 1 },
      { name: 'M Takduk 10 meter – Vit', quantity: 3 },
      { name: 'Rep', quantity: 1 },
    ]);

    expect(requirements).toContain('Spett: hammare/slägga finns i packlistan.');
    expect(requirements).toContain('Tak: rep/lina finns i packlistan.');
  });

  it('does not add unrelated requirements', () => {
    expect(derivePackingPrintRequirements([{ name: 'Fällbord', quantity: 2 }])).toEqual([]);
  });
});
