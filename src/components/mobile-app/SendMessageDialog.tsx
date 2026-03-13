import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, AlertTriangle, Send } from 'lucide-react';
import { mobileApi } from '@/services/mobileApiService';
import { toast } from 'sonner';

interface SendMessageDialogProps {
  trigger: React.ReactNode;
}

const SendMessageDialog = ({ trigger }: SendMessageDialogProps) => {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'urgent'>('text');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    try {
      await mobileApi.sendMessage({ content, message_type: messageType });
      toast.success('Meddelande skickat');
      setContent('');
      setMessageType('text');
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte skicka meddelande');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm mx-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Skicka meddelande</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMessageType('text')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all ${
                messageType === 'text'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Vanligt
            </button>
            <button
              type="button"
              onClick={() => setMessageType('urgent')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all ${
                messageType === 'urgent'
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Brådskande
            </button>
          </div>

          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Skriv ditt meddelande..."
            className="min-h-[100px] rounded-xl"
            autoFocus
          />

          <Button
            onClick={handleSend}
            disabled={!content.trim() || sending}
            className="w-full rounded-xl gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Skickar...' : 'Skicka'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SendMessageDialog;
