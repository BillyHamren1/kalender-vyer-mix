import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { toast } from 'sonner';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { ChatMessage } from './MessageBubble';

interface Props {
  partnerId: string;
  partnerName: string;
  initialMessages: ChatMessage[];
  onBack: () => void;
  onMessagesChanged?: (messages: ChatMessage[]) => void;
}

/** iMessage-style 1:1 DM view with realtime + read receipts. */
export const DmChatView = ({ partnerId, partnerName, initialMessages, onBack, onMessagesChanged }: Props) => {
  const { staff } = useMobileAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const myIdsRef = useRef<Set<string>>(new Set([staff?.id || '']));

  // Keep local copy in sync with parent updates
  useEffect(() => { setMessages(initialMessages); }, [partnerId]); // eslint-disable-line

  // Mark partner messages as read on open + whenever new ones arrive
  useEffect(() => {
    mobileApi.markDMRead(partnerId).catch(() => { /* ignore */ });
  }, [partnerId, messages.length]);

  // Realtime: append new messages between us, update read receipts
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
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const next = [...prev, m];
            onMessagesChanged?.(next);
            return next;
          });
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
            onMessagesChanged?.(next);
            return next;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [partnerId, staff?.id]); // eslint-disable-line

  const handleSend = async (data: { content: string; file_url?: string; file_name?: string; file_type?: string }) => {
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      sender_id: staff?.id || '',
      sender_name: staff?.name || '',
      content: data.content || (data.file_name ? `📎 ${data.file_name}` : '📎'),
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      file_url: data.file_url || null,
      file_name: data.file_name || null,
      file_type: data.file_type || null,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await mobileApi.sendDirectMessage({ recipient_id: partnerId, ...data });
      // realtime INSERT will replace the optimistic with the real row
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch (e: any) {
      console.error(e);
      toast.error('Kunde inte skicka meddelandet');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* iMessage-style header: avatar above name */}
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
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {partnerName.charAt(0).toUpperCase()}
            </div>
            <span className="text-[11px] font-medium text-foreground mt-0.5 truncate max-w-[60%]">
              {partnerName}
            </span>
          </div>
          <button
            className="p-2 rounded-full text-primary active:scale-95 transition-transform opacity-30"
            aria-label="Ring"
            disabled
          >
            <Phone className="w-5 h-5" />
          </button>
        </div>
      </div>

      <MessageList
        messages={messages}
        myIds={myIdsRef.current}
      />

      <ChatInput onSend={handleSend} />
    </div>
  );
};

export default DmChatView;
