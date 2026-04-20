/**
 * useArrivalPrompt — parity contract for the UNIFIED arrival hook.
 *
 * Locks in that the hook normalizes server responses for ALL three target
 * kinds into the same `target` shape, that legacy location-only responses
 * are still understood, and that markResolved sends the new generic
 * (target_type, target_id, arrived_at) payload regardless of kind.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getArrivalState = vi.fn();
const markArrivalResolved = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/services/mobileApiService', () => ({
  mobileApi: {
    get getArrivalState() { return getArrivalState; },
    get markArrivalResolved() { return markArrivalResolved; },
  },
}));

import { useArrivalPrompt } from '@/hooks/useArrivalPrompt';

beforeEach(() => {
  getArrivalState.mockReset();
  markArrivalResolved.mockReset();
  markArrivalResolved.mockResolvedValue({ success: true });
});

describe('useArrivalPrompt — generic target shape parity', () => {
  it.each([
    ['location', { kind: 'location', target_id: 'loc-1', label: 'Lager', arrived_at: '2026-04-20T06:00:00.000Z' }],
    ['project',  { kind: 'project',  target_id: 'prj-1', label: 'Projekt X', arrived_at: '2026-04-20T06:00:00.000Z' }],
    ['booking',  { kind: 'booking',  target_id: 'bkg-1', label: 'Kund AB',  arrived_at: '2026-04-20T06:00:00.000Z' }],
  ])('exposes target.kind=%s exactly as the server returned it', async (_, target) => {
    getArrivalState.mockResolvedValue({
      should_prompt: true,
      target,
      prompts_sent: 1,
      arrived_at: target.kind === 'location' ? target.arrived_at : null,
      location_id: target.kind === 'location' ? target.target_id : null,
      location_name: target.kind === 'location' ? target.label : null,
    });

    const { result } = renderHook(() => useArrivalPrompt(true));
    await waitFor(() => expect(result.current.state?.target?.kind).toBe(target.kind));
    expect(result.current.state?.target?.target_id).toBe(target.target_id);
    expect(result.current.state?.target?.label).toBe(target.label);
    expect(result.current.state?.should_prompt).toBe(true);
  });

  it('falls back to legacy location_id/name when server omits target', async () => {
    getArrivalState.mockResolvedValue({
      should_prompt: true,
      target: null,
      prompts_sent: 0,
      arrived_at: '2026-04-20T06:00:00.000Z',
      location_id: 'loc-legacy',
      location_name: 'Gammalt Lager',
    });

    const { result } = renderHook(() => useArrivalPrompt(true));
    await waitFor(() => expect(result.current.state?.target?.kind).toBe('location'));
    expect(result.current.state?.target?.target_id).toBe('loc-legacy');
    expect(result.current.state?.target?.label).toBe('Gammalt Lager');
  });

  it.each(['location', 'project', 'booking'] as const)(
    'markResolved sends generic (target_type=%s, target_id, arrived_at)',
    async (kind) => {
      getArrivalState.mockResolvedValue({ should_prompt: false, target: null, prompts_sent: 0, arrived_at: null, location_id: null, location_name: null });
      const { result } = renderHook(() => useArrivalPrompt(true));
      await waitFor(() => expect(getArrivalState).toHaveBeenCalled());

      await act(async () => {
        await result.current.markResolved({
          kind,
          target_id: 't-1',
          label: 'X',
          arrived_at: '2026-04-20T06:00:00.000Z',
        });
      });

      expect(markArrivalResolved).toHaveBeenCalledWith({
        target_type: kind,
        target_id: 't-1',
        arrived_at: '2026-04-20T06:00:00.000Z',
      });
    }
  );
});
