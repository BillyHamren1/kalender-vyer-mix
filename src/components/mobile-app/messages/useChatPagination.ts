import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from './MessageBubble';

const PAGE_SIZE = 30;

type Fetcher = (opts: { before?: string; limit: number }) => Promise<{
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}>;

interface Options {
  /** Stable key (booking_id, partner_id…) — changing it resets state. */
  key: string;
  /** Pre-fetched messages to seed the view (avoids a round-trip when inbox already has them). */
  seed?: ChatMessage[];
  fetcher: Fetcher;
}

interface State {
  messages: ChatMessage[];
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  hasMore: boolean;
}

/**
 * Stateful cursor pagination for a single chat thread.
 *
 *   - Initial fetch on mount (or when `key` changes) loads the latest `PAGE_SIZE`.
 *   - `loadOlder()` fetches the next page using `created_at < oldest`.
 *   - The hook never re-fetches realtime inserts — those are appended via
 *     the returned `setMessages` mutator from the realtime subscription.
 *
 * Scroll-position preservation when prepending older rows is handled in
 * MessageList using a one-shot scrollHeight delta.
 */
export const useChatPagination = ({ key, seed, fetcher }: Options) => {
  const [state, setState] = useState<State>({
    messages: seed ?? [],
    loading: !seed || seed.length === 0,
    loadingOlder: false,
    error: null,
    hasMore: true,
  });
  // Coalesce concurrent loadOlder() calls (scroll spam).
  const inflight = useRef(false);
  // Used to ignore stale responses if `key` changes mid-flight.
  const generation = useRef(0);

  // Reset whenever key changes
  useEffect(() => {
    generation.current += 1;
    const myGen = generation.current;
    let cancelled = false;

    setState({
      messages: seed ?? [],
      loading: !seed || seed.length === 0,
      loadingOlder: false,
      error: null,
      hasMore: true,
    });

    // If we have a seed, still confirm in background that we have the latest.
    (async () => {
      try {
        const res = await fetcher({ limit: PAGE_SIZE });
        if (cancelled || generation.current !== myGen) return;
        setState((s) => ({
          ...s,
          // Merge seed with fresh fetch, deduped, ASC.
          messages: mergeAsc(s.messages, res.messages),
          loading: false,
          hasMore: res.has_more,
          error: null,
        }));
      } catch (e: any) {
        if (cancelled || generation.current !== myGen) return;
        setState((s) => ({ ...s, loading: false, error: e?.message || 'Kunde inte ladda meddelanden' }));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Mirror messages into a ref so loadOlder stays referentially stable.
  // Without this, loadOlder would be re-created on every message append, which
  // would invalidate any effect downstream that depends on it.
  const messagesRef = useRef<ChatMessage[]>(state.messages);
  useEffect(() => { messagesRef.current = state.messages; }, [state.messages]);

  const loadOlder = useCallback(async () => {
    if (inflight.current) return;
    const current = messagesRef.current;
    if (current.length === 0) return;
    const oldest = current[0]?.created_at;
    if (!oldest) return;

    setState((s) => {
      if (!s.hasMore || s.loading || s.loadingOlder) return s;
      return { ...s, loadingOlder: true };
    });
    inflight.current = true;
    const myGen = generation.current;
    try {
      const res = await fetcher({ before: oldest, limit: PAGE_SIZE });
      if (generation.current !== myGen) return;
      setState((s) => ({
        ...s,
        messages: mergeAsc(res.messages, s.messages),
        loadingOlder: false,
        hasMore: res.has_more,
        error: null,
      }));
    } catch (e: any) {
      if (generation.current !== myGen) return;
      setState((s) => ({ ...s, loadingOlder: false, error: e?.message || 'Kunde inte ladda äldre meddelanden' }));
    } finally {
      inflight.current = false;
    }
  }, [fetcher]);

  /** Imperative setter so realtime/optimistic flows can mutate locally. */
  const setMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setState((s) => ({ ...s, messages: updater(s.messages) }));
    },
    [],
  );

  const reload = useCallback(async () => {
    generation.current += 1;
    const myGen = generation.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetcher({ limit: PAGE_SIZE });
      if (generation.current !== myGen) return;
      setState({ messages: res.messages, loading: false, loadingOlder: false, error: null, hasMore: res.has_more });
    } catch (e: any) {
      if (generation.current !== myGen) return;
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Kunde inte ladda meddelanden' }));
    }
  }, [fetcher]);

  return {
    ...state,
    loadOlder,
    reload,
    setMessages,
  };
};

/** Merge two ASC-sorted lists (or unsorted), dedupe by id, return ASC. */
function mergeAsc(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (const list of [a, b]) {
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  out.sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
  return out;
}
