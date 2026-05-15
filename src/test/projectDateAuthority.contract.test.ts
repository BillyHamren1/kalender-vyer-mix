// Kontrakttest för projectDateAuthority.
// Verifierar att fasaden bygger rätt payload till edge function.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { writeProjectDates } from '@/services/projectDateAuthority';

describe('projectDateAuthority.writeProjectDates', () => {
  beforeEach(() => invokeMock.mockReset());

  it('skickar rätt payload till apply-project-dates', async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, results: [{ booking_id: 'b1', local_updated: true, external_pushed: true, external_status: 200, calendar_rebuilt: true }] },
      error: null,
    });

    const res = await writeProjectDates({
      projectId: 'p1',
      projectType: 'large',
      organizationId: 'org1',
      dates: { rig: ['2026-05-14', '2026-05-16'], rigDown: ['2026-05-20'] },
    });

    expect(invokeMock).toHaveBeenCalledWith('apply-project-dates', {
      body: {
        project_id: 'p1',
        project_type: 'large',
        organization_id: 'org1',
        dates: { rig: ['2026-05-14', '2026-05-16'], rigDown: ['2026-05-20'] },
      },
    });
    expect(res.ok).toBe(true);
    expect(res.results[0].calendar_rebuilt).toBe(true);
  });

  it('mappar fel från edge function till resultat', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await writeProjectDates({
      projectId: 'p1', projectType: 'medium', organizationId: 'o', dates: {},
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });
});
