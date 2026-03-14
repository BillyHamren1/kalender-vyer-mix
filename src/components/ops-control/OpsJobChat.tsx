import { useState, useRef, useEffect } from 'react';
import { useJobChat } from '@/hooks/useJobChat';
import { sendJobMessage } from '@/services/jobChatService';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, isToday } from 'date-fns';
import { Send, X, Users, MessageCircle, Shield, Crown, User } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  bookingId: string;
  bookingLabel: string; // e.g. "#1234 — Client Name"
  onClose: () => void;
}

const roleConfig = {
  planner: { icon: Shield, label: 'Planerare', cls: 'text-primary' },
  team_leader: { icon: Crown, label: 'Lagledare', cls: 'text-amber-600' },
  staff: { icon: User, label: 'Personal', cls: 'text-muted-foreground' },
};

const OpsJobChat = ({ bookingId, bookingLabel, onClose }: Props) => {
  const { messages, isLoadingMessages, participants, isLoadingParticipants } = useJobChat(bookingId);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      const senderName = user?.email?.split('@')[0] || 'Admin';
      await sendJobMessage(bookingId, user?.id || 'admin', senderName, 'planner', msg);
      setMsg('');
      queryClient.invalidateQueries({ queryKey: ['job-chat', bookingId] });
    } catch {
      toast.error('Kunde inte skicka meddelande');
    } finally {
      setSending(false);
    }
  };

  const activeMessages = messages.filter(m => !m.is_archived);
  const staffCount = participants.filter(p => p.role !== 'planner').length;
  const plannerCount = participants.filter(p => p.role === 'planner').length;

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-bold text-foreground truncate">{bookingLabel}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {staffCount} personal · {plannerCount} planerare
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className={`p-1 rounded transition-colors ${showParticipants ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            onClick={() => setShowParticipants(!showParticipants)}
            title="Visa deltagare"
          >
            <Users className="w-3.5 h-3.5" />
          </button>
          <button
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Participants panel */}
      {showParticipants && (
        <div className="shrink-0 border-b border-border px-3 py-2 bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Deltagare</div>
          {isLoadingParticipants ? (
            <Skeleton className="h-8 rounded" />
          ) : (
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {participants.map(p => {
                const cfg = roleConfig[p.role];
                const Icon = cfg.icon;
                return (
                  <div key={`${p.role}-${p.id}`} className="flex items-center gap-1.5 text-[10px]">
                    <Icon className={`w-3 h-3 ${cfg.cls}`} />
                    <span className="text-foreground">{p.name}</span>
                    <span className="text-muted-foreground">· {cfg.label}</span>
                  </div>
                );
              })}
              {participants.length === 0 && (
                <div className="text-[10px] text-muted-foreground">Inga deltagare ännu</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {isLoadingMessages ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : activeMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <div className="text-xs text-muted-foreground">Ingen konversation ännu</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Skriv ett meddelande för att starta</div>
          </div>
        ) : (
          activeMessages.map((m, idx) => {
            const isOwn = m.sender_id === user?.id || m.sender_id === 'admin';
            const prevMsg = idx > 0 ? activeMessages[idx - 1] : null;
            const showSender = !prevMsg || prevMsg.sender_id !== m.sender_id;
            const cfg = roleConfig[m.sender_role as keyof typeof roleConfig] || roleConfig.staff;

            return (
              <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {showSender && !isOwn && (
                    <div className={`text-[9px] font-semibold mb-0.5 flex items-center gap-0.5 ${cfg.cls}`}>
                      {m.sender_name}
                      <span className="text-muted-foreground font-normal">· {cfg.label}</span>
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

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          <input
            className="flex-1 text-xs bg-muted rounded-lg px-2.5 py-1.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
            placeholder="Skriv till teamet..."
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

export default OpsJobChat;
