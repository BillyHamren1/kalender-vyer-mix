import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearLocalOverrides, writeLocalOverride } from '@/features/time-v2/lib/moduleFlag';
import { normalizeSubmissionDetail } from '@/features/time-v2/lib/contract';

const ORG = 'synthetic-tenant-0001';

vi.mock('@/hooks/useOrganizationId', () => ({
  useOrganizationId: () => ({ organizationId: ORG, isLoading: false, error: null }),
}));

/**
 * Synthetic Time server: owns the immutable snapshot chain.
 * Planning only reads it and posts versioned commands against a revision.
 */
const timeServer = {
  revision: 1,
  correctionReason: null as string | null,
  resubmitted: false,
  payrollAttested: false,
  decisions: [{ id: 'd1', action: 'submitted', actor: 'Anna', revision: 1 }] as Array<Record<string, unknown>>,
  detail() {
    return normalizeSubmissionDetail({
      submission_id: 'sub-1',
      date: '2026-09-01',
      personnel_name: 'Anna Test',
      state: this.resubmitted ? 'resubmitted' : this.correctionReason ? 'correction_requested' : 'submitted',
      group: this.correctionReason && !this.resubmitted ? 'correction' : 'needs_review',
      revision: this.revision,
      immutable: true,
      totals: { total_minutes: 485, work_minutes: 410, travel_minutes: 45, break_minutes: 30 },
      segments: [{ id: 'seg1', kind: 'work', label: 'Arbete Projekt A', minutes: 240, locked: true }],
      decisions: this.decisions,
      correction: {
        requested: !!this.correctionReason,
        reason: this.correctionReason,
        resubmitted_at: this.resubmitted ? '2026-09-02T10:00:00Z' : null,
      },
      attestability: {
        payroll: this.resubmitted,
        project: false,
        payroll_attested: this.payrollAttested,
        blocked_reason: this.resubmitted ? null : 'Väntar på medarbetarens omskick',
      },
      is_test_fixture: true,
    })!;
  },
  /** Time worker acts: adjusts timeline, keeps locks, resubmits a new revision. */
  workerResubmits() {
    this.revision += 1;
    this.resubmitted = true;
    this.decisions = [
      ...this.decisions,
      { id: 'd3', action: 'resubmitted', actor: 'Anna', revision: this.revision },
    ];
  },
};

vi.mock('@/features/time-v2/lib/client', async () => {
  const actual = await vi.importActual<typeof import('@/features/time-v2/lib/client')>(
    '@/features/time-v2/lib/client',
  );
  return {
    ...actual,
    getTimeV2BaseUrl: () => 'https://time.test',
    fetchTimeV2SubmissionDetail: vi.fn(async () => timeServer.detail()),
  };
});

import TimeV2SubmissionDetailPage from '@/features/time-v2/pages/TimeV2SubmissionDetailPage';

/**
 * Synthetic Time boundary: Planning posts the real adapter operations
 * (review.requestCorrection / attest.payroll) through its own proxy.
 */
const commandInvoke = vi.fn(async (body: Record<string, unknown>) => {
  const operation = String(body.operation);
  const revision = Number(String(body.idempotencyKey ?? '').split(':').pop()?.replace(/^r/, ''));
  if (revision !== timeServer.revision) {
    return { data: { code: 'stale_revision' }, error: { context: { status: 409 } } };
  }
  if (operation === 'review.requestCorrection') {
    timeServer.revision += 1;
    timeServer.correctionReason = String(body.reason);
    timeServer.decisions = [
      ...timeServer.decisions,
      { id: 'd2', action: 'correction_requested', actor: 'Planning', revision: timeServer.revision, comment: body.reason },
    ];
  }
  if (operation === 'attest.payroll') timeServer.payrollAttested = true;
  return {
    data: {
      adapterVersion: 'time-planning-adapter.v2',
      operation,
      generatedAt: null,
      data: { accepted: true, version: timeServer.revision },
    },
    error: null,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (_name: string, opts: { body: Record<string, unknown> }) => commandInvoke(opts.body) } },
}));

const renderDetail = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/time-v2/review/sub-1']}>
        <Routes>
          <Route path="/time-v2/review/:submissionId" element={<TimeV2SubmissionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Planning → worker → Planning correction journey', () => {
  beforeEach(() => {
    clearLocalOverrides();
    writeLocalOverride(ORG, true);
    timeServer.revision = 1;
    timeServer.correctionReason = null;
    timeServer.resubmitted = false;
    timeServer.payrollAttested = false;
    timeServer.decisions = [{ id: 'd1', action: 'submitted', actor: 'Anna', revision: 1 }];
    commandInvoke.mockClear();
  });

  it('requests correction, sees the worker resubmission and attests payroll independently', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('time-v2-decision-panel')).toBeInTheDocument());

    // Payroll is not attestable before the worker resubmits.
    expect(screen.getByTestId('time-v2-attest-payroll')).toBeDisabled();
    expect(screen.getByTestId('time-v2-attest-project')).toBeDisabled();

    fireEvent.change(screen.getByTestId('time-v2-correction-reason'), {
      target: { value: 'Rast saknas mellan 12:00 och 12:30' },
    });
    fireEvent.click(screen.getByTestId('time-v2-request-correction'));

    await waitFor(() => expect(screen.getByTestId('time-v2-correction-sent')).toBeInTheDocument());
    expect(String((commandInvoke.mock.calls[0][0] as Record<string, unknown>).idempotencyKey)).toContain(':r1');
    await waitFor(() =>
      expect(screen.getByTestId('time-v2-detail-correction')).toHaveTextContent('Rast saknas'),
    );

    // Time worker adjusts and resubmits a new immutable revision.
    timeServer.workerResubmits();
    fireEvent.click(screen.getByRole('button', { name: /uppdatera/i }));

    await waitFor(() => expect(screen.getAllByText(/rev 3/).length).toBeGreaterThan(0));
    const chain = screen.getByTestId('time-v2-detail-decisions');
    expect(chain).toHaveTextContent('submitted');
    expect(chain).toHaveTextContent('correction_requested');
    expect(chain).toHaveTextContent('resubmitted');
    expect(screen.getByTestId('time-v2-detail-correction')).toHaveTextContent('omskickad');

    // Payroll became attestable; project stays blocked by the contract.
    await waitFor(() => expect(screen.getByTestId('time-v2-attest-payroll')).not.toBeDisabled());
    expect(screen.getByTestId('time-v2-attest-project')).toBeDisabled();

    fireEvent.click(screen.getByTestId('time-v2-attest-payroll'));
    await waitFor(() => expect(screen.getByText('Lön attesterad')).toBeInTheDocument());
  });

  it('recovers truthfully from a stale revision (double submit)', async () => {
    renderDetail();
    await waitFor(() => expect(screen.getByTestId('time-v2-decision-panel')).toBeInTheDocument());

    // Time moved on behind Planning's back.
    timeServer.revision = 5;

    fireEvent.change(screen.getByTestId('time-v2-correction-reason'), { target: { value: 'Justera resa' } });
    fireEvent.click(screen.getByTestId('time-v2-request-correction'));

    await waitFor(() => expect(screen.getByTestId('time-v2-stale-revision')).toBeInTheDocument());
    expect(screen.getByTestId('time-v2-stale-revision')).toHaveTextContent(/ändrats i Time/i);
    expect(timeServer.correctionReason).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /läs om snapshoten/i }));
    await waitFor(() => expect(screen.queryByTestId('time-v2-stale-revision')).toBeNull());
  });
});
