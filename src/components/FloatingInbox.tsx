import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, ArrowLeft, Search } from 'lucide-react';
import { useMyIdentity } from '@/hooks/useMyIdentity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchDMInboxGrouped, GroupedConversation } from '@/services/directMessageService';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';
import OpsDirectChat from '@/components/ops-control/OpsDirectChat';

const FloatingInbox = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { allIds } = useMyIdentity();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const { data: conversations = [] } = useQuery({
    queryKey: ['dm-inbox-grouped', ...allIds],
    queryFn: () => fetchDMInboxGrouped(allIds),
    // Always enabled when we know who the user is — otherwise the badge
    // can't reflect unread until the panel has been opened at least once.
    // The realtime channel below invalidates this query on new INSERTs
    // so polling stays infrequent.
    enabled: allIds.length > 0,
    refetchInterval: isOpen ? 10_000 : 60_000,
  });

  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  // Realtime badge update — always-on (so the badge reacts even when panel is closed).
  useEffect(() => {
    if (allIds.length === 0) return;
    const channel = supabase
      .channel('floating-inbox-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dm-inbox-grouped', ...allIds] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, () => {
        // Read-receipt UPDATEs (is_read flip) need to refresh unread count too.
        queryClient.invalidateQueries({ queryKey: ['dm-inbox-grouped', ...allIds] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allIds, queryClient]);

  // Load staff for new message
  useEffect(() => {
    if (!showNewMsg) return;
    supabase.from('staff_members' as any).select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => setStaffList((data as any[]) || []));
  }, [showNewMsg]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedStaff(null);
        setShowNewMsg(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  if (isMobile) return null;

  const filteredStaff = search
    ? staffList.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : staffList;

  return (
    <div ref={panelRef} className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {isOpen && (
        <div className="w-[380px] h-[520px] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          {selectedStaff ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
                <button
                  onClick={() => setSelectedStaff(null)}
                  className="p-1 rounded hover:bg-accent transition-colors"
                >
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="font-medium text-sm truncate">{selectedStaff.name}</span>
              </div>
              <div className="flex-1 min-h-0">
                <OpsDirectChat
                  staffId={selectedStaff.id}
                  staffName={selectedStaff.name}
                  onClose={() => setSelectedStaff(null)}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-semibold text-sm">Meddelanden</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowNewMsg(!showNewMsg)}
                    className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Nytt meddelande
                  </button>
                  <button
                    onClick={() => { setIsOpen(false); setShowNewMsg(false); }}
                    className="p-1 rounded hover:bg-accent transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* New message staff picker */}
              {showNewMsg && (
                <div className="border-b border-border p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Sök personal..."
                      className="w-full pl-7 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {filteredStaff.map(s => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSelectedStaff({ id: s.id, name: s.name });
                          setShowNewMsg(false);
                          setSearch('');
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                      >
                        {s.name}
                      </button>
                    ))}
                    {filteredStaff.length === 0 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">Ingen personal hittad</p>
                    )}
                  </div>
                </div>
              )}

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">Inga konversationer</p>
                  </div>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.recipientId}
                      onClick={() => setSelectedStaff({ id: conv.recipientId, name: conv.recipientName })}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left border-b border-border/50 last:border-0"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                        {conv.recipientName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>
                            {conv.recipientName}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                            {formatDistanceToNow(new Date(conv.lastTimestamp), { addSuffix: false, locale: sv })}
                          </span>
                        </div>
                        <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                          {conv.isSentByMe ? 'Du: ' : ''}{conv.lastMessage}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="mt-1 shrink-0 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold px-1.5">
                          {conv.unreadCount}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) { setSelectedStaff(null); setShowNewMsg(false); }
        }}
        className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:bg-primary/90 active:scale-95 transition-all duration-200 flex items-center justify-center relative"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
        {!isOpen && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold px-1 animate-in zoom-in duration-200">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
};

export default FloatingInbox;
