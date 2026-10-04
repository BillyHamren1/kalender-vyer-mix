// Actual React hook rendering; the token provider is an explicit test double.
// The separate mounted native/browser gate must prove the real route performs no closed-dialog POST.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const provider = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: provider.invoke } },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
type ProviderResult = { data: { token?: string } | null; error: Error | null };
const success = (token = 'isolated-public-map-token'): ProviderResult => ({
  data: { token },
  error: null,
});

beforeEach(() => {
  vi.resetModules();
  provider.invoke.mockReset();
});
afterEach(cleanup);

describe('public Mapbox token is requested only for an enabled map', () => {
  it('closed mount and retry send zero requests; open loads once and reopening uses the cache', async () => {
    const pending = deferred<ProviderResult>();
    provider.invoke.mockReturnValue(pending.promise);
    const { useMapboxToken } = await import('./useMapboxToken');
    const hook = renderHook(({ enabled }) => useMapboxToken(enabled), {
      initialProps: { enabled: false },
    });
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.token).toBeNull();
    expect(hook.result.current.error).toBeNull();
    act(() => hook.result.current.retry());
    expect(provider.invoke).not.toHaveBeenCalled();
    hook.rerender({ enabled: true });
    expect(provider.invoke).toHaveBeenCalledTimes(1);
    expect(provider.invoke).toHaveBeenCalledWith('mapbox-token');
    expect(hook.result.current.loading).toBe(true);
    await act(async () => {
      pending.resolve(success());
      await pending.promise;
    });
    await waitFor(() =>
      expect(hook.result.current.token).toBe('isolated-public-map-token'),
    );
    hook.rerender({ enabled: false });
    hook.rerender({ enabled: true });
    expect(hook.result.current.loading).toBe(false);
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves enabled-by-default behavior for existing map callers and shares the saved token', async () => {
    provider.invoke.mockResolvedValue(success());
    const { useMapboxToken } = await import('./useMapboxToken');
    const first = renderHook(() => useMapboxToken());
    await waitFor(() =>
      expect(first.result.current.token).toBe('isolated-public-map-token'),
    );
    const second = renderHook(() => useMapboxToken());
    expect(second.result.current.token).toBe('isolated-public-map-token');
    expect(second.result.current.loading).toBe(false);
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('deduplicates two enabled consumers while the provider is still pending', async () => {
    const pending = deferred<ProviderResult>();
    provider.invoke.mockReturnValue(pending.promise);
    const { useMapboxToken } = await import('./useMapboxToken');
    const first = renderHook(() => useMapboxToken(true));
    const second = renderHook(() => useMapboxToken(true));
    expect(provider.invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve(success());
      await pending.promise;
    });
    expect(first.result.current.token).toBe('isolated-public-map-token');
    expect(second.result.current.token).toBe('isolated-public-map-token');
  });

  it('exposes an actual provider error and only retries on the explicit retry action', async () => {
    provider.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error('isolated provider unavailable'),
    });
    const { useMapboxToken } = await import('./useMapboxToken');
    const hook = renderHook(() => useMapboxToken(true));
    await waitFor(() =>
      expect(hook.result.current.error).toBe('isolated provider unavailable'),
    );
    expect(hook.result.current.token).toBeNull();
    expect(hook.result.current.loading).toBe(false);
    expect(provider.invoke).toHaveBeenCalledTimes(1);
    provider.invoke.mockResolvedValueOnce(success('isolated-retry-token'));
    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.token).toBe('isolated-retry-token'),
    );
    expect(hook.result.current.error).toBeNull();
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });

  it('closing during a pending request prevents a late successful React update; reopening reuses its public cache', async () => {
    const pending = deferred<ProviderResult>();
    provider.invoke.mockReturnValue(pending.promise);
    const { useMapboxToken } = await import('./useMapboxToken');
    const hook = renderHook(({ enabled }) => useMapboxToken(enabled), {
      initialProps: { enabled: true },
    });
    hook.rerender({ enabled: false });
    expect(hook.result.current.loading).toBe(false);
    await act(async () => {
      pending.resolve(success());
      await pending.promise;
    });
    expect(hook.result.current.token).toBeNull();
    expect(hook.result.current.error).toBeNull();
    hook.rerender({ enabled: true });
    expect(hook.result.current.token).toBe('isolated-public-map-token');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('closing also prevents a late error; reopening can make a fresh provider attempt', async () => {
    const pending = deferred<ProviderResult>();
    provider.invoke.mockReturnValueOnce(pending.promise);
    const { useMapboxToken } = await import('./useMapboxToken');
    const hook = renderHook(({ enabled }) => useMapboxToken(enabled), {
      initialProps: { enabled: true },
    });
    hook.rerender({ enabled: false });
    await act(async () => {
      pending.resolve({ data: null, error: new Error('isolated late error') });
      await pending.promise;
    });
    expect(hook.result.current.error).toBeNull();
    expect(hook.result.current.loading).toBe(false);
    provider.invoke.mockResolvedValueOnce(success());
    hook.rerender({ enabled: true });
    await waitFor(() =>
      expect(hook.result.current.token).toBe('isolated-public-map-token'),
    );
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });

  it('unmounting a pending consumer keeps a valid public token reusable without another provider request', async () => {
    const pending = deferred<ProviderResult>();
    provider.invoke.mockReturnValue(pending.promise);
    const { useMapboxToken } = await import('./useMapboxToken');
    const first = renderHook(() => useMapboxToken(true));
    first.unmount();
    await act(async () => {
      pending.resolve(success());
      await pending.promise;
    });
    const next = renderHook(() => useMapboxToken(true));
    expect(next.result.current.token).toBe('isolated-public-map-token');
    expect(provider.invoke).toHaveBeenCalledTimes(1);
  });

  it('a missing token is an error rather than a successful empty cache', async () => {
    provider.invoke.mockResolvedValueOnce({ data: {}, error: null });
    const { useMapboxToken } = await import('./useMapboxToken');
    const hook = renderHook(() => useMapboxToken(true));
    await waitFor(() =>
      expect(hook.result.current.error).toBe('Mapbox-token saknas i svaret'),
    );
    expect(hook.result.current.token).toBeNull();
    provider.invoke.mockResolvedValueOnce(success());
    act(() => hook.result.current.retry());
    await waitFor(() =>
      expect(hook.result.current.token).toBe('isolated-public-map-token'),
    );
    expect(provider.invoke).toHaveBeenCalledTimes(2);
  });
});
