import { useState, useMemo, useRef, useEffect } from 'react';
import { JobActivityItem, StaffMessage } from '@/services/staffDashboardService';
import { fetchDMInboxGrouped, GroupedConversation } from '@/services/directMessageService';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Image, Clock, Send, UserCheck, ArrowRightLeft, AlertTriangle, Bell, Plus, Search, Mail, Users } from 'lucide-react';
import { formatDistanceToNow, format, isToday } from 'date-fns';
import { sv } from 'date-fns/locale';
import { sendAdminMessage } from '@/services/staffDashboardService';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { OpsTimelineStaff } from '@/services/opsControlService';

interface Props {
  activity: JobActivityItem[];
  isLoadingActivity: boolean;
  messages: StaffMessage[];
  isLoadingMessages: boolean;
  onOpenDM?: (staffId: string, staffName: string) => void;
  timeline?: OpsTimelineStaff[];
}

interface FeedEvent {
  id: string;
  timestamp: string;
  icon: typeof MessageCircle;
  iconCls: string;
  actor: string;
  description: string;
  context: string | null;
  category: 'checkin' | 'assignment' | 'message' | 'schedule' | 'file' | 'report';
}

const categoryConfig: Record<FeedEvent['category'], { icon: typeof MessageCircle; cls: string }> = {
  checkin: { icon: UserCheck, cls: 'text-emerald-600' },
  assignment: { icon: ArrowRightLeft, cls: 'text-blue-600' },
  message: { icon: MessageCircle, cls: 'text-primary' },
  schedule: { icon: Clock, cls: 'text-amber-600' },
  file: { icon: Image, cls: 'text-violet-600' },
  report: { icon: Clock, cls: 'text-emerald-600' },
};

