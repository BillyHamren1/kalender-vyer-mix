import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InternalProjectFollowup } from '../InternalProjectFollowup';
import type { Project } from '@/types/project';

const backend = vi.hoisted(() => ({ rows: [] as any[], readError: null as Error | null,
  writeError: null as Error | null, writes: [] as any[], readIds: [] as string[],
  receipt: undefined as undefined | Promise<unknown>, success: vi.fn(), error: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: backend.success, error: backend.error } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  if (table === 'project_staff_time_cost_lines') return { select: () => ({ eq: (_key: string, id: string) => ({ order: () => ({ range: async () => {
    backend.readIds.push(id); return { data: backend.rows, error: backend.readError };
  } }) }) }) };
  if (table === 'projects') return { update: (payload: unknown) => ({ eq: (_key: string, id: string) => ({ select: () => ({ single: async () => {
    backend.writes.push({ id, payload });
    if (backend.receipt) return backend.receipt;
    return { data: backend.writeError ? null : { id }, error: backend.writeError };
  } }) }) }) };
  throw new Error(`Unexpected table ${table}`);
} } }));
const project = (id = 'project-one', values: Partial<Project> = {}) => ({ id, name: 'Ombyggnad', project_kind: 'internal_project', status: 'in_progress',
  booking_id: null, is_internal: false, budget_currency: 'SEK', budget_hours: 40, budget_cost_minor: 100000,
  remaining_hours: 0, remaining_cost_minor: 0, ...values } as Project);
function mount(initial = project()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = (p: Project) => <QueryClientProvider client={client}><InternalProjectFollowup key={p.id} project={p} /></QueryClientProvider>;
  const rendered = render(view(initial));
  return { ...rendered, replace: (p: Project) => rendered.rerender(view(p)) };
}
beforeEach(() => { backend.rows = []; backend.readError = null; backend.writeError = null; backend.writes = []; backend.readIds = []; backend.receipt = undefined; vi.clearAllMocks(); });

describe('internal project followup actual renderer', () => {
  it('keeps denied/unavailable evidence unknown rather than showing zero', async () => {
    backend.readError = new Error('permission denied'); mount();
    expect((await screen.findByRole('alert')).textContent).toContain('okända');
    expect(screen.queryByText('0 h')).toBeNull();
  });
  it('keeps an empty successful evidence read unknown rather than showing zero', async () => {
    mount();
    expect(await screen.findByText('Okänt tidsunderlag')).toBeTruthy();
    expect(screen.getAllByText('Underlag saknas')).toHaveLength(2);
    expect(screen.queryByText('0 h')).toBeNull();
    expect(screen.queryByText(/^0,00\s*kr$/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('shows explicit valid zero evidence without claiming a verified final cost', async () => {
    backend.rows = [{ id: 'zero-line', minutes: 0, cost: 0, rate_source: 'staff_members', submission_status: 'approved' }];
    mount();
    expect(await screen.findByText('0 h')).toBeTruthy();
    expect(screen.getAllByText(/^0,00\s*kr$/)).toHaveLength(2);
    expect(screen.queryByText('Underlag saknas')).toBeNull();
    expect(screen.queryByText('Ofullständigt underlag')).toBeNull();
    expect(screen.getByText(/En fullständig slutkostnad är ännu inte verifierad/)).toBeTruthy();
  });
  it('keeps an excluded-only projection unknown rather than treating excluded values as evidence', async () => {
    backend.rows = [{ id: 'draft-line', minutes: 60, cost: 500, rate_source: 'staff_members', submission_status: 'draft' }];
    mount();
    expect(await screen.findByText('Okänt tidsunderlag')).toBeTruthy();
    expect(screen.getAllByText('Underlag saknas')).toHaveLength(2);
    expect(screen.queryByText('0 h')).toBeNull();
    expect(screen.queryByText('1 h')).toBeNull();
    expect(screen.queryByText(/^500,00\s*kr$/)).toBeNull();
  });
  it('renders incomplete costs when approved rows lack rate provenance', async () => {
    backend.rows = [{ id: 'line', minutes: 60, cost: 0, rate_source: null, submission_status: 'approved' }]; mount();
    expect(await screen.findByText('1 h')).toBeTruthy();
    expect(screen.getAllByText('Ofullständigt underlag')).toHaveLength(2);
  });
  it.each([NaN, Infinity, -30])('does not present invalid numerical evidence (%s) as complete', async invalid => {
    backend.rows = [{ id: 'line', minutes: invalid, cost: invalid, rate_source: 'staff_members', submission_status: 'approved' }]; mount();
    await waitFor(() => expect(screen.queryByText('Läser rapporterad tid…')).toBeNull());
    expect(screen.getAllByText('Ofullständigt underlag').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('NaN h')).toBeNull();
  });
  it('waits for the exact project write receipt before reporting save success', async () => {
    let resolve!: (value: unknown) => void;
    backend.receipt = new Promise(done => { resolve = done; });
    mount(); await screen.findByText('Okänt tidsunderlag');
    fireEvent.change(screen.getByLabelText('Budget timmar'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Spara uppföljning' }));
    await waitFor(() => expect(backend.writes).toHaveLength(1));
    expect(backend.writes[0]).toMatchObject({ id: 'project-one', payload: { budget_hours: 45, budget_cost_minor: 100000 } });
    expect(backend.success).not.toHaveBeenCalled();
    resolve({ data: { id: 'project-one' }, error: null });
    await waitFor(() => expect(backend.success).toHaveBeenCalledWith('Uppföljning sparad'));
  });
  it('surfaces server operational-close rejection without announcing completion', async () => {
    backend.writeError = new Error('Återstående arbete finns'); mount(); await screen.findByText('Okänt tidsunderlag');
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta operativt' }));
    await waitFor(() => expect(backend.error).toHaveBeenCalledWith('Återstående arbete finns'));
    expect(backend.success).not.toHaveBeenCalled();
    expect(backend.writes[0]).toEqual({ id: 'project-one', payload: { status: 'completed' } });
  });
  it('resets draft values and reads the new identity when the keyed project route changes', async () => {
    const view = mount(); await screen.findByText('Okänt tidsunderlag');
    fireEvent.change(screen.getByLabelText('Budget timmar'), { target: { value: '999' } });
    view.replace(project('project-two', { budget_hours: 12 }));
    expect(screen.getByLabelText('Budget timmar')).toHaveValue(12);
    await waitFor(() => expect(backend.readIds).toContain('project-two'));
    fireEvent.click(screen.getByRole('button', { name: 'Spara uppföljning' }));
    await waitFor(() => expect(backend.writes[0]).toMatchObject({ id: 'project-two', payload: { budget_hours: 12 } }));
  });
  it('does not offer project completion for a permanent internal activity', async () => {
    mount(project('lager', { project_kind: 'internal_activity' })); await screen.findByText('Okänt tidsunderlag');
    expect(screen.queryByRole('button', { name: 'Avsluta operativt' })).toBeNull();
  });
});
