import { useState, useRef, useEffect } from 'react';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { sendDirectMessage, markDirectMessagesRead } from '@/services/directMessageService';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, isToday } from 'date-fns';
import { Send, X, MessageCircle, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const QUICK_MESSAGES = [
  'Försenad?',
  'Bekräfta ankomst',
  'Ring mig',
  'Uppdatera ETA',
  'Allt ok?',
  'Behöver hjälp?',
];

interface Props {
  staffId: string;
  staffName: string;
  onClose: () => void;
}

const OpsDirectChat = ({ staffId, staffName, onClose }: Props) => {
  const { user } = useAuth();
  const myId = user?.id || 'admin';
  const myName = user?.email?.split('@')[0] || 'Admin';
  const { messages, isLoading } = useDirectMessages(myId, staffId);
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark as read on open
  useEffect(() => {
    if (myId && staffId) {
      markDirectMessagesRead(myId, staffId);
    }
  }, [myId, staffId]);

  const handleSend = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      await sendDirectMessage(myId, myName, 'planner', staffId, staffName, msg);
      setMsg('');
      queryClient.invalidateQueries({ queryKey: ['direct-messages'] });
    } catch {
      toast.error('Kunde inte skicka meddelande');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-foreground truncate block">{staffName}</span>
            <span className="text-[10px] text-muted-foreground">Direktmeddelande</span>
          </div>
        </div>
        <button className="p-1 rounded text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <div className="text-xs text-muted-foreground">Ingen konversation ännu</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Skriv ett meddelande till {staffName}</div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isOwn = m.sender_id === myId;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showSender = !prevMsg || prevMsg.sender_id !== m.sender_id;

            return (
              <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  {showSender && !isOwn && (
                    <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                      {m.sender_name}
                    </div>
                  )}
                  <div className={`px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {m.content}
                    <span className={`text-[8px] ml-1.5 ${isOwn ? 'opacity-60' : 'text-muted-foreground'}`}>
                      {isToday(new Date(m.created_at))
                        ? format(new Date(m.created_at), 'HH:mm')
                        : format(new Date(m.created_at), 'd/M HH:mm')
                      }
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick shortcuts */}
      <div className="shrink-0 border-t border-border px-3 pt-1.5 pb-0.5">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="w-2.5 h-2.5 text-primary" />
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Snabbmeddelanden</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_MESSAGES.map((qm) => (
            <button
              key={qm}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-accent text-foreground border border-border hover:border-accent transition-colors"
              onClick={() => setMsg(qm)}
              onDoubleClick={async () => {
                setMsg(qm);
                setSending(true);
                try {
                  await sendDirectMessage(myId, myName, 'planner', staffId, staffName, qm);
                  setMsg('');
                  queryClient.invalidateQueries({ queryKey: ['direct-messages'] });
                } catch {
                  toast.error('Kunde inte skicka meddelande');
                } finally {
                  setSending(false);
                }
              }}
            >
              {qm}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          <input
            className="flex-1 text-xs bg-muted rounded-lg px-2.5 py-1.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
            placeholder={`Till ${staffName}...`}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            onClick={handleSend}
            disabled={!msg.trim() || sending}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpsDirectChat;
