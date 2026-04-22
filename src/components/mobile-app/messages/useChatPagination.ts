import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from './MessageBubble';
import { t as translate, type Locale } from '@/i18n/translations';

const PAGE_SIZE = 30;

const getLocale = (): Locale => {
  try {
    const stored = localStorage.getItem('eventflow-locale');
    return stored === 'en' ? 'en' : 'sv';
  } catch {
    return 'sv';
  }
};
const tr = (key: any) => translate(key, getLocale());

type Fetcher = (opts: { before?: string; limit: number }) => Promise<{
  messages: ChatMessage[];
  has_more: boolean;
  next_cursor: string | null;
}>;

interface Options {
  key: string;
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

export const useChatPagination = ({ key, seed, fetcher }: Options) => {
  const [state, setState] = useState<State>({
    messages: seed ?? [],
    loading: !seed || seed.length === 0,
    loadingOlder: false,
    error: null,
    hasMore: true,
  });
  const inflight = useRef(false);
  const generation = useRef(0);

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

    (async () => {
      try {
        const res = await fetcher({ limit: PAGE_SIZE });
        if (cancelled || generation.current !== myGen) return;
        setState((s) => ({
          ...s,
          messages: mergeAsc(s.messages, res.messages),
          loading: false,
          hasMore: res.has_more,
          error: null,
        }));
      } catch (e: any) {
        if (cancelled || generation.current !== myGen) return;
        setState((s) => ({ ...s, loading: false, error: e?.message || tr('chat.couldNotLoadMessages') }));
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
      setState((s) => ({ ...s, loadingOlder: false, error: e?.message || tr('chat.couldNotLoadOlder') }));
    } finally {
      inflight.current = false;
    }
  }, [fetcher]);

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
      setState((s) => ({ ...s, loading: false, error: e?.message || tr('chat.couldNotLoadMessages') }));
    }
  }, [fetcher]);

  return {
    ...state,
    loadOlder,
    reload,
    setMessages,
  };
};

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
