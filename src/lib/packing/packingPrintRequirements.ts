import type { PrintablePackingRow } from './printPackingList';

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase('sv-SE')
    .replace(/^[↳└⦿\s,\-–—]+/, '')
    .trim();

const includesAny = (names: string[], terms: string[]): boolean =>
  names.some((name) => terms.some((term) => name.includes(term)));

/**
 * Small, print-only safety check for the explicit warehouse rules requested.
 * It never mutates a booking or WMS quantity.
 */
export const derivePackingPrintRequirements = (rows: PrintablePackingRow[]): string[] => {
  const names = rows.map((row) => normalize(row.name));
  const requirements: string[] = [];

  const hasLevelledFloor = includesAny(names, ['niveller', 'avvägt golv', 'levelled floor', 'leveled floor']);
  if (hasLevelledFloor) {
    requirements.push(
      includesAny(names, ['laser'])
        ? 'Avvägt/nivellerat golv: laser finns i packlistan.'
        : 'OBS – avvägt/nivellerat golv: laser saknas i packlistan.',
    );
    requirements.push('Avvägt/nivellerat golv: ritning ska följa med packningen.');
  }

  if (includesAny(names, ['spett'])) {
    requirements.push(
      includesAny(names, ['hammare', 'slägga'])
        ? 'Spett: hammare/slägga finns i packlistan.'
        : 'OBS – spett finns, men hammare/slägga saknas i packlistan.',
    );
  }

  if (includesAny(names, ['takduk', 'roof'])) {
    requirements.push(
      includesAny(names, ['rep', 'lina'])
        ? 'Tak: rep/lina finns i packlistan.'
        : 'OBS – tak finns, men rep/lina saknas i packlistan.',
    );
  }

  return requirements;
};
