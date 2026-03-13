import { useState, useRef, useEffect } from 'react';
import { StaffMessage, sendAdminMessage, markAllMessagesAsRead } from '@/services/staffDashboardService';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Send, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { format, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MessagesFeedProps {
  messages: StaffMessage[];
  isLoading: boolean;
}

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Igår ${format(d, 'HH:mm')}`;
  return format(d, 'd MMM HH:mm', { locale: sv });
}

function groupByDate(messages: StaffMessage[]) {
  const groups: { label: string; messages: StaffMessage[] }[] = [];
  let currentLabel = '';

  for (const msg of messages) {
    const d = new Date(msg.created_at);
    let label: string;
    if (isToday(d)) label = 'Idag';
    else if (isYesterday(d)) label = 'Igår';
    else label = format(d, 'd MMMM yyyy', { locale: sv });

    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

const MessagesFeed = ({ messages, isLoading }: MessagesFeedProps) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const adminName = user?.email || 'Admin';
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isLoading]);

  // Mark unread messages as read
  useEffect(() => {
    const unread = messages.filter(m => !m.is_read && m.sender_type === 'staff');
    if (unread.length > 0) {
      markAllMessagesAsRead().then(() => {
        queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
      });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendAdminMessage(input, adminName);
      setInput('');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const unreadCount = messages.filter(m => !m.is_read && m.sender_type === 'staff').length;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border">
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const groups = groupByDate(messages);

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground flex-1">Meddelanden</h2>
        {unreadCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
            {unreadCount}
          </span>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <MessageSquare className="w-8 h-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">Inga meddelanden ännu</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Meddelanden från fältpersonal visas här</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-3">
                <span className="px-2.5 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {group.label}
                </span>
              </div>

              {group.messages.map((msg) => {
                const isAdmin = msg.sender_type === 'admin';
                const isUrgent = msg.message_type === 'urgent';

                return (
                  <div
                    key={msg.id}
                    className={`flex mb-1.5 ${isAdmin ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                        isAdmin
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : isUrgent
                            ? 'bg-destructive/10 border border-destructive/20 rounded-bl-md'
                            : 'bg-muted rounded-bl-md'
                      }`}
                    >
                      {/* Sender name */}
                      <div className={`flex items-center gap-1 mb-0.5 ${isAdmin ? 'justify-end' : ''}`}>
                        {isUrgent && !isAdmin && <AlertTriangle className="w-3 h-3 text-destructive" />}
                        <span className={`text-[10px] font-bold ${
                          isAdmin ? 'text-primary-foreground/70' : 'text-foreground/70'
                        }`}>
                          {isAdmin ? (msg.sender_name || 'Admin') : msg.staff_name}
                        </span>
                      </div>

                      {/* Content */}
                      <p className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                        isAdmin ? 'text-primary-foreground' : 'text-foreground'
                      }`}>
                        {msg.content}
                      </p>

                      {/* Time */}
                      <p className={`text-[9px] mt-1 ${
                        isAdmin ? 'text-primary-foreground/50 text-right' : 'text-muted-foreground/60'
                      }`}>
                        {formatMessageTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="px-3 py-2.5 border-t border-border bg-muted/20">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv ett meddelande..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-24"
            style={{ minHeight: '36px' }}
          />
          <Button
            size="icon"
            className="rounded-xl h-9 w-9 flex-shrink-0"
            disabled={!input.trim() || sending}
            onClick={handleSend}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MessagesFeed;
