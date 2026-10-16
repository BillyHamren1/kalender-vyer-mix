import { isAllowedHubOrigin } from '@/lib/sso/hubOrigins';

export const BRAIN_STANDALONE_URL = 'https://e-flow.se/brain';
export const BRAIN_ACK_TIMEOUT_MS = 3000;

export interface OperationsBrainContext {
  view?: string;
  entityId?: string;
}

export interface OperationsBrainDeps {
  win?: Window;
  timeoutMs?: number;
  createRequestId?: () => string;
}

/** Resolve the embedding parent's origin (ancestorOrigins first, then referrer). */
export function resolveParentOrigin(win: Window): string | null {
  const ancestors = (win.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0) return ancestors[0];
  try {
    const ref = win.document?.referrer;
    return ref ? new URL(ref).origin : null;
  } catch {
    return null;
  }
}

function defaultRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `brain-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Open Brain. Standalone → new tab. Embedded in an allowed Hub → postMessage
 * and resolve true only on a matching ACK from that exact parent/origin.
 */
export function openOperationsBrain(
  context?: OperationsBrainContext,
  deps: OperationsBrainDeps = {},
): Promise<boolean> {
  const win = deps.win ?? window;

  if (win.parent === win) {
    const opened = win.open(BRAIN_STANDALONE_URL, '_blank', 'noopener,noreferrer');
    return Promise.resolve(opened !== null || true);
  }

  const origin = resolveParentOrigin(win);
  if (!isAllowedHubOrigin(origin)) return Promise.resolve(false);

  const requestId = (deps.createRequestId ?? defaultRequestId)();
  const parent = win.parent;
  const timeoutMs = deps.timeoutMs ?? BRAIN_ACK_TIMEOUT_MS;

  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      win.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== parent || event.origin !== origin) return;
      const data = event.data as { type?: string; requestId?: string; ok?: boolean } | null;
      if (!data || data.type !== 'EVENTFLOW_OPEN_BRAIN_ACK' || data.requestId !== requestId) return;
      finish(data.ok !== false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    win.addEventListener('message', onMessage);
    try {
      parent.postMessage(
        { type: 'EVENTFLOW_OPEN_BRAIN', requestId, ...(context ? { context } : {}) },
        origin,
      );
    } catch {
      finish(false);
    }
  });
}

/** Hidden by default; visible with ?test_brain=1 or localStorage show_brain_button=true. */
export function shouldShowBrainButton(win: Window = window): boolean {
  try {
    if (new URLSearchParams(win.location.search).get('test_brain') === '1') return true;
    return win.localStorage?.getItem('show_brain_button') === 'true';
  } catch {
    return false;
  }
}
