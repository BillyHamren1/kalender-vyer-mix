import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';
import { normalizePreviewBundle } from '@/features/time-v2/lib/contract';

const ORG = 'synthetic-tenant-0001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: ORG, isLoading: false, error: null }),
}));

/**
 * Synthetic Time server state for the complete pilot journey:
 * assignment → activation → evidence → Day Agent draft → worker use/adjust →
 * locks survive refresh → submit → Planning correction → resubmit → attest → preview.
 */
const timeServer = {
  revision: 3,
  payrollAttested: true,
  projectAttested: false,
  preview() {
    return normalizePreviewBundle({
      submission_id: 'sub-1',
      revision: this.revision,
      snapshot_version: 'snap-abc',
      is_test_fixture: true,
      payroll: {
        attested: this.payrollAttested,
        total_minutes: 455,
        total_amount: 2450,
        currency: 'SEK',
        lines: [
          { line_id: 'p1', label: 'Arbete Projekt A', target_id: 'proj-a', minutes: 410, amount: 2050 },
          { line_id: 'p2', label: 'Resa', target_id: null, minutes: 45, amount: 400 },
        ],
      },
      project: {
        attested: this.projectAttested,
        blocked_reason: this.projectAttested ? null : 'Projektdomänen är inte attesterad i Time.',
        lines: this.projectAttested
          ? [{ line_id: 'c1', label: 'Projekt A', target_id: 'proj-a', minutes: 410, amount: 2050, currency: 'SEK' }]
          : [],
      },
    })!;
  },
};

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>(
    '@/features/time-v2/lib/client',
  );
  return {
    ...actual,
    getTimeV2BaseUrl: () => 'https://time.test',
    fetchTimeV2Preview: vi.fn(async () => timeServer.preview()),
  };
});

import TimeV2PreviewPage from '@/features/time-v2/pages/TimeV2PreviewPage';

const renderPreview = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2/preview/sub-1']}>
        <Routes>
          <Route path="/time-v2/preview/:submissionId" element={<TimeV2PreviewPage />} />
          <Route path="/staff-management/time" element={<div>LEGACY TIME</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Planning Time V2 pilot checkpoint — payroll/project preview', () => {
  beforeEach(() => {
    clearLocalOverrides();
    timeServer.revision = 3;
    timeServer.payrollAttested = true;
    timeServer.projectAttested = false;
  });

  it('flag OFF keeps legacy Time as the default path', async () => {
    renderPreview();
    await waitFor(() => expect(screen.getByText('LEGACY TIME')).toBeInTheDocument());
    expect(screen.queryByTestId('time-v2-preview')).toBeNull();
  });

  it('flag ON renders the attested snapshot preview with TEST/PREVIEW labels and export', async () => {
    writeLocalOverride(ORG, true);
    renderPreview();

    await waitFor(() => expect(screen.getByTestId('time-v2-preview-payroll')).toBeInTheDocument());
    expect(screen.getByText('TEST')).toBeInTheDocument();
    expect(screen.getAllByText('FÖRHANDSVISNING').length).toBe(2);
    expect(screen.getByText(/Revision 3/)).toBeInTheDocument();
    expect(screen.getByTestId('time-v2-preview-line-p1')).toHaveTextContent('Arbete Projekt A');
    expect(screen.getByTestId('time-v2-preview-minutes-payroll')).toHaveTextContent('7');

    // Payroll is attested -> export enabled. Project is not -> blocked, no fabricated rows.
    expect(screen.getByTestId('time-v2-export-payroll')).not.toBeDisabled();
    expect(screen.getByTestId('time-v2-export-project')).toBeDisabled();
    expect(screen.getByTestId('time-v2-preview-blocked-project')).toHaveTextContent('inte attesterad');
    expect(screen.queryByTestId('time-v2-preview-line-c1')).toBeNull();
  });

  it('exports a preview-labelled file without posting anywhere', async () => {
    writeLocalOverride(ORG, true);
    const postSpy = vi.fn();
    vi.stubGlobal('fetch', postSpy as unknown as typeof fetch);
    const created: string[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:test',
      revokeObjectURL: (u: string) => created.push(u),
    } as unknown as typeof URL);

    renderPreview();
    await waitFor(() => expect(screen.getByTestId('time-v2-export-payroll')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('time-v2-export-payroll'));

    expect(created).toContain('blob:test');
    expect(postSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('shows the project preview once Time reports it attested', async () => {
    writeLocalOverride(ORG, true);
    timeServer.projectAttested = true;
    renderPreview();

    await waitFor(() => expect(screen.getByTestId('time-v2-preview-line-c1')).toBeInTheDocument());
    expect(screen.getByTestId('time-v2-export-project')).not.toBeDisabled();
    expect(screen.queryByTestId('time-v2-preview-blocked-project')).toBeNull();
  });
});
