import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { format, isToday, isYesterday, parseISO, differenceInMinutes, isSameDay } from 'date-fns';
import { sv, enUS } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import MessageBubble, { ChatMessage } from './MessageBubble';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  messages: ChatMessage[];
  myIds: Set<string>;
  /** Show sender name for non-me bubbles (group chats) */
  showSenderNames?: boolean;
  /** Optional per-message footer override (e.g. retry button). Return null to fall back to default. */
  renderFooter?: (m: ChatMessage) => ReactNode;
  /** Pagination hooks — when present the list shows pull-to-load-older and preserves scroll position. */
  hasMore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
}

const makeDayLabel = (locale: 'sv' | 'en', tToday: string, tYesterday: string) => (d: Date) => {
  if (isToday(d)) return tToday;
  if (isYesterday(d)) return tYesterday;
  return format(d, 'EEEE d MMMM', { locale: locale === 'en' ? enUS : sv });
};

const makeTimeLabel = (locale: 'sv' | 'en') => (d: Date) =>
  isToday(d) ? format(d, 'HH:mm') : format(d, 'EEE HH:mm', { locale: locale === 'en' ? enUS : sv });

export const MessageList = ({
  messages,
  myIds,
  showSenderNames,
  renderFooter,
  hasMore,
  loadingOlder,
  onLoadOlder,
}: Props) => {
  const { t, locale } = useLanguage();
  const dayLabel = makeDayLabel(locale, t('msg.day.today'), t('msg.day.yesterday'));
  const timeLabel = makeTimeLabel(locale);
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Tracks the topmost message id between renders so we can detect a "prepend"
  // (load-older) and restore scroll position relative to the previous top.
  const prevTopIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  // Avoid auto-scrolling to bottom after a load-older operation.
  const skipAutoScrollRef = useRef(false);

  const groups = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messages]);

  // Detect prepend: snapshot scrollHeight BEFORE paint when top id changed.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const newTopId = groups[0]?.id ?? null;
    const prevTopId = prevTopIdRef.current;

    if (prevTopId && newTopId && prevTopId !== newTopId) {
      // Older messages were prepended → restore scroll offset relative to top.
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        el.scrollTop = el.scrollTop + delta;
        skipAutoScrollRef.current = true;
      }
    }

    prevTopIdRef.current = newTopId;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [groups]);

  // Auto-scroll to bottom for fresh appends. Skip exactly once after a prepend.
  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [groups.length]);

  // Pull-to-load-older: trigger when scrolled near the top.
  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    if (!onLoadOlder || !hasMore || loadingOlder) return;
    if (e.currentTarget.scrollTop < 80) {
      onLoadOlder();
    }
  };

  // Find the index of the last own message — that one shows status
  const lastOwnIndex = useMemo(() => {
    for (let i = groups.length - 1; i >= 0; i--) {
      if (myIds.has(groups[i].sender_id)) return i;
    }
    return -1;
  }, [groups, myIds]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-3 pt-3 pb-2 space-y-1"
    >
      {hasMore && (
        <div className="flex justify-center py-2">
          {loadingOlder ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : onLoadOlder ? (
            <button
              onClick={onLoadOlder}
              className="text-[11px] text-primary hover:underline active:opacity-70"
            >
              {t('msg.viewOlder')}
            </button>
          ) : null}
        </div>
      )}

      {groups.map((m, i) => {
        const prev = groups[i - 1];
        const next = groups[i + 1];
        const date = parseISO(m.created_at);
        const isMe = myIds.has(m.sender_id);
        const showDay = !prev || !isSameDay(parseISO(prev.created_at), date);
        const showTime = !prev ||
          differenceInMinutes(date, parseISO(prev.created_at)) > 10 ||
          (prev.sender_id !== m.sender_id);
        const sameSenderAsPrev = !!prev && prev.sender_id === m.sender_id && !showTime && !showDay;
        const sameSenderAsNext = !!next && next.sender_id === m.sender_id &&
          differenceInMinutes(parseISO(next.created_at), date) <= 10 &&
          isSameDay(parseISO(next.created_at), date);
        const hasTail = !sameSenderAsNext;
        const showSenderName = !!showSenderNames && !isMe && !sameSenderAsPrev;

        return (
          <div key={m.id}>
            {showDay && (
              <div className="flex justify-center my-3">
                <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide">
                  {dayLabel(date)} · {format(date, 'HH:mm')}
                </span>
              </div>
            )}
            {!showDay && showTime && (
              <div className="flex justify-center my-2">
                <span className="text-[10px] text-muted-foreground/70">{timeLabel(date)}</span>
              </div>
            )}
            <MessageBubble
              message={m}
              isMe={isMe}
              hasTail={hasTail}
              showStatus={i === lastOwnIndex}
              showSenderName={showSenderName}
              footerOverride={renderFooter ? renderFooter(m) : null}
            />
            {sameSenderAsNext && <div className="h-0.5" />}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
};

export default MessageList;
