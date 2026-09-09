import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PackingIntegrityBanner } from './PackingIntegrityBanner';
import type { PackingIntegrityResult } from '@/lib/packing/packingIntegrity';

const baseIntegrity: PackingIntegrityResult = {
  isExactMatch: false,
  sourceAvailable: true,
  expectedRows: 3,
  packingRows: 0,
  manualRows: 0,
  excludedRows: 0,
  blockingCount: 1,
  warningCount: 0,
  checkedAt: new Date().toISOString(),
  issues: [
    {
      type: 'missing_item',
      severity: 'blocking',
      name: 'Transport',
      bookingProductId: 'bp-1',
      expectedQuantity: 2,
    },
  ],
};

describe('PackingIntegrityBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('visar varningsbannern när den inte är avfärdad', () => {
    render(<PackingIntegrityBanner integrity={baseIntegrity} packingId="pack-1" />);
    expect(screen.getByText('Packlistan får inte användas utan kontroll')).toBeInTheDocument();
  });

  it('döljer bannern efter att användaren klickat på krysset', () => {
    const { rerender } = render(<PackingIntegrityBanner integrity={baseIntegrity} packingId="pack-1" />);
    fireEvent.click(screen.getByLabelText('Avfärda varning'));
    expect(screen.queryByText('Packlistan får inte användas utan kontroll')).not.toBeInTheDocument();

    // Verifiera att avfärdandet överlever en omrendering
    rerender(<PackingIntegrityBanner integrity={baseIntegrity} packingId="pack-1" />);
    expect(screen.queryByText('Packlistan får inte användas utan kontroll')).not.toBeInTheDocument();
  });

  it('visar bannern igen när avvikelserna ändrats', () => {
    const { rerender } = render(<PackingIntegrityBanner integrity={baseIntegrity} packingId="pack-1" />);
    fireEvent.click(screen.getByLabelText('Avfärda varning'));
    expect(screen.queryByText('Packlistan får inte användas utan kontroll')).not.toBeInTheDocument();

    const changedIntegrity: PackingIntegrityResult = {
      ...baseIntegrity,
      issues: [
        {
          type: 'missing_item',
          severity: 'blocking',
          name: 'Belysning',
          bookingProductId: 'bp-2',
          expectedQuantity: 1,
        },
      ],
    };

    rerender(<PackingIntegrityBanner integrity={changedIntegrity} packingId="pack-1" />);
    expect(screen.getByText('Packlistan får inte användas utan kontroll')).toBeInTheDocument();
  });

  it('kör en ny kontroll när användaren klickar Kontrollera igen', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<PackingIntegrityBanner integrity={baseIntegrity} packingId="pack-1" onRefresh={onRefresh} />);

    fireEvent.click(screen.getByText('Kontrollera igen'));
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.getByText('Packlistan får inte användas utan kontroll')).toBeInTheDocument();
  });
});
