import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';

const ORG = 'synthetic-tenant-0001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: ORG, isLoading: false, error: null }),
}));

import TimeV2ModulePage from '@/features/time-v2/pages/TimeV2ModulePage';

const renderModule = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2']}>
        <Routes>
          <Route path="/time-v2" element={<TimeV2ModulePage />} />
          <Route path="/staff-management/time" element={<div>LEGACY TID OCH LÖN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Time V2 desktop journey', () => {
  beforeEach(() => clearLocalOverrides());

  it('flag OFF → legacy Time remains the default path', async () => {
    renderModule();
    await waitFor(() => expect(screen.getByText('LEGACY TID OCH LÖN')).toBeInTheDocument());
    expect(screen.queryByTestId('time-v2-module')).toBeNull();
  });

  it('flag ON for the synthetic tenant → the separate Time V2 module opens', async () => {
    writeLocalOverride(ORG, true);
    renderModule();
    await waitFor(() => expect(screen.getByTestId('time-v2-module')).toBeInTheDocument());
    expect(screen.getByText('Tid V2')).toBeInTheDocument();
    // Truthful state: no source configured in test env → no fabricated rows.
    expect(screen.getByText(/inte konfigurerad/i)).toBeInTheDocument();
    expect(screen.queryByText('Granskningskö')).toBeNull();
  });

  it('disabling the flag restores legacy-only behaviour', async () => {
    writeLocalOverride(ORG, true);
    writeLocalOverride(ORG, false);
    renderModule();
    await waitFor(() => expect(screen.getByText('LEGACY TID OCH LÖN')).toBeInTheDocument());
  });
});
