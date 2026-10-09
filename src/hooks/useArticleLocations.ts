import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleLocationsResponse } from '../../supabase/functions/_shared/warehouseArticleLocations';
import { ArticleLocationsError, type ArticleLocationsFetcher } from '@/services/articleLocationsService';

export type ArticleLocationsState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; data: ArticleLocationsResponse }
  | { phase: 'error'; error: ArticleLocationsError };

/**
 * Lazy, cancellable fetch. Runs only while `enabled` (dialog open).
 * Any change of article/instance/org/session/mode aborts the in-flight request
 * and clears previous data so a prior product can never leak into the view.
 */
export function useArticleLocations(opts: {
  enabled: boolean;
  itemTypeId: string | null;
  instanceId: string | null;
  organizationId?: string | null;
  sessionKey?: string | null;
  fetcher: ArticleLocationsFetcher;
}) {
  const { enabled, itemTypeId, instanceId, organizationId, sessionKey, fetcher } = opts;
  const [articleFallback, setArticleFallback] = useState(false);
  const [state, setState] = useState<ArticleLocationsState>({ phase: 'idle' });
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  useEffect(() => { setArticleFallback(false); }, [itemTypeId, instanceId, organizationId, sessionKey]);

  const effectiveInstance = articleFallback ? null : instanceId;

  useEffect(() => {
    const id = ++seq.current;
    if (!enabled || !itemTypeId) { setState({ phase: 'idle' }); return; }
    const ctrl = new AbortController();
    setState({ phase: 'loading' });
    fetcher({ itemTypeId, instanceId: effectiveInstance, organizationId }, ctrl.signal)
      .then((data) => { if (id === seq.current && !ctrl.signal.aborted) setState({ phase: 'ready', data }); })
      .catch((e) => {
        if (id !== seq.current || ctrl.signal.aborted || e?.name === 'AbortError') return;
        setState({ phase: 'error', error: e instanceof ArticleLocationsError ? e : new ArticleLocationsError('unavailable', 'Okänt fel') });
      });
    return () => ctrl.abort();
  }, [enabled, itemTypeId, effectiveInstance, organizationId, sessionKey, fetcher, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return {
    state, refresh,
    isArticleFallback: articleFallback && !!instanceId,
    showArticleLocations: useCallback(() => setArticleFallback(true), []),
    showInstance: useCallback(() => setArticleFallback(false), []),
  };
}
