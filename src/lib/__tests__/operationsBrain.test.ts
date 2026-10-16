import { describe, it, expect, vi } from 'vitest';
import { openOperationsBrain, shouldShowBrainButton, BRAIN_STANDALONE_URL } from '../operationsBrain';

type Listener = (e: MessageEvent) => void;

function makeEmbedded(origin: string | null) {
  const listeners = new Set<Listener>();
  const posted: Array<{ msg: any; target: string }> = [];
  const parent: any = { postMessage: vi.fn((msg, target) => posted.push({ msg, target })) };
  const win: any = {
    parent,
    open: vi.fn(),
    location: { ancestorOrigins: origin ? { length: 1, 0: origin } : { length: 0 }, search: '' },
    document: { referrer: '' },
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  };
  const emit = (data: any, src = parent, o = origin) =>
    listeners.forEach((l) => l({ data, source: src, origin: o } as MessageEvent));
  return { win, parent, posted, emit, listeners };
}


describe('openOperationsBrain', () => {
  it('opens standalone URL when not embedded', async () => {
    const win: any = { open: vi.fn(() => ({})) };
    win.parent = win;
    await expect(openOperationsBrain(undefined, { win })).resolves.toBe(true);
    expect(win.open).toHaveBeenCalledWith(BRAIN_STANDALONE_URL, '_blank', 'noopener,noreferrer');
  });

  it('refuses disallowed parent origin without posting', async () => {
    const { win, parent } = makeEmbedded('https://evil.example');
    await expect(openOperationsBrain(undefined, { win })).resolves.toBe(false);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('refuses when parent origin unknown', async () => {
    const { win, parent } = makeEmbedded(null);
    await expect(openOperationsBrain(undefined, { win })).resolves.toBe(false);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('posts to allowed hub with context and resolves on matching ACK', async () => {
    const { win, posted, emit, listeners } = makeEmbedded('https://e-flow.se');
    const p = openOperationsBrain({ view: '/warehouse', entityId: 'x1' }, { win, createRequestId: () => 'r1' });
    expect(posted[0]).toEqual({
      msg: { type: 'EVENTFLOW_OPEN_BRAIN', requestId: 'r1', context: { view: '/warehouse', entityId: 'x1' } },
      target: 'https://e-flow.se',
    });
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'r1' });
    await expect(p).resolves.toBe(true);
    expect(listeners.size).toBe(0);
  });

  it('omits context key when none given', async () => {
    const { win, posted, emit } = makeEmbedded('https://e-flow.se');
    const p = openOperationsBrain(undefined, { win, createRequestId: () => 'r2' });
    expect(posted[0].msg).toEqual({ type: 'EVENTFLOW_OPEN_BRAIN', requestId: 'r2' });
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'r2' });
    await expect(p).resolves.toBe(true);
  });

  it('ignores ACKs with wrong requestId, origin or source, then times out', async () => {
    const { win, emit } = makeEmbedded('https://e-flow.se');
    const p = openOperationsBrain(undefined, { win, createRequestId: () => 'r3', timeoutMs: 20 });
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'other' });
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'r3' }, undefined, 'https://evil.example');
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'r3' }, {} as any);
    await expect(p).resolves.toBe(false);
  });

  it('resolves false on ACK with ok:false', async () => {
    const { win, emit } = makeEmbedded('https://e-flow.se');
    const p = openOperationsBrain(undefined, { win, createRequestId: () => 'r4' });
    emit({ type: 'EVENTFLOW_OPEN_BRAIN_ACK', requestId: 'r4', ok: false });
    await expect(p).resolves.toBe(false);
  });
});

describe('shouldShowBrainButton', () => {
  const mk = (search: string, stored: string | null) =>
    ({ location: { search }, localStorage: { getItem: () => stored } }) as any;
  it('hidden by default', () => expect(shouldShowBrainButton(mk('', null))).toBe(false));
  it('shown with ?test_brain=1', () => expect(shouldShowBrainButton(mk('?test_brain=1', null))).toBe(true));
  it('shown with localStorage flag', () => expect(shouldShowBrainButton(mk('', 'true'))).toBe(true));
});
