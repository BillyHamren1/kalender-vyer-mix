import { useState, useMemo, useRef, useEffect } from 'react';
import { useStaffDashboard } from '@/hooks/useStaffDashboard';
import { useMyIdentity } from '@/hooks/useMyIdentity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDMInboxGrouped, GroupedConversation } from '@/services/directMessageService';
import { StaffMessage, sendAdminMessage, markAllMessagesAsRead, JobActivityItem } from '@/services/staffDashboardService';
import { supabase } from '@/integrations/supabase/client';
import OpsDirectChat from '@/components/ops-control/OpsDirectChat';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageCircle, Bell, Mail, Users, Send, Search, Plus,
  UserCheck, ArrowRightLeft, Clock, Image, AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { sv } from 'date-fns/locale';

interface FeedEvent {
  id: string;
  timestamp: string;
  icon: typeof MessageCircle;
  iconCls: string;
  actor: string;
  description: string;
  context: string | null;
}

const CommunicationPage = () => {
  const { messages, isLoadingMessages, activity, isLoadingActivity } = useStaffDashboard();
  const { allIds, displayName } = useMyIdentity();
  const queryClient = useQueryClient();
  const adminName = displayName;

  const [tab, setTab] = useState<'feed' | 'conversations' | 'chat'>('conversations');
  const [dmTarget, setDmTarget] = useState<{ staffId: string; staffName: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  // Fetch DM inbox
  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery({
    queryKey: ['dm-inbox-grouped', ...allIds],
    queryFn: () => fetchDMInboxGrouped(allIds),
    enabled: allIds.length > 0,
    refetchInterval: 15000,
  });

  // Fetch staff for new message
  const { data: staffList = [] } = useQuery({
    queryKey: ['staff-list-for-dm'],
    queryFn: async () => {
      const { data } = await supabase
        .from('staff_members' as any)
        .select('id, name')
        .order('name') as any;
      return (data || []) as { id: string; name: string }[];
    },
  });

  const totalUnreadDMs = conversations.reduce((sum, c) => sum + c.unreadCount, 0);
  const unreadBroadcast = messages.filter(m => !m.is_read && m.sender_type === 'staff').length;

  const filteredStaff = useMemo(() => {
    if (!staffSearch.trim()) return staffList.slice(0, 20);
    const q = staffSearch.toLowerCase();
    return staffList.filter(s => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [staffList, staffSearch]);

  // Build activity feed
  const feed = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];
    for (const item of activity) {
      let iconCls = 'text-primary';
      let Icon = MessageCircle;
      if (item.type === 'time_report') { Icon = Clock; iconCls = 'text-emerald-600'; }
      else if (item.type === 'file') { Icon = Image; iconCls = 'text-violet-600'; }
      else if (item.type === 'direct_message') { Icon = Mail; iconCls = 'text-blue-600'; }
      else if (item.type === 'broadcast') { Icon = Users; iconCls = 'text-amber-600'; }
      else if (item.type === 'job_message') { Icon = MessageCircle; iconCls = 'text-primary'; }
      events.push({
        id: item.id, timestamp: item.created_at,
        icon: Icon, iconCls,
        actor: item.author,
        description: item.content.length > 80 ? item.content.slice(0, 77) + '…' : item.content,
        context: item.project_name || null,
      });
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events.slice(0, 50);
  }, [activity]);

  // Broadcast chat
  const recentMessages = messages.slice(-50);
  useEffect(() => {
    if (tab === 'chat' && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [tab, messages]);

  useEffect(() => {
    if (tab === 'chat') {
      const unread = messages.filter(m => !m.is_read && m.sender_type === 'staff');
      if (unread.length > 0) {
        markAllMessagesAsRead().then(() => {
          queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
        });
      }
    }
  }, [tab, messages]);

  const handleSendBroadcast = async () => {
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      await sendAdminMessage(msg, adminName);
      setMsg('');
      queryClient.invalidateQueries({ queryKey: ['staff-dashboard-messages'] });
    } finally {
      setSending(false);
    }
  };

  const handleOpenDM = (staffId: string, staffName: string) => {
    setDmTarget({ staffId, staffName });
    setShowNewMsg(false);
    setStaffSearch('');
  };

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Left panel: tabs */}
      <div className="flex flex-col w-full max-w-lg border-r border-border bg-card">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <h1 className="text-lg font-bold text-foreground">Kommunikation</h1>
        </div>

        {/* Tab buttons */}
        <div className="flex gap-0.5 px-3 py-2 border-b border-border shrink-0">
          <button
            className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-colors ${
              tab === 'feed' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('feed')}
          >
            <Bell className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Aktivitet
          </button>
          <button
            className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-colors ${
              tab === 'conversations' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('conversations')}
          >
            <Mail className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Konversationer
            {totalUnreadDMs > 0 && (
              <span className="ml-1 text-[9px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                {totalUnreadDMs}
              </span>
            )}
          </button>
          <button
            className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-colors ${
              tab === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('chat')}
          >
            <Users className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            Broadcast
            {unreadBroadcast > 0 && (
              <span className="ml-1 text-[9px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 leading-none">
                {unreadBroadcast}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === 'feed' ? (
            <div className="p-3">
              {isLoadingActivity ? (
                <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
              ) : feed.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">Ingen aktivitet senaste 24h</div>
              ) : (
                <div className="space-y-0">
                  {feed.map((event) => {
                    const Icon = event.icon;
                    return (
                      <div key={event.id} className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors">
                        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${event.iconCls}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] leading-tight">
                            <span className="font-semibold text-foreground">{event.actor}</span>
                            <span className="text-muted-foreground ml-1">{event.description}</span>
                          </div>
                          {event.context && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{event.context}</div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {isToday(new Date(event.timestamp))
                            ? format(new Date(event.timestamp), 'HH:mm')
                            : formatDistanceToNow(new Date(event.timestamp), { locale: sv, addSuffix: true })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : tab === 'conversations' ? (
            <div className="p-3">
              {/* New message button */}
              <div className="relative mb-3">
                <button
                  onClick={() => setShowNewMsg(!showNewMsg)}
                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity w-full justify-center"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nytt meddelande
                </button>

                {showNewMsg && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-[200px] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
                      <Search className="w-3.5 h-3.5 text-muted-foreground" />
                      <input
                        autoFocus
                        className="flex-1 text-[12px] bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                        placeholder="Sök personal..."
                        value={staffSearch}
                        onChange={e => setStaffSearch(e.target.value)}
                      />
                    </div>
                    <div className="overflow-y-auto flex-1">
                      {filteredStaff.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground text-center py-3">Ingen personal hittad</div>
                      ) : (
                        filteredStaff.map(s => (
                          <button
                            key={s.id}
                            onClick={() => handleOpenDM(s.id, s.name)}
                            className="w-full text-left px-3 py-2 text-[12px] hover:bg-muted/60 transition-colors flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
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
              {isLoadingConversations ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
              ) : conversations.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">Inga konversationer ännu</div>
              ) : (
                <div className="space-y-0.5">
                  {conversations.map(conv => (
                    <button
                      key={conv.recipientId}
                      onClick={() => handleOpenDM(conv.recipientId, conv.recipientName)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors flex items-start gap-3 ${
                        dmTarget?.staffId === conv.recipientId ? 'bg-muted' : ''
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">
                          {conv.recipientName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        {conv.unreadCount > 0 && (
                          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                            <span className="text-[8px] text-destructive-foreground font-bold">{conv.unreadCount}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
                            {conv.recipientName}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {isToday(new Date(conv.lastTimestamp))
                              ? format(new Date(conv.lastTimestamp), 'HH:mm')
                              : format(new Date(conv.lastTimestamp), 'd/M')}
                          </span>
                        </div>
                        <div className={`text-[11px] truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {conv.isSentByMe && <span className="text-muted-foreground">Du: </span>}
                          {conv.lastMessage.length > 60 ? conv.lastMessage.slice(0, 57) + '…' : conv.lastMessage}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Broadcast tab */
            <div className="flex flex-col h-full">
              <div ref={chatRef} className="flex-1 overflow-y-auto space-y-1 p-3">
                {isLoadingMessages ? (
                  <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
                ) : recentMessages.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">Inga broadcast-meddelanden</div>
                ) : (
                  recentMessages.map(m => (
                    <div key={m.id} className={`flex ${m.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-[13px] ${
                        m.sender_type === 'admin'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : m.message_type === 'urgent'
                            ? 'bg-destructive/10 text-foreground border border-destructive/20 rounded-bl-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                      }`}>
                        {m.sender_type !== 'admin' && (
                          <div className="text-[10px] font-bold mb-0.5 opacity-70">
                            {m.message_type === 'urgent' && <AlertTriangle className="w-3 h-3 text-destructive inline mr-1" />}
                            {m.sender_name || m.staff_name}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        <p className={`text-[9px] mt-1 ${m.sender_type === 'admin' ? 'text-primary-foreground/50 text-right' : 'text-muted-foreground/60'}`}>
                          {isToday(new Date(m.created_at))
                            ? format(new Date(m.created_at), 'HH:mm')
                            : format(new Date(m.created_at), 'd/M HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-3 py-2.5 border-t border-border shrink-0">
                <div className="flex gap-2">
                  <input
                    className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
                    placeholder="Skriv broadcast..."
                    value={msg}
                    onChange={e => setMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendBroadcast()}
                  />
                  <button
                    className="p-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    onClick={handleSendBroadcast}
                    disabled={!msg.trim() || sending}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel: DM Chat */}
      <div className="flex-1 min-w-0 bg-background">
        {dmTarget ? (
          <OpsDirectChat
            staffId={dmTarget.staffId}
            staffName={dmTarget.staffName}
            onClose={() => setDmTarget(null)}
            staffAssignments={[]}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Välj en konversation eller starta en ny</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunicationPage;
