import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PackingIntegrityBanner } from './PackingIntegrityBanner';
import type { PackingIntegrityResult } from '@/lib/packing/packingIntegrity';

const problemIntegrity: PackingIntegrityResult = {
  isExactMatch: false,
  sourceAvailable: true,
  expectedRows: 3,
  packingRows: 0,
  manualRows: 0,
  excludedRows: 0,
  blockingCount: 1,
  warningCount: 0,
  checkedAt: new Date().toISOString(),
  issues: [{
    type: 'missing_item',
    severity: 'blocking',
    name: 'Transport',
    bookingProductId: 'bp-1',
    expectedQuantity: 2,
  }],
};

describe('PackingIntegrityBanner', () => {
  it('visar bara en diskret varningstriangel tills användaren öppnar problemen', () => {
    render(<PackingIntegrityBanner integrity={problemIntegrity} packingId="pack-1" />);

    expect(screen.getByLabelText('Visa problem med packlistan (1)')).toBeInTheDocument();
    expect(screen.queryByText('Problem med packlistan')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Visa problem med packlistan (1)'));
    expect(screen.getByText('Problem med packlistan')).toBeInTheDocument();
    expect(screen.getByText(/Transport: finns i bokningen/)).toBeInTheDocument();
  });

  it('visar ingenting vid laddning eller när listan matchar', () => {
    const { rerender, container } = render(<PackingIntegrityBanner integrity={null} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<PackingIntegrityBanner integrity={{ ...problemIntegrity, isExactMatch: true, blockingCount: 0, issues: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('visar tekniskt fel först efter klick på varningstriangeln', () => {
    render(<PackingIntegrityBanner integrity={null} error={new Error('network')} />);
    fireEvent.click(screen.getByLabelText('Visa problem med packlistan (1)'));
    expect(screen.getByText('Packlistans underlag kunde inte kontrolleras.')).toBeInTheDocument();
  });
});