const OpsActivityComms = ({ activity, isLoadingActivity, messages, isLoadingMessages, onOpenDM, timeline = [] }: Props) => {
  const [tab, setTab] = useState<'feed' | 'conversations' | 'chat'>('feed');
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const feedRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Get planner ID for DM inbox
  const plannerId = user?.id || '';

  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery({
    queryKey: ['dm-inbox-grouped', plannerId],
    queryFn: () => fetchDMInboxGrouped(plannerId),
    enabled: !!plannerId,
    refetchInterval: 15000,
  });

  const totalUnreadDMs = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Filter staff for new message dropdown
  const filteredStaff = useMemo(() => {
    if (!staffSearch.trim()) return timeline.slice(0, 15);
    const q = staffSearch.toLowerCase();
    return timeline.filter(s => s.name.toLowerCase().includes(q)).slice(0, 15);
  }, [timeline, staffSearch]);

  // Build unified feed
  const feed = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];
    for (const item of activity) {
      let category: FeedEvent['category'] = 'schedule';
      let description = item.content;
      if (item.type === 'time_report') { category = 'checkin'; description = `rapporterade ${item.content}`; }
      else if (item.type === 'file') { category = 'file'; description = `laddade upp ${item.content}`; }
      else if (item.type === 'comment') { category = 'message'; description = item.content.length > 60 ? item.content.slice(0, 57) + '…' : item.content; }
      events.push({
        id: `act-${item.id}`, timestamp: item.created_at,
        icon: categoryConfig[category].icon, iconCls: categoryConfig[category].cls,
        actor: item.author, description, context: item.project_name || null, category,
      });
    }
    const staffMsgs = messages.filter(m => m.sender_type === 'staff');
    for (const m of staffMsgs.slice(-15)) {
      const isUrgent = m.message_type === 'urgent';
      events.push({
        id: `msg-${m.id}`, timestamp: m.created_at,
        icon: isUrgent ? AlertTriangle : MessageCircle,
        iconCls: isUrgent ? 'text-destructive' : 'text-primary',
        actor: m.staff_name || m.sender_name || 'Personal',
        description: m.content.length > 60 ? m.content.slice(0, 57) + '…' : m.content,
        context: null, category: 'message',
      });
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 30);
  }, [activity, messages]);

  useEffect(() => {
    if (tab === 'chat' && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [tab, messages]);

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

  const handleSelectStaff = (staffId: string, staffName: string) => {
    setShowNewMsg(false);
    setStaffSearch('');
    onOpenDM?.(staffId, staffName);
  };

  const unreadCount = messages.filter(m => !m.is_read && m.sender_type === 'staff').length;
  const recentMessages = messages.slice(-30);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-0.5 mb-2 shrink-0">
        <button
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
            tab === 'feed' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('feed')}
        >
          <Bell className="w-3 h-3 inline mr-0.5 -mt-0.5" />
          Logg
        </button>
        <button
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
            tab === 'conversations' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('conversations')}
        >
          <Mail className="w-3 h-3 inline mr-0.5 -mt-0.5" />
          Konversationer
          {totalUnreadDMs > 0 && (
            <span className="ml-1 text-[8px] bg-destructive text-destructive-foreground rounded-full px-1 py-0.5 leading-none">
              {totalUnreadDMs}
            </span>
          )}
        </button>
        <button
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
            tab === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('chat')}
        >
          <Users className="w-3 h-3 inline mr-0.5 -mt-0.5" />
          Broadcast
          {unreadCount > 0 && (
            <span className="ml-1 text-[8px] bg-destructive text-destructive-foreground rounded-full px-1 py-0.5 leading-none">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'feed' ? (
        isLoadingActivity || isLoadingMessages ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : (
          <div ref={feedRef} className="space-y-0 overflow-y-auto flex-1">
            {feed.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">Ingen aktivitet ännu</div>
            ) : (
              feed.map((event, idx) => {
                const Icon = event.icon;
                const prevEvent = idx > 0 ? feed[idx - 1] : null;
                const showTimeSep = prevEvent && (
                  new Date(prevEvent.timestamp).getTime() - new Date(event.timestamp).getTime() > 30 * 60 * 1000
                );
                return (
                  <div key={event.id}>
                    {showTimeSep && (
                      <div className="flex items-center gap-2 py-1 px-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[8px] text-muted-foreground font-medium">
                          {format(new Date(event.timestamp), 'HH:mm')}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className="flex items-start gap-2 px-1 py-1.5 rounded hover:bg-muted/40 transition-colors group">
                      <div className="flex flex-col items-center shrink-0 mt-0.5">
                        <Icon className={`w-3.5 h-3.5 ${event.iconCls}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] leading-tight">
                          <span className="font-semibold text-foreground">{event.actor}</span>
                          <span className="text-muted-foreground ml-1">{event.description}</span>
                        </div>
                        {event.context && (
                          <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{event.context}</div>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        {isToday(new Date(event.timestamp))
                          ? format(new Date(event.timestamp), 'HH:mm')
                          : formatDistanceToNow(new Date(event.timestamp), { locale: sv, addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )
      ) : tab === 'conversations' ? (
        /* Conversations tab */
        <div className="flex flex-col flex-1 min-h-0">
          {/* New message button + dropdown */}
          <div className="relative mb-2">
            <button
              onClick={() => setShowNewMsg(!showNewMsg)}
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity w-full justify-center"
            >
              <Plus className="w-3 h-3" />
              Nytt meddelande
            </button>

            {showNewMsg && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[140px] overflow-hidden flex flex-col">
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border">
                  <Search className="w-3 h-3 text-muted-foreground" />
                  <input
                    autoFocus
                    className="flex-1 text-[11px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                    placeholder="Sök personal..."
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {filteredStaff.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground text-center py-2">Ingen personal hittad</div>
                  ) : (
                    filteredStaff.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectStaff(s.id, s.name)}
                        className="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-muted/60 transition-colors flex items-center gap-2"
                      >
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                          {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className="truncate text-foreground">{s.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto space-y-0.5">
            {isLoadingConversations ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
            ) : conversations.length === 0 ? (
              <div className="text-[11px] text-muted-foreground text-center py-6">
                Inga konversationer ännu
              </div>
            ) : (
              conversations.map(conv => (
                <button
                  key={conv.recipientId}
                  onClick={() => onOpenDM?.(conv.recipientId, conv.recipientName)}
                  className="w-full text-left px-2 py-2 rounded-md hover:bg-muted/50 transition-colors flex items-start gap-2 group"
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {conv.recipientName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-destructive rounded-full flex items-center justify-center">
                        <span className="text-[7px] text-destructive-foreground font-bold">{conv.unreadCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] truncate ${conv.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                        {conv.recipientName}
                      </span>
                      <span className="text-[9px] text-muted-foreground shrink-0 ml-1">
                        {isToday(new Date(conv.lastTimestamp))
                          ? format(new Date(conv.lastTimestamp), 'HH:mm')
                          : format(new Date(conv.lastTimestamp), 'd/M')}
                      </span>
                    </div>
                    <div className={`text-[10px] truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {conv.isSentByMe && <span className="text-muted-foreground">Du: </span>}
                      {conv.lastMessage.length > 50 ? conv.lastMessage.slice(0, 47) + '…' : conv.lastMessage}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Broadcast/Chat tab */
        <div className="flex flex-col flex-1 min-h-0">
          <div ref={chatRef} className="flex-1 overflow-y-auto space-y-1 mb-2">
            {isLoadingMessages ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-6 rounded" />)}</div>
            ) : (
              recentMessages.map(m => (
                <div key={m.id} className={`flex ${m.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-2 py-1 rounded-lg text-[11px] ${
                    m.sender_type === 'admin'
                      ? 'bg-primary text-primary-foreground'
                      : m.message_type === 'urgent'
                        ? 'bg-destructive/10 text-destructive border border-destructive/20'
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
