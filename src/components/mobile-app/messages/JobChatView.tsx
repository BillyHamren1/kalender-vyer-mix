import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Briefcase } from 'lucide-react';
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

export const JobChatView = ({ bookingId, client, onBack }: Props) => {
  const { staff } = useMobileAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const myIdsRef = useRef<Set<string>>(new Set([staff?.id || '']));

  useEffect(() => {
    let cancelled = false;
    mobileApi.getJobMessages(bookingId)
      .then((res) => { if (!cancelled) setMessages((res.messages as ChatMessage[]) || []); })
      .catch(() => { if (!cancelled) setMessages([]); });
    // Mark as read on open
    mobileApi.markJobRead(bookingId).catch(() => {});
    return () => { cancelled = true; };
  }, [bookingId]);

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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId, staff?.id]);

  const handleSend = async (data: { content: string; file_url?: string; file_name?: string; file_type?: string }) => {
    // Job messages don't yet support attachments server-side; send content + note
    const text = data.content || (data.file_url ? `📎 ${data.file_name || 'Bilaga'}: ${data.file_url}` : '');
    if (!text) return;
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      sender_id: staff?.id || '',
      sender_name: staff?.name || '',
      sender_role: 'staff',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await mobileApi.sendJobMessage({ booking_id: bookingId, content: text });
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } catch {
      toast.error('Kunde inte skicka meddelandet');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    }
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

      <MessageList messages={messages} myIds={myIdsRef.current} showSenderNames />
      <ChatInput onSend={handleSend} placeholder="Meddelande till teamet" />
    </div>
  );
};

export default JobChatView;
