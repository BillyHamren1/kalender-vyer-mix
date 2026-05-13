import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Check, CheckCheck, FileText, Download } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import { useLanguage } from '@/i18n/LanguageContext';
import { openFileExternally } from '@/lib/files/openFileExternally';

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
  const { t } = useLanguage();
  const image = isImage(msg);
  const [lightbox, setLightbox] = useState(false);

  return (
    <div className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex flex-col max-w-[78%]', isMe ? 'items-end' : 'items-start')}>
        {showSenderName && !isMe && (
          <span className="text-[11px] text-muted-foreground/80 font-medium ml-3 mb-0.5">
            {msg.sender_name}
          </span>
        )}

        {image ? (
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className={cn(
              'overflow-hidden rounded-[20px] shadow-sm active:opacity-90 transition-opacity',
              hasTail && (isMe ? 'rounded-br-md' : 'rounded-bl-md')
            )}
            aria-label={t('msg.openImage')}
          >
            <img
              src={msg.file_url!}
              alt={msg.file_name || 'image'}
              className="max-h-72 w-auto block object-cover"
              loading="lazy"
              draggable={false}
            />
          </button>
        ) : msg.file_url ? (
          <button
            type="button"
            onClick={() => openFileExternally(msg.file_url!, msg.file_name || undefined)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2.5 rounded-[20px] text-sm leading-snug shadow-sm group text-left',
              isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              hasTail && (isMe ? 'rounded-br-md' : 'rounded-bl-md')
            )}
          >
            <FileText className="w-4 h-4 shrink-0 opacity-80" />
            <span className="truncate flex-1 min-w-0">{msg.file_name || t('msg.attachedFile')}</span>
            <Download className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
          </button>
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

        {/* Caption text under an image, when sent together */}
        {image && msg.content && msg.content !== `📎 ${msg.file_name}` && msg.content !== '📎' && (
          <div
            className={cn(
              'mt-1 px-3 py-1.5 rounded-2xl text-[14px] leading-snug shadow-sm whitespace-pre-wrap break-words',
              isMe ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
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
                <span>{t('msg.read', { time: format(parseISO(msg.read_at), 'HH:mm') })}</span>
              </>
            ) : msg.delivered_at ? (
              <>
                <Check className="w-3 h-3" />
                <span>{t('msg.delivered')}</span>
              </>
            ) : (
              <span className="opacity-60">{t('msg.sending')}</span>
            )}
          </div>
        ) : null}
      </div>

      {lightbox && image && (
        <ImageLightbox url={msg.file_url!} name={msg.file_name} onClose={() => setLightbox(false)} />
      )}
    </div>
  );
};

export default MessageBubble;
