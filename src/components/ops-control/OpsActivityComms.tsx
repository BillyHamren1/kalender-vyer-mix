import { useState } from 'react';
import { JobActivityItem, StaffMessage } from '@/services/staffDashboardService';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Image, Clock, Send } from 'lucide-react';
import { formatDistanceToNow, format, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { sendAdminMessage } from '@/services/staffDashboardService';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  activity: JobActivityItem[];
  isLoadingActivity: boolean;
  messages: StaffMessage[];
  isLoadingMessages: boolean;
}

const typeIcons = {
  comment: MessageCircle,
  file: Image,
  time_report: Clock,
};

const OpsActivityComms = ({ activity, isLoadingActivity, messages, isLoadingMessages }: Props) => {
  const [tab, setTab] = useState<'activity' | 'chat'>('activity');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleSend = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      await sendAdminMessage(msg, user?.email?.split('@')[0] || 'Admin');
      setMsg('');
      queryClient.invalidateQueries({ queryKey: ['ops-control', 'messages'] });
    } finally {
      setSending(false);
    }
  };

  const recentMessages = messages.slice(-20);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-1 mb-2">
        <button
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
            tab === 'activity' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('activity')}
        >
          Aktivitet
        </button>
        <button
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
            tab === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('chat')}
        >
          Chatt
          {messages.filter(m => !m.is_read && m.sender_type === 'staff').length > 0 && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-destructive inline-block" />
          )}
        </button>
      </div>

      {tab === 'activity' ? (
        isLoadingActivity ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {activity.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">Ingen aktivitet senaste 24h</div>
            ) : (
              activity.slice(0, 15).map(item => {
                const Icon = typeIcons[item.type] || MessageCircle;
                return (
                  <div key={item.id} className="flex items-start gap-2 py-1">
                    <Icon className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] font-medium text-foreground">{item.author}</span>
                      <span className="text-[10px] text-muted-foreground ml-1 truncate">{item.content}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(item.created_at), { locale: sv, addSuffix: true })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : (
        /* Chat */
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto space-y-1 mb-2">
            {isLoadingMessages ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 rounded" />)}</div>
            ) : (
              recentMessages.map(m => (
                <div key={m.id} className={`flex ${m.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-2 py-1 rounded-lg text-[11px] ${
                    m.sender_type === 'admin'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}>
                    {m.sender_type !== 'admin' && (
                      <span className="font-bold text-[10px]">{m.sender_name || m.staff_name} · </span>
                    )}
                    {m.content}
                    <span className="text-[8px] opacity-60 ml-1">
                      {isToday(new Date(m.created_at)) ? format(new Date(m.created_at), 'HH:mm') : format(new Date(m.created_at), 'd/M HH:mm')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <input
              className="flex-1 text-xs bg-muted rounded-lg px-2 py-1.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
              placeholder="Skriv meddelande..."
              value={msg}
              onChange={e => setMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
            />
            <button
              className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              onClick={handleSend}
              disabled={!msg.trim() || sending}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default OpsActivityComms;
