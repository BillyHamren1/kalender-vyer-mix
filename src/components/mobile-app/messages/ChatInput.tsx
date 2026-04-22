import { useRef, useState } from 'react';
import { Plus, ArrowUp, Camera, X, Loader2, RotateCw, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useChatUpload } from './useChatUpload';
import { CHAT_UPLOAD_ACCEPT_ATTR } from '@/lib/chat/uploadPolicy';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  onSend: (data: { content: string; file_url?: string; file_name?: string; file_type?: string }) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
}

export const ChatInput = ({ onSend, placeholder, disabled }: Props) => {
  const { t } = useLanguage();
  const ph = placeholder ?? t('msg.placeholderImessage');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { pending, uploadFile, cancel, retry, consume } = useChatUpload();

  const autosize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    try {
      await uploadFile(file);
    } catch (e: any) {
      toast.error(e?.message || t('msg.couldNotUpload'));
    }
  };

  const isUploading = pending?.status === 'uploading';
  const isFailed = pending?.status === 'failed';
  const isReady = pending?.status === 'ready';

  const send = async () => {
    if (sending || isUploading) return;
    if (isFailed) {
      toast.error(t('msg.attachmentFailed'));
      return;
    }
    const trimmed = text.trim();
    if (!trimmed && !isReady) return;
    setSending(true);
    try {
      await onSend({
        content: trimmed,
        file_url: isReady ? pending!.url : undefined,
        file_name: isReady ? pending!.name : undefined,
        file_type: isReady ? pending!.type : undefined,
      });
      setText('');
      consume();
      requestAnimationFrame(autosize);
    } finally {
      setSending(false);
    }
  };

  const canSend = !sending && !isUploading && (text.trim().length > 0 || isReady);

  return (
    <div
      className="shrink-0 border-t border-border/60 bg-card"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {pending && (
        <div className="px-3 pt-2">
          <div className="flex items-start gap-2">
            <div className="relative rounded-xl overflow-hidden border border-border bg-muted shrink-0">
              {pending.preview ? (
                <img src={pending.preview} alt="" className="w-14 h-14 object-cover" />
              ) : (
                <div className="w-14 h-14 flex items-center justify-center text-muted-foreground">
                  <FileText className="w-5 h-5" />
                </div>
              )}

              {/* Dim + spinner overlay while uploading */}
              {isUploading && (
                <div className="absolute inset-0 bg-background/55 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-foreground" />
                </div>
              )}
              {/* Error overlay */}
              {isFailed && (
                <div className="absolute inset-0 bg-destructive/25 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                </div>
              )}

              <button
                onClick={cancel}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
                aria-label={t('msg.removeAttachment')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-[12px] truncate text-foreground">{pending.name}</p>
              {isUploading && (
                <div className="mt-1 h-1 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-200"
                    style={{ width: `${pending.progress}%` }}
                  />
                </div>
              )}
              {isUploading && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{t('msg.uploading', { pct: pending.progress })}</p>
              )}
              {isFailed && (
                <button
                  onClick={retry}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive hover:underline"
                >
                  <RotateCw className="w-3 h-3" />
                  {pending.error || t('msg.failed')} {t('msg.retrySuffix')}
                </button>
              )}
              {isReady && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{t('msg.readyToSend')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-2.5 py-2 flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept={CHAT_UPLOAD_ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading || disabled}
          className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          aria-label={t('msg.attachFile')}
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={isUploading || disabled}
          className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          aria-label={t('msg.takePhoto')}
        >
          <Camera className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-end bg-muted rounded-2xl border border-border/60 px-3 py-1">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => { setText(e.target.value); autosize(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={ph}
            disabled={disabled}
            className="flex-1 resize-none bg-transparent text-[15px] leading-snug py-1.5 outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <button
          onClick={send}
          disabled={!canSend || disabled}
          className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95',
            canSend ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground/50'
          )}
          aria-label={t('msg.send')}
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
