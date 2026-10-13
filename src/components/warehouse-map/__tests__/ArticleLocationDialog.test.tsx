import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() }, functions: { invoke: vi.fn() } } }));
vi.mock('@/services/mobileApiService', () => ({ getToken: () => 'tok', clearAuth: vi.fn() }));

import { ArticleLocationDialog } from '../ArticleLocationDialog';
import { ArticleLocationsError } from '@/services/articleLocationsService';
import { articleFixture, ITEM, INSTANCE, ORG } from '@/__tests__/fixtures/articleLocationsFixture';

beforeEach(() => { (globalThis as any).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });

const Harness: React.FC<{ fetcher: any; instanceId?: string | null }> = ({ fetcher, instanceId = null }) => {
  const [open, setOpen] = React.useState(false);
  const [scanned, setScanned] = React.useState(3); // stand-in for scan state
  return (
    <>
      <span data-testid="scan-count">{scanned}</span>
      <button onClick={() => setScanned((n) => n)}>noop</button>
      <button onClick={() => setOpen(true)}>öppna karta</button>
      <ArticleLocationDialog open={open} onOpenChange={setOpen} target={{ name: 'Glasvägg', itemTypeId: ITEM, instanceId }} fetcher={fetcher} organizationId={ORG} sessionKey="s1" />
    </>
  );
};

