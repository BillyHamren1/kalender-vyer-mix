import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ update: vi.fn(), single: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }),
  update: (payload: unknown) => { mocks.update(payload); return { eq: () => ({ select: () => ({ single: mocks.single }) }) }; },
}) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { InternalProjectFollowup } from '../InternalProjectFollowup';
import type { Project } from '@/types/project';
const project = { id: 'internal-one', project_kind: 'internal_project', status: 'planning', budget_hours: 8, budget_cost_minor: 20000, remaining_hours: 0, remaining_cost_minor: 0 } as Project;
beforeEach(() => { vi.clearAllMocks(); mocks.single.mockResolvedValue({ data: { id: project.id }, error: null }); });
afterEach(cleanup);
function show() {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 render(<QueryClientProvider client={client}><InternalProjectFollowup project={project} /></QueryClientProvider>);
 return { close: () => screen.getByRole('button', { name: 'Avsluta operativt' }), save: () => screen.getByRole('button', { name: 'Spara uppföljning' }) };
}
it('requires visible forecast edits to be saved before operational close', async () => {
 const ui = show();
 fireEvent.change(screen.getByLabelText('Återstående timmar'), { target: { value: '2' } });
 expect(ui.close()).toBeDisabled();
 expect(screen.getByText('Spara ändringarna innan projektet avslutas.')).toBeVisible();
 fireEvent.click(ui.close()); expect(mocks.update).not.toHaveBeenCalled();
 fireEvent.click(ui.save());
 await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ remaining_hours: 2 })));
 await waitFor(() => expect(ui.close()).not.toBeDisabled());
 // Database retains authority to reject nonzero remaining work. UI gate protects unsaved edits.
});
it('keeps failed edits unsaved and prevents close from discarding them', async () => {
 mocks.single.mockResolvedValue({ data: null, error: new Error('Save rejected') });
 const ui = show(); fireEvent.change(screen.getByLabelText('Veckouppföljning och nästa milstolpe'), { target: { value: 'Two tasks left' } });
 fireEvent.click(ui.save()); await waitFor(() => expect(mocks.single).toHaveBeenCalled());
 await waitFor(() => expect(ui.save()).not.toBeDisabled()); expect(ui.close()).toBeDisabled();
});
it('prevents forecast editing and a competing close during an in-flight save', async () => {
 let resolve!: (value: unknown) => void; mocks.single.mockReturnValue(new Promise(r => { resolve = r; }));
 const ui = show(); fireEvent.change(screen.getByLabelText('Budget timmar'), { target: { value: '10' } }); fireEvent.click(ui.save());
 await waitFor(() => expect(ui.save()).toBeDisabled());
 expect(screen.getByLabelText('Budget timmar')).toBeDisabled(); expect(ui.close()).toBeDisabled();
 resolve({ data: { id: project.id }, error: null });
 await waitFor(() => expect(ui.close()).not.toBeDisabled());
 fireEvent.click(ui.close()); await waitFor(() => expect(mocks.update).toHaveBeenLastCalledWith({ status: 'completed' }));
});
