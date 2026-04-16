import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileInbox } from '@/hooks/useMobileInbox';
import { MessageCircle, Radio, ArrowLeft, Send, ChevronRight, Briefcase, User, AlertTriangle, CloudRain, CalendarClock, Truck, Info, Plus, Search, Loader2, Archive } from 'lucide-react';
import { MobileHeroHeader, MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { format, isToday, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

type InboxView = 'list' | 'dm-thread' | 'job-thread' | 'broadcast-detail' | 'new-message';

interface DMConversation {
  partner_id: string;
  partner_name: string;
  last_message: any;
  unread_count: number;
  messages: any[];
}

interface BroadcastItem {
  id: string;
  sender_name: string;
  content: string;
  category: string;
  audience: string;
  is_read: boolean;
  created_at: string;
}

const categoryIcons: Record<string, typeof Info> = {
  info: Info,
  weather: CloudRain,
  schedule: CalendarClock,
  logistics: Truck,
  urgent: AlertTriangle,
};

const categoryLabels: Record<string, string> = {
  info: 'Information',
  weather: 'Weather alert',
  schedule: 'Schedule change',
  logistics: 'Logistics',
  urgent: 'Urgent',
};

const MobileInbox = () => {
  const navigate = useNavigate();
  const { staff } = useMobileAuth();
  const { dmConversations, broadcasts, jobConversations, isLoading: loading, markDMReadOptimistic, appendDMMessage, markBroadcastReadOptimistic } = useMobileInbox();
  const [view, setView] = useState<InboxView>('list');

  const [activeDM, setActiveDM] = useState<DMConversation | null>(null);
  const [activeJob, setActiveJob] = useState<{ bookingId: string; client: string } | null>(null);
  const [activeJobMessages, setActiveJobMessages] = useState<any[]>([]);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showArchived, setShowArchived] = useState(false);

  const now = new Date();
  const activeJobs = jobConversations.filter(job => {
    if (!job.lastDate) return true;
    const daysSince = differenceInDays(now, parseISO(job.lastDate));
    return daysSince < 7;
  });
  const archivedJobs = jobConversations.filter(job => {
    if (!job.lastDate) return false;
    const daysSince = differenceInDays(now, parseISO(job.lastDate));
    return daysSince >= 7;
  });

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [activeDM?.messages, activeJobMessages]);

  const totalUnread = dmConversations.reduce((sum, c) => sum + c.unread_count, 0) + broadcasts.filter(b => !b.is_read).length;

  const openDM = async (conv: DMConversation) => {
    setActiveDM(conv);
    setView('dm-thread');
    if (conv.unread_count > 0) {
      markDMReadOptimistic(conv.partner_id);
      try {
        await mobileApi.markDMRead(conv.partner_id);
      } catch { /* ignore */ }
    }
  };

  const openJobThread = async (job: { bookingId: string; client: string }) => {
    setActiveJob(job);
    setView('job-thread');
    try {
      const res = await mobileApi.getJobMessages(job.bookingId);
      setActiveJobMessages(res.messages || []);
    } catch {
      setActiveJobMessages([]);
    }
  };

  const openBroadcast = async (b: BroadcastItem) => {
    setActiveBroadcast(b);
    setView('broadcast-detail');
    if (!b.is_read) {
      markBroadcastReadOptimistic(b.id);
      try {
        await mobileApi.markBroadcastRead(b.id);
      } catch { /* ignore */ }
    }
  };

  const handleSendDM = async () => {
    if (!newMsg.trim() || !activeDM || sending) return;
    setSending(true);
    const optimisticMsg = {
      id: Date.now().toString(),
      sender_id: staff?.id,
      sender_name: staff?.name,
      content: newMsg.trim(),
      created_at: new Date().toISOString(),
    };
    try {
      await mobileApi.sendDirectMessage({ recipient_id: activeDM.partner_id, content: newMsg.trim() });
      setActiveDM(prev => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : null);
      appendDMMessage(activeDM.partner_id, optimisticMsg);
      setNewMsg('');
    } catch { toast.error('Could not send'); }
    finally { setSending(false); }
  };

  const handleSendJobMsg = async () => {
    if (!newMsg.trim() || !activeJob || sending) return;
    setSending(true);
    try {
      await mobileApi.sendJobMessage({ booking_id: activeJob.bookingId, content: newMsg.trim() });
      setActiveJobMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender_id: staff?.id,
        sender_name: staff?.name,
        sender_role: 'staff',
        content: newMsg.trim(),
        created_at: new Date().toISOString(),
      }]);
      setNewMsg('');
    } catch { toast.error('Could not send'); }
    finally { setSending(false); }
  };

  const goBack = () => {
    setView('list');
    setActiveDM(null);
    setActiveJob(null);
    setActiveBroadcast(null);
    setNewMsg('');
  };

  const formatTime = (ts: string) => {
    const d = parseISO(ts);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM HH:mm');
  };

  // === INBOX LIST VIEW ===
  if (view === 'list') {
    return (
      <div className="flex flex-col min-h-screen pb-24 bg-background">
        <MobileHeroHeader
          eyebrow="MESSAGES"
          title="Inbox"
          subtitle={totalUnread > 0 ? `${totalUnread} unread` : 'No unread'}
        />

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : (
            <div className="p-3 space-y-4">
              {/* Broadcasts */}
              {broadcasts.length > 0 && (
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1">
                    <Radio className="w-3 h-3" /> Broadcast
                  </h2>
                  <div className="space-y-1.5">
                    {broadcasts.map(b => {
                      const CatIcon = categoryIcons[b.category] || Info;
                      return (
                        <button
                          key={b.id}
                          onClick={() => openBroadcast(b)}
                          className={cn(
                            "w-full text-left rounded-xl border p-3 flex items-start gap-3 active:scale-[0.98] transition-all",
                            !b.is_read
                              ? b.category === 'urgent'
                                ? "bg-destructive/5 border-destructive/30"
                                : "bg-primary/5 border-primary/20"
                              : "bg-card border-border"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            b.category === 'urgent' ? 'bg-destructive/10' : 'bg-primary/10'
                          )}>
                            <CatIcon className={cn("w-4 h-4", b.category === 'urgent' ? 'text-destructive' : 'text-primary')} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground truncate">{categoryLabels[b.category] || 'Broadcast'}</span>
                              {!b.is_read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{b.content}</p>
                            <span className="text-[9px] text-muted-foreground/60">{formatTime(b.created_at)}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Direct Messages */}
              {dmConversations.length > 0 && (
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1">
                    <User className="w-3 h-3" /> Direct messages
                  </h2>
                  <div className="space-y-1.5">
                    {dmConversations.map(conv => (
                      <button
                        key={conv.partner_id}
                        onClick={() => openDM(conv)}
                        className={cn(
                          "w-full text-left rounded-xl border p-3 flex items-start gap-3 active:scale-[0.98] transition-all",
                          conv.unread_count > 0 ? "bg-primary/5 border-primary/20" : "bg-card border-border"
                        )}
                      >
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-accent-foreground">{conv.partner_name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground truncate">{conv.partner_name}</span>
                            {conv.unread_count > 0 && (
                              <span className="text-[9px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-bold leading-none">{conv.unread_count}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{conv.last_message?.content || ''}</p>
                          {conv.last_message?.created_at && (
                            <span className="text-[9px] text-muted-foreground/60">{formatTime(conv.last_message.created_at)}</span>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Job Chats */}
              {activeJobs.length > 0 && (
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1">
                    <Briefcase className="w-3 h-3" /> Job chat
                  </h2>
                  <div className="space-y-1.5">
                    {activeJobs.map(job => (
                      <button
                        key={job.bookingId}
                        onClick={() => openJobThread(job)}
                        className="w-full text-left rounded-xl border border-border bg-card p-3 flex items-start gap-3 active:scale-[0.98] transition-all"
                      >
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                          <Briefcase className="w-4 h-4 text-secondary-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-foreground truncate block">{job.client}</span>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Open job chat</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Archived Job Chats */}
              {archivedJobs.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="w-full text-left flex items-center gap-1 px-1 mb-1.5"
                  >
                    <Archive className="w-3 h-3 text-muted-foreground" />
                    <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Archived job chats ({archivedJobs.length})
                    </h2>
                    <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform ml-auto", showArchived && "rotate-90")} />
                  </button>
                  {showArchived && (
                    <div className="space-y-1.5">
                      {archivedJobs.map(job => (
                        <button
                          key={job.bookingId}
                          onClick={() => openJobThread(job)}
                          className="w-full text-left rounded-xl border border-border bg-card/60 p-3 flex items-start gap-3 active:scale-[0.98] transition-all opacity-70"
                        >
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Archive className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-semibold text-foreground truncate block">{job.client}</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Archived job chat</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {broadcasts.length === 0 && dmConversations.length === 0 && jobConversations.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No messages yet
                </div>
              )}
            </div>
        )}
        </div>

        {/* FAB – New message */}
        <button
          onClick={() => setView('new-message')}
          className="fixed bottom-28 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    );
  }

  // === NEW MESSAGE – CONTACT PICKER ===
  if (view === 'new-message') {
    return <ContactPicker
      staff={staff}
      dmConversations={dmConversations}
      onSelectContact={(contact) => {
        const existing = dmConversations.find(c => c.partner_id === contact.id);
        if (existing) {
          openDM(existing);
        } else {
          const newConv: DMConversation = {
            partner_id: contact.id,
            partner_name: contact.name,
            last_message: null,
            unread_count: 0,
            messages: [],
          };
          openDM(newConv);
        }
      }}
      onBack={goBack}
    />;
  }

  // === BROADCAST DETAIL ===
  if (view === 'broadcast-detail' && activeBroadcast) {
    const CatIcon = categoryIcons[activeBroadcast.category] || Info;
    return (
      <div className="flex flex-col min-h-screen pb-24 bg-background">
        <MobileBackHeader
          title="Broadcast"
          onBack={goBack}
          titlePrefix={<Radio className="w-4 h-4 text-primary-foreground" />}
        />
        <div className="flex-1 p-4">
          <div className={cn(
            "rounded-2xl border p-5",
            activeBroadcast.category === 'urgent' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className={cn("w-5 h-5", activeBroadcast.category === 'urgent' ? 'text-destructive' : 'text-primary')} />
              <span className="text-sm font-bold text-foreground">{categoryLabels[activeBroadcast.category] || 'Broadcast'}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{activeBroadcast.content}</p>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">From {activeBroadcast.sender_name}</span>
              <span className="text-xs text-muted-foreground">{formatTime(activeBroadcast.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === DM THREAD ===
  if (view === 'dm-thread' && activeDM) {
    const sortedMessages = [...activeDM.messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return (
      <div className="flex flex-col h-[100dvh] bg-background">
        <MobileBackHeader
          title={activeDM.partner_name}
          onBack={goBack}
          titlePrefix={
            <div className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">{activeDM.partner_name.charAt(0)}</span>
            </div>
          }
        />

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {sortedMessages.map(msg => {
            const isMe = msg.sender_id === staff?.id;
            return (
              <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] px-3 py-2 rounded-2xl text-sm",
                  isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"
                )}>
                  {!isMe && <span className="text-[10px] font-bold block mb-0.5 opacity-70">{msg.sender_name}</span>}
                  <p>{msg.content}</p>
                  <span className="text-[9px] opacity-50 block text-right mt-0.5">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 p-3 border-t border-border bg-card safe-area-bottom shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm bg-muted rounded-xl px-3 py-2.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
              placeholder="Type a message..."
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendDM()}
            />
            <button
              onClick={handleSendDM}
              disabled={!newMsg.trim() || sending}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === JOB THREAD ===
  if (view === 'job-thread' && activeJob) {
    return (
      <div className="flex flex-col h-[100dvh] bg-background">
        <MobileBackHeader
          title={activeJob.client}
          onBack={goBack}
          titlePrefix={<Briefcase className="w-4 h-4 text-primary-foreground" />}
        />

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {activeJobMessages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <MessageCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No messages in the job chat yet
            </div>
          )}
          {activeJobMessages.map(msg => {
            const isMe = msg.sender_id === staff?.id;
            return (
              <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] px-3 py-2 rounded-2xl text-sm",
                  isMe
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : msg.sender_role === 'planner'
                      ? "bg-accent text-accent-foreground rounded-bl-md"
                      : "bg-muted text-foreground rounded-bl-md"
                )}>
                  {!isMe && (
                    <span className="text-[10px] font-bold block mb-0.5 opacity-70">
                      {msg.sender_name} {msg.sender_role === 'planner' && '(Planner)'}
                    </span>
                  )}
                  <p>{msg.content}</p>
                  <span className="text-[9px] opacity-50 block text-right mt-0.5">{formatTime(msg.created_at)}</span>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        <div className="shrink-0 p-3 border-t border-border bg-card safe-area-bottom shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm bg-muted rounded-xl px-3 py-2.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
              placeholder="Type a message..."
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendJobMsg()}
            />
            <button
              onClick={handleSendJobMsg}
              disabled={!newMsg.trim() || sending}
              className="p-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// === CONTACT PICKER COMPONENT ===
function ContactPicker({
  staff,
  dmConversations,
  onSelectContact,
  onBack,
}: {
  staff: any;
  dmConversations: DMConversation[];
  onSelectContact: (contact: { id: string; name: string; type: string }) => void;
  onBack: () => void;
}) {
  const [contacts, setContacts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    mobileApi.getContacts()
      .then(res => setContacts(res.contacts || []))
      .catch(() => toast.error('Could not fetch contacts'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen pb-24 bg-background">
      <MobileBackHeader title="New message" onBack={onBack} />

      <div className="px-3 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contact..."
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-muted rounded-xl border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No contacts found
          </div>
        ) : (
          filtered.map(c => {
            const hasConversation = dmConversations.some(d => d.partner_id === c.id);
            return (
              <button
                key={c.id}
                onClick={() => onSelectContact(c)}
                className="w-full text-left rounded-xl border border-border bg-card p-3 flex items-center gap-3 active:scale-[0.98] transition-all"
              >
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-accent-foreground">{c.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate block">{c.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {c.type === 'planner' ? 'Planner' : 'Staff'}
                    {hasConversation ? ' · Active chat' : ''}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MobileInbox;
