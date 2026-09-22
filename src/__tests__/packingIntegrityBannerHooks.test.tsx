import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PackingIntegrityBanner } from '@/components/packing/PackingIntegrityBanner';

const integrity = {
  sourceAvailable: true,
  isExactMatch: false,
  expectedRows: 10,
  blockingCount: 1,
  warningCount: 0,
  issues: [
    { severity: 'blocking' as const, code: 'missing_row', message: 'Rad saknas', name: 'Tält' },
  ],
} as any;

describe('PackingIntegrityBanner', () => {
  it('kraschar inte när laddningsläget byts mot ett resultat (hook-ordning)', () => {
    const { rerender, container } = render(
      <PackingIntegrityBanner integrity={null} packingId="pack-1" />,
    );
    expect(container).toBeEmptyDOMElement();

    expect(() =>
      rerender(<PackingIntegrityBanner integrity={integrity} packingId="pack-1" />),
    ).not.toThrow();
    expect(container.querySelector('[aria-label="Visa problem med packlistan (1)"]')).not.toBeNull();
  });
});