describe('ArticleLocationDialog', () => {
  it('fetches lazily only on open, shows both placements and floor label, closes without touching scan state', async () => {
    const fetcher = vi.fn(async () => articleFixture());
    render(<Harness fetcher={fetcher} />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('öppna karta'));
    await screen.findByText('H1-R1-A-1');
    expect(screen.getByText('H2-R9-A-3')).toBeTruthy();
    expect(screen.getByText(/Golv, position 1/)).toBeTruthy();
    expect(screen.getByText(/Nivå 3, position 2/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /Hallkarta Hall 1/ })).toBeTruthy();
    // switch to second map via placement card
    fireEvent.click(screen.getByText('H2-R9-A-3'));
    expect(screen.getByRole('img', { name: /Hallkarta Hall 2/ })).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher.mock.calls as any)[0][0]).toMatchObject({ itemTypeId: ITEM, instanceId: null });
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('H1-R1-A-1')).toBeNull());
    expect(screen.getByTestId('scan-count').textContent).toBe('3');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shows UNKNOWN distinctly', async () => {
    const body = articleFixture();
    body.status = 'UNKNOWN';
    body.placements = [{ ...body.placements[0], state: 'SLOT_MISSING', slot: null, address: null }];
    render(<Harness fetcher={async () => body} />);
    fireEvent.click(screen.getByText('öppna karta'));
    expect(await screen.findByText(/Platsen är okänd/)).toBeTruthy();
  });

  it('shows permission error without retry and unavailable error with retry', async () => {
    const perm = vi.fn(async () => { throw new ArticleLocationsError('permission', 'Du saknar behörighet att se lagerplatser.', 'wms_forbidden'); });
    const { unmount } = render(<Harness fetcher={perm} />);
    fireEvent.click(screen.getByText('öppna karta'));
    const alert = await screen.findByRole('alert');
    expect(alert.getAttribute('data-error-kind')).toBe('permission');
    expect(within(alert).queryByText('Försök igen')).toBeNull();
    unmount();

    let calls = 0;
    const flaky = vi.fn(async () => { calls++; if (calls === 1) throw new ArticleLocationsError('offline', 'Ingen internetanslutning.'); return articleFixture(); });
    render(<Harness fetcher={flaky} />);
    fireEvent.click(screen.getByText('öppna karta'));
    const a2 = await screen.findByRole('alert');
    expect(a2.getAttribute('data-error-kind')).toBe('offline');
    fireEvent.click(within(a2).getByText('Försök igen'));
    await screen.findByText('H1-R1-A-1');
  });

  it('instance without slot offers explicit article fallback that omits instanceId and is labelled', async () => {
    const fetcher = vi.fn(async (q: any) => {
      if (q.instanceId) {
        return { ...articleFixture({ instanceId: INSTANCE }), status: 'UNPLACED', placements: [], maps: [] };
      }
      return articleFixture();
    });
    render(<Harness fetcher={fetcher} instanceId={INSTANCE} />);
    fireEvent.click(screen.getByText('öppna karta'));
    expect(await screen.findByText(/ingen registrerad plats/)).toBeTruthy();
    expect(screen.queryByText('H1-R1-A-1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Visa artikelns platser' }));
    await screen.findByText('H1-R1-A-1');
    expect(fetcher.mock.calls[1][0]).toMatchObject({ itemTypeId: ITEM, instanceId: null });
    expect(screen.getByRole('note').textContent).toMatch(/inte.*var den skannade enheten ligger/);
  });

  it('discards a stale response after the article changes', async () => {
    let resolveFirst: (v: any) => void = () => {};
    const OTHER = '44444444-4444-4444-8444-444444444444';
    const fetcher = vi.fn((q: any) => q.itemTypeId === ITEM
      ? new Promise((r) => { resolveFirst = r; })
      : Promise.resolve({ ...articleFixture(), itemTypeId: OTHER, article: { name: 'Annan artikel', sku: null } }));
    const { rerender } = render(<ArticleLocationDialog open onOpenChange={() => {}} target={{ name: 'A', itemTypeId: ITEM }} fetcher={fetcher} organizationId={ORG} sessionKey="s1" />);
    rerender(<ArticleLocationDialog open onOpenChange={() => {}} target={{ name: 'B', itemTypeId: OTHER }} fetcher={fetcher} organizationId={ORG} sessionKey="s1" />);
    await screen.findByText('Annan artikel');
    resolveFirst(articleFixture());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('Uniflex Glasvägg')).toBeNull();
    expect(((fetcher.mock.calls as any)[0][1] as AbortSignal).aborted).toBe(true);
  });

  it('switching article AND org while pending never renders the old map under the new heading', async () => {
    const OTHER = '44444444-4444-4444-8444-444444444444';
    const ORG2 = '55555555-5555-4555-8555-555555555555';
    const resolvers: Array<(v: any) => void> = [];
    const fetcher = vi.fn(() => new Promise((r) => resolvers.push(r)));
    const D = (p: any) => <ArticleLocationDialog open onOpenChange={() => {}} fetcher={fetcher} {...p} />;
    const { rerender } = render(<D target={{ name: 'A', itemTypeId: ITEM }} organizationId={ORG} sessionKey="s1" />);
    resolvers[0](articleFixture());
    await screen.findByText('H1-R1-A-1');
    rerender(<D target={{ name: 'Ny artikel', itemTypeId: OTHER }} organizationId={ORG2} sessionKey="s1" />);
    // Synchronously after rerender: old map must already be gone.
    expect(screen.queryByText('H1-R1-A-1')).toBeNull();
    expect(screen.queryByText('Uniflex Glasvägg')).toBeNull();
    expect(screen.getByText('Ny artikel')).toBeTruthy();
    expect((fetcher.mock.calls as any)[1][0]).toMatchObject({ itemTypeId: OTHER, organizationId: ORG2 });
  });

  it('session change aborts in-flight request and clears immediately; late result is ignored', async () => {
    const resolvers: Array<(v: any) => void> = [];
    const fetcher = vi.fn(() => new Promise((r) => resolvers.push(r)));
    const D = (p: any) => <ArticleLocationDialog open onOpenChange={() => {}} target={{ name: 'A', itemTypeId: ITEM }} fetcher={fetcher} organizationId={ORG} {...p} />;
    const { rerender } = render(<D sessionKey="s1" />);
    rerender(<D sessionKey="s2" />);
    expect(((fetcher.mock.calls as any)[0][1] as AbortSignal).aborted).toBe(true);
    resolvers[0](articleFixture());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('H1-R1-A-1')).toBeNull();
    // Logout (no session) fails closed: no new fetch, unauthorized shown, no map.
    rerender(<D sessionKey={null} />);
    expect(((fetcher.mock.calls as any)[1][1] as AbortSignal).aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((await screen.findByRole('alert')).getAttribute('data-error-kind')).toBe('unauthorized');
    resolvers[1](articleFixture());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText('H1-R1-A-1')).toBeNull();
  });

  it('article fallback resets on close: reopening same instance requests the instance again', async () => {
    const fetcher = vi.fn(async (q: any) => q.instanceId
      ? { ...articleFixture({ instanceId: INSTANCE }), status: 'UNPLACED', placements: [], maps: [] }
      : articleFixture());
    render(<Harness fetcher={fetcher} instanceId={INSTANCE} />);
    fireEvent.click(screen.getByText('öppna karta'));
    fireEvent.click(await screen.findByRole('button', { name: 'Visa artikelns platser' }));
    await screen.findByText('H1-R1-A-1');
    fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('H1-R1-A-1')).toBeNull());
    fireEvent.click(screen.getByText('öppna karta'));
    expect(await screen.findByText(/ingen registrerad plats/)).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
    const last = (fetcher.mock.calls as any).at(-1)[0];
    expect(last).toMatchObject({ instanceId: INSTANCE });
    expect(screen.getByTestId('scan-count').textContent).toBe('3');
  });

  it('new instance clears fallback', async () => {
    const I2 = '66666666-6666-4666-8666-666666666666';
    const fetcher = vi.fn(async (q: any) => q.instanceId
      ? { ...articleFixture({ instanceId: q.instanceId }), status: 'UNPLACED', placements: [], maps: [] }
      : articleFixture());
    const D = (p: any) => <ArticleLocationDialog open onOpenChange={() => {}} fetcher={fetcher} organizationId={ORG} sessionKey="s1" {...p} />;
    const { rerender } = render(<D target={{ name: 'A', itemTypeId: ITEM, instanceId: INSTANCE }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Visa artikelns platser' }));
    await screen.findByText('H1-R1-A-1');
    rerender(<D target={{ name: 'A', itemTypeId: ITEM, instanceId: I2 }} />);
    expect(screen.queryByText('H1-R1-A-1')).toBeNull();
    await screen.findByText(/ingen registrerad plats/);
    expect((fetcher.mock.calls as any).at(-1)[0]).toMatchObject({ instanceId: I2 });
  });
});
