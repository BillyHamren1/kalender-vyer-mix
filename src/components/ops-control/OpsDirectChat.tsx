import { useState, useRef, useEffect, useCallback } from 'react';
import { useDirectMessages } from '@/hooks/useDirectMessages';
import { sendDirectMessage, uploadDMFile, markDirectMessagesRead } from '@/services/directMessageService';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, isToday } from 'date-fns';
import { Send, X, MessageCircle, Zap, Paperclip, Image, FileText, Tag, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { OpsTimelineAssignment } from '@/services/opsControlService';

const QUICK_MESSAGES = [
  'Försenad?',
  'Bekräfta ankomst',
  'Ring mig',
  'Uppdatera ETA',
  'Allt ok?',
  'Behöver hjälp?',
];

interface Props {
  staffId: string;
  staffName: string;
  onClose: () => void;
  staffAssignments?: OpsTimelineAssignment[];
}

const isImageType = (type: string) => type.startsWith('image/');

const OpsDirectChat = ({ staffId, staffName, onClose, staffAssignments = [] }: Props) => {
  const { user } = useAuth();
  const myId = user?.id || 'admin';
  const myName = user?.email?.split('@')[0] || 'Admin';
  const { messages, isLoading } = useDirectMessages(myId, staffId);
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File; previewUrl?: string } | null>(null);
  const [taggedBooking, setTaggedBooking] = useState<OpsTimelineAssignment | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mark as read on open
  useEffect(() => {
    if (myId && staffId) {
      markDirectMessagesRead(myId, staffId);
    }
  }, [myId, staffId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Max filstorlek: 10 MB');
      return;
    }
    const previewUrl = isImageType(file.type) ? URL.createObjectURL(file) : undefined;
    setPendingFile({ file, previewUrl });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearPendingFile = useCallback(() => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  }, [pendingFile]);

  const handleSend = async () => {
    if ((!msg.trim() && !pendingFile) || sending || uploading) return;
    setSending(true);

    try {
      let fileData: { fileUrl: string; fileName: string; fileType: string } | undefined;

      if (pendingFile) {
        setUploading(true);
        const uploaded = await uploadDMFile(pendingFile.file, myId);
        fileData = { fileUrl: uploaded.url, fileName: uploaded.fileName, fileType: uploaded.fileType };
        setUploading(false);
      }

      await sendDirectMessage(myId, myName, 'planner', staffId, staffName, msg || (pendingFile ? `📎 ${pendingFile.file.name}` : ''), {
        ...fileData,
        bookingId: taggedBooking?.bookingId,
      });

      setMsg('');
      clearPendingFile();
      setTaggedBooking(null);
      queryClient.invalidateQueries({ queryKey: ['direct-messages'] });
    } catch {
      toast.error('Kunde inte skicka meddelande');
    } finally {
      setSending(false);
      setUploading(false);
    }
  };

  const handleQuickSend = async (qm: string) => {
    setSending(true);
    try {
      await sendDirectMessage(myId, myName, 'planner', staffId, staffName, qm, {
        bookingId: taggedBooking?.bookingId,
      });
      queryClient.invalidateQueries({ queryKey: ['direct-messages'] });
    } catch {
      toast.error('Kunde inte skicka meddelande');
    } finally {
      setSending(false);
    }
  };

  const renderFilePreview = (m: { file_url?: string | null; file_name?: string | null; file_type?: string | null }, isOwn: boolean) => {
    if (!m.file_url) return null;
    const fType = m.file_type || '';
    if (isImageType(fType)) {
      return (
        <a href={m.file_url} target="_blank" rel="noopener noreferrer" className="block mt-1">
          <img
            src={m.file_url}
            alt={m.file_name || 'bild'}
            className="max-w-full max-h-40 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
          />
        </a>
      );
    }
    return (
      <a
        href={m.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1 mt-1 text-[10px] underline ${isOwn ? 'text-primary-foreground/80' : 'text-primary'}`}
      >
        <FileText className="w-3 h-3" />
        {m.file_name || 'Fil'}
      </a>
    );
  };

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-foreground truncate block">{staffName}</span>
            <span className="text-[10px] text-muted-foreground">Direktmeddelande</span>
          </div>
        </div>
        <button className="p-1 rounded text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <div className="text-xs text-muted-foreground">Ingen konversation ännu</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">Skriv ett meddelande till {staffName}</div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isOwn = m.sender_id === myId;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showSender = !prevMsg || prevMsg.sender_id !== m.sender_id;

            return (
              <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%]">
                  {showSender && !isOwn && (
                    <div className="text-[9px] font-semibold text-muted-foreground mb-0.5">
                      {m.sender_name}
                    </div>
                  )}
                  <div className={`px-2.5 py-1.5 rounded-lg text-[11px] leading-relaxed ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {m.booking_id && (
                      <div className={`text-[9px] font-medium mb-0.5 flex items-center gap-0.5 ${isOwn ? 'text-primary-foreground/70' : 'text-primary'}`}>
                        <Tag className="w-2.5 h-2.5" />
                        Jobb #{m.booking_id.slice(0, 6)}
                      </div>
                    )}
                    {m.content}
                    {renderFilePreview(m, isOwn)}
                    <span className={`text-[8px] ml-1.5 ${isOwn ? 'opacity-60' : 'text-muted-foreground'}`}>
                      {isToday(new Date(m.created_at))
                        ? format(new Date(m.created_at), 'HH:mm')
                        : format(new Date(m.created_at), 'd/M HH:mm')
                      }
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Job tag + file preview bar */}
      {(taggedBooking || pendingFile) && (
        <div className="shrink-0 border-t border-border px-3 py-1.5 space-y-1">
          {taggedBooking && (
            <div className="flex items-center gap-1 text-[10px] bg-primary/10 text-primary rounded px-2 py-0.5">
              <Tag className="w-2.5 h-2.5" />
              <span className="truncate flex-1">
                {taggedBooking.client} {taggedBooking.bookingNumber ? `#${taggedBooking.bookingNumber}` : ''}
              </span>
              <button onClick={() => setTaggedBooking(null)} className="hover:text-destructive">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="flex items-center gap-1.5">
              {pendingFile.previewUrl ? (
                <img src={pendingFile.previewUrl} className="w-10 h-10 rounded object-cover border border-border" alt="" />
              ) : (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center border border-border">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <span className="text-[10px] text-foreground truncate flex-1">{pendingFile.file.name}</span>
              <button onClick={clearPendingFile} className="text-muted-foreground hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Job picker dropdown */}
      {showJobPicker && staffAssignments.length > 0 && (
        <div className="shrink-0 border-t border-border px-3 py-1.5 max-h-28 overflow-y-auto">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Tagga jobb</div>
          {staffAssignments.map((a) => (
            <button
              key={a.bookingId}
              className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-accent text-foreground transition-colors flex items-center gap-1"
              onClick={() => {
                setTaggedBooking(a);
                setShowJobPicker(false);
              }}
            >
              <Tag className="w-2.5 h-2.5 text-primary shrink-0" />
              <span className="truncate">{a.client} {a.bookingNumber ? `#${a.bookingNumber}` : ''}</span>
            </button>
          ))}
          <button
            className="w-full text-[10px] text-muted-foreground mt-0.5 hover:text-foreground"
            onClick={() => setShowJobPicker(false)}
          >
            Avbryt
          </button>
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="shrink-0 border-t border-border px-3 pt-1.5 pb-0.5">
        <div className="flex items-center gap-1 mb-1">
          <Zap className="w-2.5 h-2.5 text-primary" />
          <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Snabbmeddelanden</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_MESSAGES.map((qm) => (
            <button
              key={qm}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted hover:bg-accent text-foreground border border-border hover:border-accent transition-colors"
              onClick={() => setMsg(qm)}
              onDoubleClick={() => handleQuickSend(qm)}
            >
              {qm}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-3 py-2">
        <div className="flex gap-1.5 items-end">
          {/* File & Tag buttons */}
          <div className="flex flex-col gap-0.5">
            <button
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => fileInputRef.current?.click()}
              title="Bifoga fil eller bild"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            {staffAssignments.length > 0 && (
              <button
                className={`p-1 rounded transition-colors ${taggedBooking ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                onClick={() => setShowJobPicker(!showJobPicker)}
                title="Tagga till jobb"
              >
                <Tag className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            className="flex-1 text-xs bg-muted rounded-lg px-2.5 py-1.5 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
            placeholder={`Till ${staffName}...`}
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            onClick={handleSend}
            disabled={(!msg.trim() && !pendingFile) || sending || uploading}
          >
            {(sending || uploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpsDirectChat;
