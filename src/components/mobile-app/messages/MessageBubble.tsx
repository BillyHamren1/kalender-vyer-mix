import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Check, CheckCheck, FileText } from 'lucide-react';

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_role?: string;
  content: string;
  created_at: string;
  delivered_at?: string | null;
  read_at?: string | null;
  is_read?: boolean;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
}

interface Props {
  message: ChatMessage;
  isMe: boolean;
  /** Show sender name above bubble (e.g. group chats) */
  showSenderName?: boolean;
  /** Render the iMessage tail on the bottom of this bubble */
  hasTail: boolean;
  /** Show "Levererat"/"Läst" footer (only on last own message of a streak) */
  showStatus: boolean;
  /** When non-null, replaces the default delivered/read footer (e.g. retry button) */
  footerOverride?: ReactNode;
}

const isImage = (m: ChatMessage) =>
  !!m.file_url && (m.file_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(m.file_url || ''));

export const MessageBubble = ({ message: msg, isMe, showSenderName, hasTail, showStatus, footerOverride }: Props) => {
  const image = isImage(msg);

  return (
    <div className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex flex-col max-w-[78%]', isMe ? 'items-end' : 'items-start')}>
        {showSenderName && !isMe && (
          <span className="text-[11px] text-muted-foreground/80 font-medium ml-3 mb-0.5">
            {msg.sender_name}
          </span>
        )}

        {image ? (
          <a
            href={msg.file_url!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'overflow-hidden rounded-[20px] shadow-sm',
              hasTail && (isMe ? 'rounded-br-md' : 'rounded-bl-md')
            )}
          >
            <img
              src={msg.file_url!}
              alt={msg.file_name || 'image'}
              className="max-h-72 w-auto block object-cover"
              loading="lazy"
            />
          </a>
        ) : msg.file_url ? (
          <a
            href={msg.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-2 px-3.5 py-2.5 rounded-[20px] text-sm leading-snug shadow-sm',
              isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              hasTail && (isMe ? 'rounded-br-md' : 'rounded-bl-md')
            )}
          >
            <FileText className="w-4 h-4 shrink-0 opacity-80" />
            <span className="truncate">{msg.file_name || 'Bifogad fil'}</span>
          </a>
        ) : (
          <div
            className={cn(
              'px-3.5 py-2 rounded-[20px] text-[15px] leading-snug shadow-sm whitespace-pre-wrap break-words',
              isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              hasTail && (isMe ? 'rounded-br-md' : 'rounded-bl-md')
            )}
          >
            {msg.content}
          </div>
        )}

        {footerOverride !== undefined && footerOverride !== null ? (
          footerOverride
        ) : showStatus && isMe ? (
          <div className="flex items-center gap-1 mt-1 mr-1.5 text-[10px] text-muted-foreground/80">
            {msg.read_at ? (
              <>
                <CheckCheck className="w-3 h-3" />
                <span>Läst {format(parseISO(msg.read_at), 'HH:mm')}</span>
              </>
            ) : msg.delivered_at ? (
              <>
                <Check className="w-3 h-3" />
                <span>Levererat</span>
              </>
            ) : (
              <span className="opacity-60">Skickar…</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default MessageBubble;
