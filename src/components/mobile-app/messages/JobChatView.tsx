import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Briefcase, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { toast } from 'sonner';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { ChatMessage } from './MessageBubble';

interface Props {
  bookingId: string;
  client: string;
  onBack: () => void;
}

interface PendingMessage extends ChatMessage {
  /** Local-only marker for optimistic + retry tracking */
  _status?: 'sending' | 'failed';
  _payload?: { content: string; file_url?: string; file_name?: string; file_type?: string };
}

export const JobChatView = ({ bookingId, client, onBack }: Props) => {
  const { staff } = useMobileAuth();
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const myIdsRef = useRef<Set<string>>(new Set([staff?.id || '']));

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await mobileApi.getJobMessages(bookingId);
      setMessages((res.messages as ChatMessage[]) || []);
    } catch (e: any) {
      console.error('[JobChat] load failed', e);
      setLoadError(e?.message || 'Kunde inte ladda meddelanden');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadMessages();
      if (cancelled) return;
      // Mark as read on open
      mobileApi.markJobRead(bookingId).catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [bookingId, loadMessages]);

  // Realtime: INSERT (new messages) + UPDATE (read receipts / archive)
  useEffect(() => {
    const channel = supabase
      .channel(`job-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
          // Auto-mark read since the user is currently viewing this conversation
          if (m.sender_id !== staff?.id) {
            mobileApi.markJobRead(bookingId).catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'job_messages', filter: `booking_id=eq.${bookingId}` },
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
  }, [bookingId, staff?.id]);

  /** Performs the actual send; on success replaces the optimistic row, on failure marks it failed for retry. */
  const performSend = useCallback(async (
    optimisticId: string,
    payload: { content: string; file_url?: string; file_name?: string; file_type?: string },
  ) => {
    try {
      const res = await mobileApi.sendJobMessage({
        booking_id: bookingId,
        content: payload.content,
        file_url: payload.file_url,
        file_name: payload.file_name,
        file_type: payload.file_type,
      });
      const real = res?.message as ChatMessage | undefined;
      setMessages((prev) => {
        // If realtime already inserted the real row, just drop the optimistic one.
        if (real && prev.some((m) => m.id === real.id)) {
          return prev.filter((m) => m.id !== optimisticId);
        }
        if (!real) return prev.filter((m) => m.id !== optimisticId);
        return prev.map((m) => (m.id === optimisticId ? { ...real } : m));
      });
    } catch (err: any) {
      console.error('[JobChat] send failed', err);
      toast.error('Kunde inte skicka – tryck för att försöka igen');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, _status: 'failed', _payload: payload } : m
        )
      );
    }
  }, [bookingId]);

  const handleSend = async (data: { content: string; file_url?: string; file_name?: string; file_type?: string }) => {
    const text = data.content?.trim() || '';
    if (!text && !data.file_url) return;
    const payload = {
      content: text || (data.file_name ? `📎 ${data.file_name}` : '📎 Bifogad fil'),
      file_url: data.file_url,
      file_name: data.file_name,
      file_type: data.file_type,
    };
    const optimistic: PendingMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      sender_id: staff?.id || '',
      sender_name: staff?.name || '',
      sender_role: 'staff',
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
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, _status: 'sending' } : m))
    );
    performSend(msg.id, msg._payload);
  };

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
            aria-label="Tillbaka"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 flex flex-col items-center -ml-9 pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Briefcase className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-medium text-foreground mt-0.5 truncate max-w-[60%]">{client}</span>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {loading && messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <AlertCircle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button
            onClick={loadMessages}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm active:scale-95 transition-transform"
          >
            <RefreshCw className="w-4 h-4" />
            Försök igen
          </button>
        </div>
      ) : (
        <MessageList
          messages={messages}
          myIds={myIdsRef.current}
          showSenderNames
          renderFooter={(m) => {
            const pm = m as PendingMessage;
            if (pm._status === 'failed') {
              return (
                <button
                  onClick={() => handleRetry(pm)}
                  className="flex items-center gap-1 mt-1 mr-1.5 text-[10px] text-destructive hover:underline"
                  aria-label="Skicka igen"
                >
                  <AlertCircle className="w-3 h-3" />
                  Ej skickat – tryck för att försöka igen
                </button>
              );
            }
            if (pm._status === 'sending') {
              return (
                <span className="mt-1 mr-1.5 text-[10px] text-muted-foreground/70">Skickar…</span>
              );
            }
            return null;
          }}
        />
      )}
      <ChatInput onSend={handleSend} placeholder="Meddelande till teamet" />
    </div>
  );
};

export default JobChatView;
