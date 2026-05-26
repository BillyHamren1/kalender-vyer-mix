import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileInbox } from '@/hooks/useMobileInbox';
import { MessageCircle, Radio, Briefcase, AlertTriangle, CloudRain, CalendarClock, Truck, Info, Plus, Search, Loader2, Archive, ArrowLeft, ChevronRight } from 'lucide-react';
import { MobileHeroHeader, MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { format, isToday, parseISO, differenceInDays } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import DmChatView from '@/components/mobile-app/messages/DmChatView';
import JobChatView from '@/components/mobile-app/messages/JobChatView';
import SwipeableRow from '@/components/mobile-app/messages/SwipeableRow';
import { ChatMessage } from '@/components/mobile-app/messages/MessageBubble';
import { useLanguage } from '@/i18n/LanguageContext';

type View = 'list' | 'dm' | 'job' | 'broadcast' | 'new';

interface DMConversation {
  partner_id: string;
  partner_name: string;
  last_message: any;
  unread_count: number;
  messages: ChatMessage[];
  archived?: boolean;
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
  info: Info, weather: CloudRain, schedule: CalendarClock, logistics: Truck, urgent: AlertTriangle,
};
const categoryTokens: Record<string, string> = {
  info: 'broadcast.info',
  weather: 'broadcast.weather',
  schedule: 'broadcast.schedule',
  logistics: 'broadcast.logistics',
  urgent: 'broadcast.urgent',
};

const MobileInbox = () => {
  const { staff } = useMobileAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale } = useLanguage();
  const dfLocale = locale === 'sv' ? sv : enUS;
  const formatTime = (ts: string) => {
    const d = parseISO(ts);
    return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM', { locale: dfLocale });
  };
  const labelForCategory = (cat: string) => {
    const tok = categoryTokens[cat];
    return tok ? t(tok as any) : t('inbox.message');
  };
  const { dmConversations, broadcasts, jobConversations, isLoading, markBroadcastReadOptimistic, markJobReadOptimistic, refetchAll } = useMobileInbox();
  const [view, setView] = useState<View>('list');
  const [activeDM, setActiveDM] = useState<DMConversation | null>(null);
  const [activeJob, setActiveJob] = useState<{ bookingId: string; client: string } | null>(null);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Deep-link: open a DM thread when navigated with state { openDmWith: { id, name } }.
  // Used by e.g. JobTeamTab's "message" button to jump straight into a chat.
  useEffect(() => {
    const target = (location.state as any)?.openDmWith as { id: string; name: string } | undefined;
    if (!target?.id) return;
    const existing = dmConversations.find(d => d.partner_id === target.id) as DMConversation | undefined;
    setActiveDM(existing || {
      partner_id: target.id,
      partner_name: target.name || t('inbox.staff'),
      last_message: null,
      unread_count: 0,
      messages: [],
    });
    setView('dm');
    // Clear state so back-nav doesn't reopen the chat
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, dmConversations, navigate, location.pathname]);

  // Sort + bucket DM conversations
  const { activeDMs, archivedDMs } = useMemo(() => {
    const active: DMConversation[] = [];
    const archived: DMConversation[] = [];
    for (const c of dmConversations) {
      (c.archived ? archived : active).push(c as DMConversation);
    }
    return { activeDMs: active, archivedDMs: archived };
  }, [dmConversations]);

  // Job chats are surfaced when:
  //   1) the booking is within ±7 days of today, OR
  //   2) the conversation has unread messages (so old jobs don't go silent).
  // Stale assignments without a date AND without unreads are hidden.
  const now = new Date();
  const activeJobs = jobConversations.filter(j => {
    if ((j.unreadCount || 0) > 0) return true;
    if (!j.lastDate) return false;
    const diff = Math.abs(differenceInDays(now, parseISO(j.lastDate)));
    return diff <= 7;
  });

  const totalUnread =
    activeDMs.reduce((s, c) => s + c.unread_count, 0) +
    broadcasts.filter(b => !b.is_read).length +
    activeJobs.reduce((s, j) => s + (j.unreadCount || 0), 0);

  const openDM = (conv: DMConversation) => { setActiveDM(conv); setView('dm'); };
  const openJob = (job: { bookingId: string; client: string; unreadCount?: number }) => {
    if (job.unreadCount && job.unreadCount > 0) {
      markJobReadOptimistic(job.bookingId);
      mobileApi.markJobRead(job.bookingId).catch(() => {});
    }
    setActiveJob({ bookingId: job.bookingId, client: job.client });
    setView('job');
  };

  const handleArchive = async (partnerId: string) => {
    try { await mobileApi.archiveDM(partnerId); toast.success(t('inbox.archived_one')); refetchAll(); }
    catch { toast.error(t('inbox.couldNotArchive')); }
  };
  const handleUnarchive = async (partnerId: string) => {
    try { await mobileApi.unarchiveDM(partnerId); refetchAll(); }
    catch { toast.error(t('inbox.couldNotRestore')); }
  };

  const goBack = () => { setView('list'); setActiveDM(null); setActiveJob(null); setActiveBroadcast(null); refetchAll(); };

  // === Active chat views ===
  if (view === 'dm' && activeDM) {
    return (
      <DmChatView
        partnerId={activeDM.partner_id}
        partnerName={activeDM.partner_name}
        initialMessages={activeDM.messages}
        onBack={goBack}
      />
    );
  }
  if (view === 'job' && activeJob) {
    return <JobChatView bookingId={activeJob.bookingId} client={activeJob.client} onBack={goBack} />;
  }
  if (view === 'new') {
    return <ContactPicker
      onBack={goBack}
      onPick={(c) => {
        const existing = dmConversations.find(d => d.partner_id === c.id) as DMConversation | undefined;
        openDM(existing || { partner_id: c.id, partner_name: c.name, last_message: null, unread_count: 0, messages: [] });
      }}
    />;
  }
  if (view === 'broadcast' && activeBroadcast) {
    const CatIcon = categoryIcons[activeBroadcast.category] || Info;
    return (
      <div className="flex flex-col bg-card min-h-full">
        <MobileBackHeader title={t('inbox.message')} onBack={goBack} titlePrefix={<Radio className="w-4 h-4 text-primary-foreground" />} />
        <div className="flex-1 p-4">
          <div className={cn("rounded-2xl border p-5", activeBroadcast.category === 'urgent' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card')}>
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className={cn("w-5 h-5", activeBroadcast.category === 'urgent' ? 'text-destructive' : 'text-primary')} />
              <span className="text-sm font-bold text-foreground">{labelForCategory(activeBroadcast.category)}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{activeBroadcast.content}</p>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('inbox.from')} {activeBroadcast.sender_name}</span>
              <span className="text-xs text-muted-foreground">{formatTime(activeBroadcast.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // === Inbox list ===
  return (
    <div className="flex flex-col bg-card min-h-full">
      <MobileHeroHeader
        eyebrow={t('inbox.eyebrow')}
        title={t('inbox.title')}
        subtitle={totalUnread > 0 ? `${totalUnread} ${t('inbox.unread')}` : t('inbox.noUnread')}
      />

      <div className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-5 pt-2">
            {/* Broadcasts */}
            {broadcasts.length > 0 && (
              <Section icon={<Radio className="w-3 h-3" />} title={t('inbox.broadcast')}>
                {broadcasts.map(b => {
                  const CatIcon = categoryIcons[b.category] || Info;
                  return (
                    <button
                      key={b.id}
                      onClick={() => { setActiveBroadcast(b); setView('broadcast'); if (!b.is_read) { markBroadcastReadOptimistic(b.id); mobileApi.markBroadcastRead(b.id).catch(() => {}); } }}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-muted/40 transition-colors border-b border-border/50"
                    >
                      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", b.category === 'urgent' ? 'bg-destructive/10' : 'bg-primary/10')}>
                        <CatIcon className={cn("w-5 h-5", b.category === 'urgent' ? 'text-destructive' : 'text-primary')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-[15px] truncate", b.is_read ? 'font-medium text-foreground' : 'font-semibold text-foreground')}>
                            {labelForCategory(b.category)}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(b.created_at)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{b.content}</p>
                      </div>
                      {!b.is_read && <div className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />}
                    </button>
                  );
                })}
              </Section>
            )}

            {/* DMs */}
            {activeDMs.length > 0 && (
              <Section title={t('inbox.directMessages')}>
                {activeDMs.map(conv => (
                  <SwipeableRow
                    key={conv.partner_id}
                    actions={[{ label: t('inbox.archive'), icon: <Archive className="w-4 h-4" />, variant: 'destructive', onAction: () => handleArchive(conv.partner_id) }]}
                  >
                    <ConversationRow
                      name={conv.partner_name}
                      preview={previewOf(conv.last_message, t)}
                      timestamp={conv.last_message?.created_at}
                      unread={conv.unread_count}
                      onClick={() => openDM(conv)}
                      formatTime={formatTime}
                    />
                  </SwipeableRow>
                ))}
              </Section>
            )}

            {/* Job chats */}
            {activeJobs.length > 0 && (
              <Section icon={<Briefcase className="w-3 h-3" />} title={t('inbox.jobChat')}>
                {activeJobs.map(job => (
                  <ConversationRow
                    key={job.bookingId}
                    name={job.client}
                    preview={job.lastMessage || t('inbox.openJobChat')}
                    timestamp={job.lastTime || undefined}
                    unread={job.unreadCount || 0}
                    avatarIcon={<Briefcase className="w-5 h-5 text-muted-foreground" />}
                    onClick={() => openJob({ bookingId: job.bookingId, client: job.client, unreadCount: job.unreadCount })}
                    formatTime={formatTime}
                  />
                ))}
              </Section>
            )}

            {/* Archived */}
            {archivedDMs.length > 0 && (
              <div>
                <button onClick={() => setShowArchived(s => !s)} className="w-full flex items-center gap-2 px-5 py-2 text-muted-foreground">
                  <Archive className="w-4 h-4" />
                  <span className="text-[13px] font-semibold">{t('inbox.archived', { count: archivedDMs.length })}</span>
                  <ChevronRight className={cn("w-4 h-4 ml-auto transition-transform", showArchived && "rotate-90")} />
                </button>
                {showArchived && (
                  <div>
                    {archivedDMs.map(conv => (
                      <SwipeableRow
                        key={conv.partner_id}
                        actions={[{ label: t('inbox.restore'), icon: <ArrowLeft className="w-4 h-4" />, onAction: () => handleUnarchive(conv.partner_id) }]}
                      >
                        <ConversationRow
                          name={conv.partner_name}
                          preview={previewOf(conv.last_message, t)}
                          timestamp={conv.last_message?.created_at}
                          unread={0}
                          onClick={() => openDM(conv)}
                          dim
                          formatTime={formatTime}
                        />
                      </SwipeableRow>
                    ))}
                  </div>
                )}
              </div>
            )}

            {broadcasts.length === 0 && dmConversations.length === 0 && jobConversations.length === 0 && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                <MessageCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
                {t('inbox.noMessages')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setView('new')}
        className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform"
        style={{ boxShadow: '0 8px 24px hsl(184 60% 26% / 0.30), 0 2px 6px hsl(184 60% 26% / 0.20)' }}
        aria-label={t('inbox.newMessage')}
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </button>

    </div>
  );
};

const previewOf = (m: any, t: (k: any) => string): string => {
  if (!m) return '';
  if (m.file_url && (m.file_type?.startsWith('image/'))) return `📷 ${t('msg.image' as any)}`;
  if (m.file_url) return `📎 ${m.file_name || t('msg.attachment' as any)}`;
  return m.content || '';
};

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <h2 className="px-5 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5">
      {icon}{title}
    </h2>
    <div className="bg-card">{children}</div>
  </div>
);

interface RowProps {
  name: string;
  preview: string;
  timestamp?: string;
  unread?: number;
  avatarIcon?: React.ReactNode;
  onClick: () => void;
  dim?: boolean;
  formatTime: (ts: string) => string;
}

const ConversationRow = ({ name, preview, timestamp, unread = 0, avatarIcon, onClick, dim, formatTime }: RowProps) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full text-left px-4 py-3 flex items-center gap-3 active:bg-muted/40 transition-colors",
      "border-b border-border/40 last:border-b-0",
      dim && "opacity-60"
    )}
  >
    <div className={cn(
      "w-11 h-11 rounded-full flex items-center justify-center shrink-0 border",
      avatarIcon ? "bg-muted/60 border-border/40" : "bg-primary-soft border-primary/15"
    )}>
      {avatarIcon || <span className="text-[15px] font-bold text-primary">{name.charAt(0).toUpperCase()}</span>}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[15px] truncate tracking-tight", unread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground")}>{name}</span>
        <span className={cn("text-[11px] shrink-0 tabular-nums", unread > 0 ? "text-primary font-semibold" : "text-muted-foreground")}>
          {timestamp ? formatTime(timestamp) : ''}
        </span>
      </div>
      <p className={cn("text-[13px] truncate mt-0.5", unread > 0 ? "text-foreground/90" : "text-muted-foreground")}>{preview}</p>
    </div>
    {unread > 0 && (
      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
        {unread}
      </span>
    )}
  </button>
);


// Contact picker
function ContactPicker({ onBack, onPick }: { onBack: () => void; onPick: (c: { id: string; name: string }) => void }) {
  const { t } = useLanguage();
  const [contacts, setContacts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    mobileApi.getContacts()
      .then(res => setContacts(res.contacts || []))
      .catch(() => toast.error(t('inbox.couldNotFetchContacts')))
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col bg-card min-h-full">
      <MobileBackHeader title={t('inbox.newMessage')} onBack={onBack} />
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('inbox.searchContact')}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-muted rounded-xl border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 bg-card">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">{t('inbox.noContactsShort')}</div>
        ) : (
          filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-muted/40 transition-colors border-b border-border/50"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <span className="text-sm font-semibold text-muted-foreground">{c.name.charAt(0).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-semibold text-foreground truncate block">{c.name}</span>
                <span className="text-[11px] text-muted-foreground">{c.type === 'planner' ? t('inbox.planner') : t('inbox.staff')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default MobileInbox;
