import { useEffect, useMemo, useRef } from 'react';
import { format, isToday, isYesterday, parseISO, differenceInMinutes, isSameDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import MessageBubble, { ChatMessage } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  myIds: Set<string>;
  /** Show sender name for non-me bubbles (group chats) */
  showSenderNames?: boolean;
  /** Optional per-message footer override (e.g. retry button). Return null to fall back to default. */
  renderFooter?: (m: ChatMessage) => React.ReactNode;
}

const dayLabel = (d: Date) => {
  if (isToday(d)) return 'Idag';
  if (isYesterday(d)) return 'Igår';
  return format(d, 'EEEE d MMMM', { locale: sv });
};

const timeLabel = (d: Date) =>
  isToday(d) ? format(d, 'HH:mm') : format(d, 'EEE HH:mm', { locale: sv });

export const MessageList = ({ messages, myIds, showSenderNames, renderFooter }: Props) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  const groups = useMemo(() => {
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return sorted;
  }, [messages]);

  // Find the index of the last own message — that one shows status
  const lastOwnIndex = useMemo(() => {
    for (let i = groups.length - 1; i >= 0; i--) {
      if (myIds.has(groups[i].sender_id)) return i;
    }
    return -1;
  }, [groups, myIds]);

  return (
    <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2 space-y-1">
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
