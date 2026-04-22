import { useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { toast } from 'sonner';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { ChatMessage } from './MessageBubble';
import { useChatPagination } from './useChatPagination';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  partnerId: string;
  partnerName: string;
  initialMessages: ChatMessage[];
  onBack: () => void;
  onMessagesChanged?: (messages: ChatMessage[]) => void;
}

interface PendingMessage extends ChatMessage {
  _status?: 'sending' | 'failed';
  _payload?: { content: string; file_url?: string; file_name?: string; file_type?: string };
}

/** iMessage-style 1:1 DM view with cursor pagination + realtime + retry. */
export const DmChatView = ({ partnerId, partnerName, initialMessages, onBack, onMessagesChanged }: Props) => {
  const { staff } = useMobileAuth();
  const { t } = useLanguage();
  const myIdsRef = useRef<Set<string>>(new Set([staff?.id || '']));

  const fetcher = useCallback(
    (opts: { before?: string; limit: number }) =>
      mobileApi.getDMThread(partnerId, opts) as Promise<{ messages: ChatMessage[]; has_more: boolean; next_cursor: string | null }>,
    [partnerId],
  );

  const {
    messages,
    loading,
    loadingOlder,
    error,
    hasMore,
    loadOlder,
    reload,
    setMessages,
  } = useChatPagination({ key: partnerId, seed: initialMessages, fetcher });

  // Notify parent when local messages change (used by inbox cache)
  useEffect(() => {
    onMessagesChanged?.(messages);
  }, [messages, onMessagesChanged]);

  // Mark partner messages as read on open and whenever a NEW partner message arrives.
  // We trigger only on changes to the count of messages from the partner — sending
  // our own messages should never round-trip a mark_read.
  const partnerMsgCount = messages.filter((m) => m.sender_id === partnerId).length;
  useEffect(() => {
    if (partnerMsgCount === 0) return;
    mobileApi.markDMRead(partnerId).catch(() => { /* ignore */ });
  }, [partnerId, partnerMsgCount]);

  // Realtime: append/update only — never trigger a full refetch.
  useEffect(() => {
    if (!staff) return;
    const myId = staff.id;
    const channel = supabase
      .channel(`dm-${myId}-${partnerId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const m = payload.new as ChatMessage;
          const fromPartner = m.sender_id === partnerId && (m as any).recipient_id === myId;
          const fromMe = m.sender_id === myId && (m as any).recipient_id === partnerId;
          if (!fromPartner && !fromMe) return;
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => {
            const idx = prev.findIndex((x) => x.id === m.id);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], ...m };
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [partnerId, staff?.id, setMessages]);

  const performSend = useCallback(async (
    optimisticId: string,
    payload: { content: string; file_url?: string; file_name?: string; file_type?: string },
  ) => {
    try {
      const res = await mobileApi.sendDirectMessage({ recipient_id: partnerId, ...payload });
      const real = (res as any)?.message as ChatMessage | undefined;
      setMessages((prev) => {
        if (real && prev.some((m) => m.id === real.id)) {
          return prev.filter((m) => m.id !== optimisticId);
        }
        if (!real) return prev.filter((m) => m.id !== optimisticId);
        return prev.map((m) => (m.id === optimisticId ? { ...real } : m));
      });
    } catch (err: any) {
      console.error('[DM] send failed', err);
      toast.error(t('msg.couldNotSend'));
      setMessages((prev) =>
        prev.map((m) => m.id === optimisticId ? { ...(m as PendingMessage), _status: 'failed', _payload: payload } : m)
      );
    }
  }, [partnerId, setMessages]);

  const handleSend = async (data: { content: string; file_url?: string; file_name?: string; file_type?: string }) => {
    const text = data.content?.trim() || '';
    if (!text && !data.file_url) return;
    const payload = {
      content: text || (data.file_name ? `📎 ${data.file_name}` : '📎'),
      file_url: data.file_url,
      file_name: data.file_name,
      file_type: data.file_type,
    };
    const optimistic: PendingMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender_id: staff?.id || '',
      sender_name: staff?.name || '',
      content: payload.content,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      file_url: payload.file_url || null,
      file_name: payload.file_name || null,
      file_type: payload.file_type || null,
      _status: 'sending',
      _payload: payload,
    };
    setMessages((prev) => [...prev, optimistic]);
    await performSend(optimistic.id, payload);
  };

  const handleRetry = (msg: PendingMessage) => {
    if (!msg._payload) return;
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...(m as PendingMessage), _status: 'sending' } : m)));
    performSend(msg.id, msg._payload);
  };

  const showInitialLoading = loading && messages.length === 0;

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <div
        className="bg-card/95 backdrop-blur border-b border-border/60 sticky top-0 z-10"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center px-2 py-2 gap-2">
          <button
            onClick={onBack}
            className="p-2 rounded-full text-primary active:scale-95 transition-transform"
            aria-label={t('msg.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex flex-col items-center -ml-9 pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {partnerName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-medium text-foreground mt-0.5 truncate max-w-[60%]">
              {partnerName}
            </span>
          </div>
          <button
            className="p-2 rounded-full text-primary active:scale-95 transition-transform opacity-30"
            aria-label={t('msg.call')}
            disabled
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showInitialLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error && messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={reload}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm active:scale-95 transition-transform"
          >
            {t('msg.tryAgain')}
          </button>
        </div>
      ) : (
        <MessageList
          messages={messages}
          myIds={myIdsRef.current}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          renderFooter={(m) => {
            const pm = m as PendingMessage;
            if (pm._status === 'failed') {
              return (
                <button
                  onClick={() => handleRetry(pm)}
                  className="flex items-center gap-1 mt-1 mr-1.5 text-[10px] text-destructive hover:underline"
                  aria-label={t('msg.sendAgain')}
                >
                  <AlertCircle className="w-3 h-3" />
                  {t('msg.notSent')}
                </button>
              );
            }
            if (pm._status === 'sending') {
              return <span className="mt-1 mr-1.5 text-[10px] text-muted-foreground/70">{t('msg.sending')}</span>;
            }
            return null;
          }}
        />
      )}

      <ChatInput onSend={handleSend} />
    </div>
  );
};

export default DmChatView;
