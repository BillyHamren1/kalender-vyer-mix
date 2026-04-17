import { useEffect, useState, useMemo } from 'react';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { mobileApi } from '@/services/mobileApiService';
import { useMobileInbox } from '@/hooks/useMobileInbox';
import { MessageCircle, Radio, Briefcase, AlertTriangle, CloudRain, CalendarClock, Truck, Info, Plus, Search, Loader2, Archive, ArrowLeft, ChevronRight } from 'lucide-react';
import { MobileHeroHeader, MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { format, isToday, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import DmChatView from '@/components/mobile-app/messages/DmChatView';
import JobChatView from '@/components/mobile-app/messages/JobChatView';
import SwipeableRow from '@/components/mobile-app/messages/SwipeableRow';
import { ChatMessage } from '@/components/mobile-app/messages/MessageBubble';

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
const categoryLabels: Record<string, string> = {
  info: 'Information', weather: 'Vädervarning', schedule: 'Schemaändring', logistics: 'Logistik', urgent: 'Brådskande',
};

const formatTime = (ts: string) => {
  const d = parseISO(ts);
  return isToday(d) ? format(d, 'HH:mm') : format(d, 'd MMM');
};

const MobileInbox = () => {
  const { staff } = useMobileAuth();
  const { dmConversations, broadcasts, jobConversations, isLoading, markBroadcastReadOptimistic, markJobReadOptimistic, refetchAll } = useMobileInbox();
  const [view, setView] = useState<View>('list');
  const [activeDM, setActiveDM] = useState<DMConversation | null>(null);
  const [activeJob, setActiveJob] = useState<{ bookingId: string; client: string } | null>(null);
  const [activeBroadcast, setActiveBroadcast] = useState<BroadcastItem | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Sort + bucket DM conversations
  const { activeDMs, archivedDMs } = useMemo(() => {
    const active: DMConversation[] = [];
    const archived: DMConversation[] = [];
    for (const c of dmConversations) {
      (c.archived ? archived : active).push(c as DMConversation);
    }
    return { activeDMs: active, archivedDMs: archived };
  }, [dmConversations]);

  // Only show job chats the user is actively assigned to AND that are within ±7 days of today.
  // Jobs without a lastDate are excluded — they're stale assignments with no scheduled work.
  const now = new Date();
  const activeJobs = jobConversations.filter(j => {
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

  const openDM = (conv: DMConversation) => { setActiveDM(conv); setView('dm'); };
  const handleArchive = async (partnerId: string) => {
    try { await mobileApi.archiveDM(partnerId); toast.success('Arkiverat'); refetchAll(); }
    catch { toast.error('Kunde inte arkivera'); }
  };
  const handleUnarchive = async (partnerId: string) => {
    try { await mobileApi.unarchiveDM(partnerId); refetchAll(); }
    catch { toast.error('Kunde inte återställa'); }
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
        <MobileBackHeader title="Meddelande" onBack={goBack} titlePrefix={<Radio className="w-4 h-4 text-primary-foreground" />} />
        <div className="flex-1 p-4">
          <div className={cn("rounded-2xl border p-5", activeBroadcast.category === 'urgent' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card')}>
            <div className="flex items-center gap-2 mb-3">
              <CatIcon className={cn("w-5 h-5", activeBroadcast.category === 'urgent' ? 'text-destructive' : 'text-primary')} />
              <span className="text-sm font-bold text-foreground">{categoryLabels[activeBroadcast.category] || 'Meddelande'}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{activeBroadcast.content}</p>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Från {activeBroadcast.sender_name}</span>
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
        eyebrow="MEDDELANDEN"
        title="Inkorg"
        subtitle={totalUnread > 0 ? `${totalUnread} olästa` : 'Inga olästa'}
      />

      <div className="flex-1">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-5 pt-2">
            {/* Broadcasts */}
            {broadcasts.length > 0 && (
              <Section icon={<Radio className="w-3 h-3" />} title="Broadcast">
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
                            {categoryLabels[b.category] || 'Broadcast'}
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
              <Section title="Direktmeddelanden">
                {activeDMs.map(conv => (
                  <SwipeableRow
                    key={conv.partner_id}
                    actions={[{ label: 'Arkivera', icon: <Archive className="w-4 h-4" />, variant: 'destructive', onAction: () => handleArchive(conv.partner_id) }]}
                  >
                    <ConversationRow
                      name={conv.partner_name}
                      preview={previewOf(conv.last_message)}
                      timestamp={conv.last_message?.created_at}
                      unread={conv.unread_count}
                      onClick={() => openDM(conv)}
                    />
                  </SwipeableRow>
                ))}
              </Section>
            )}

            {/* Job chats */}
            {activeJobs.length > 0 && (
              <Section icon={<Briefcase className="w-3 h-3" />} title="Jobbchatt">
                {activeJobs.map(job => (
                  <ConversationRow
                    key={job.bookingId}
                    name={job.client}
                    preview={job.lastMessage || 'Öppna jobbchatten'}
                    timestamp={job.lastTime || undefined}
                    unread={job.unreadCount || 0}
                    avatarIcon={<Briefcase className="w-5 h-5 text-muted-foreground" />}
                    onClick={() => openJob({ bookingId: job.bookingId, client: job.client, unreadCount: job.unreadCount })}
                  />
                ))}
              </Section>
            )}

            {/* Archived */}
            {archivedDMs.length > 0 && (
              <div>
                <button onClick={() => setShowArchived(s => !s)} className="w-full flex items-center gap-2 px-5 py-2 text-muted-foreground">
                  <Archive className="w-4 h-4" />
                  <span className="text-[13px] font-semibold">Arkiverade ({archivedDMs.length})</span>
                  <ChevronRight className={cn("w-4 h-4 ml-auto transition-transform", showArchived && "rotate-90")} />
                </button>
                {showArchived && (
                  <div>
                    {archivedDMs.map(conv => (
                      <SwipeableRow
                        key={conv.partner_id}
                        actions={[{ label: 'Återställ', icon: <ArrowLeft className="w-4 h-4" />, onAction: () => handleUnarchive(conv.partner_id) }]}
                      >
                        <ConversationRow
                          name={conv.partner_name}
                          preview={previewOf(conv.last_message)}
                          timestamp={conv.last_message?.created_at}
                          unread={0}
                          onClick={() => openDM(conv)}
                          dim
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
                Inga meddelanden ännu
              </div>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setView('new')}
        className="fixed bottom-28 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Nytt meddelande"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

const previewOf = (m: any): string => {
  if (!m) return '';
  if (m.file_url && (m.file_type?.startsWith('image/'))) return '📷 Bild';
  if (m.file_url) return `📎 ${m.file_name || 'Bilaga'}`;
  return m.content || '';
};

const Section = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <h2 className="px-5 mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
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
}

const ConversationRow = ({ name, preview, timestamp, unread = 0, avatarIcon, onClick, dim }: RowProps) => (
  <button
    onClick={onClick}
    className={cn("w-full text-left px-4 py-3 flex items-center gap-3 active:bg-muted/40 transition-colors border-b border-border/50", dim && "opacity-60")}
  >
    <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
      {avatarIcon || <span className="text-base font-semibold text-muted-foreground">{name.charAt(0).toUpperCase()}</span>}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[15px] truncate", unread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground")}>{name}</span>
        <span className={cn("text-[11px] shrink-0", unread > 0 ? "text-primary font-semibold" : "text-muted-foreground")}>
          {timestamp ? formatTime(timestamp) : ''}
        </span>
      </div>
      <p className={cn("text-sm truncate mt-0.5", unread > 0 ? "text-foreground" : "text-muted-foreground")}>{preview}</p>
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
  const [contacts, setContacts] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    mobileApi.getContacts()
      .then(res => setContacts(res.contacts || []))
      .catch(() => toast.error('Kunde inte hämta kontakter'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col bg-card min-h-full">
      <MobileBackHeader title="Nytt meddelande" onBack={onBack} />
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök kontakt"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-muted rounded-xl border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 bg-card">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Inga kontakter</div>
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
                <span className="text-[11px] text-muted-foreground">{c.type === 'planner' ? 'Planerare' : 'Personal'}</span>
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
