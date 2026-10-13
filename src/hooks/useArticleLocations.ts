import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleLocationsResponse } from '../../supabase/functions/_shared/warehouseArticleLocations';
import { ArticleLocationsError, type ArticleLocationsFetcher } from '@/services/articleLocationsService';

export type ArticleLocationsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; data: ArticleLocationsResponse }
  | { phase: 'error'; error: ArticleLocationsError };

export function articleLocationsRequestKey(p: {
  itemTypeId: string | null; instanceId: string | null; organizationId: string | null; sessionKey: string | null;
}): string {
  return JSON.stringify([p.instanceId ? 'instance' : 'article', p.itemTypeId, p.instanceId, p.organizationId, p.sessionKey]);
}

const UNAUTH = new ArticleLocationsError('unauthorized', 'Inloggningen saknas eller har bytts. Logga in igen.');

/**
 * Lazy, cancellable fetch, keyed per request scope (mode, article, instance,
 * org, session). Results are stored together with their request key and only
 * exposed while that key equals the CURRENT key computed in render — so a new
 * target/org/session can never render a previous map, not even for one frame.
 * Missing org/session scope fails closed (no fetch).
 */
export function useArticleLocations(opts: {
  enabled: boolean;
  itemTypeId: string | null;
  instanceId: string | null;
  organizationId: string | null;
  sessionKey: string | null;
  scopeLoading?: boolean;
  fetcher: ArticleLocationsFetcher;
}) {
  const { enabled, itemTypeId, instanceId, organizationId, sessionKey, scopeLoading = false, fetcher } = opts;

  const scopeKey = JSON.stringify([itemTypeId, instanceId, organizationId, sessionKey]);
  const [fallbackFor, setFallbackFor] = useState<string | null>(null);
  const articleFallback = enabled && !!instanceId && fallbackFor === scopeKey;
  const effectiveInstance = articleFallback ? null : instanceId;
  const requestKey = articleLocationsRequestKey({ itemTypeId, instanceId: effectiveInstance, organizationId, sessionKey });

  const [stored, setStored] = useState<{ key: string; state: ArticleLocationsState } | null>(null);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  // Close or scope change → drop fallback so reopening starts at the instance again.
  useEffect(() => { if (!enabled) setFallbackFor(null); }, [enabled]);

  const hasScope = !!organizationId && !!sessionKey;

  useEffect(() => {
    const id = ++seq.current;
    setStored(null);
    if (!enabled || !itemTypeId || !hasScope) return;
    const ctrl = new AbortController();
    const key = requestKey;
    setStored({ key, state: { phase: 'loading' } });
    fetcher({ itemTypeId, instanceId: effectiveInstance, organizationId }, ctrl.signal)
      .then((data) => { if (id === seq.current && !ctrl.signal.aborted) setStored({ key, state: { phase: 'ready', data } }); })
      .catch((e) => {
        if (id !== seq.current || ctrl.signal.aborted || e?.name === 'AbortError') return;
        setStored({ key, state: { phase: 'error', error: e instanceof ArticleLocationsError ? e : new ArticleLocationsError('unavailable', 'Okänt fel') } });
      });
    return () => ctrl.abort();
    // requestKey encodes itemTypeId/effectiveInstance/org/session
  }, [enabled, requestKey, hasScope, fetcher, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  let state: ArticleLocationsState;
  if (!enabled || !itemTypeId) state = { phase: 'idle' };
  else if (!hasScope) state = scopeLoading ? { phase: 'loading' } : { phase: 'error', error: UNAUTH };
  else if (stored && stored.key === requestKey) state = stored.state;
  else state = { phase: 'loading' };

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const showArticleLocations = useCallback(() => setFallbackFor(scopeKey), [scopeKey]);
  const showInstance = useCallback(() => setFallbackFor(null), []);
  return { state, requestKey, refresh, isArticleFallback: articleFallback, showArticleLocations, showInstance };
}
