import { StaffMessage } from '@/services/staffDashboardService';
import { markMessageAsRead, markAllMessagesAsRead } from '@/services/staffDashboardService';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare, AlertTriangle, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';

interface MessagesFeedProps {
  messages: StaffMessage[];
  isLoading: boolean;
}

const MessagesFeed = ({ messages, isLoading }: MessagesFeedProps) => {
  const queryClient = useQueryClient();
  const unreadCount = messages.filter(m => !m.is_read).length;

  const handleMarkRead = async (id: string) => {
    await markMessageAsRead(id);
    queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
  };

  const handleMarkAllRead = async () => {
    await markAllMessagesAsRead();
    queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-foreground">Meddelanden</h2>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleMarkAllRead}>
            <CheckCheck className="w-3.5 h-3.5 mr-1" />
            Markera alla
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">Inga meddelanden ännu</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl border px-3 py-2.5 transition-all cursor-pointer hover:shadow-sm ${
                !msg.is_read
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-card'
              }`}
              onClick={() => !msg.is_read && handleMarkRead(msg.id)}
            >
              <div className="flex items-start gap-2">
                <div className={`p-1 rounded-lg mt-0.5 ${
                  msg.message_type === 'urgent' ? 'bg-destructive/10' : 'bg-primary/10'
                }`}>
                  {msg.message_type === 'urgent' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{msg.staff_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: sv })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{msg.content}</p>
                </div>
                {!msg.is_read && (
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MessagesFeed;
