import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Send, Radio, CloudRain, CalendarClock, Truck, AlertTriangle, Info, Users, Briefcase, UserCheck, UserPlus } from 'lucide-react';
import { sendBroadcast, BroadcastAudience, BroadcastCategory } from '@/services/broadcastService';
import { OpsJobQueueItem, OpsTimelineStaff } from '@/services/opsControlService';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobQueue: OpsJobQueueItem[];
  timeline: OpsTimelineStaff[];
}

const audienceOptions: { value: BroadcastAudience; label: string; icon: typeof Users; desc: string }[] = [
  { value: 'all_today', label: 'All personal idag', icon: Users, desc: 'Alla som är schemalagda idag' },
  { value: 'job_staff', label: 'Jobbteam', icon: Briefcase, desc: 'Personal tilldelad ett specifikt jobb' },
  { value: 'active_staff', label: 'Aktiv personal', icon: UserCheck, desc: 'Personal med pågående uppdrag just nu' },
  { value: 'selected_staff', label: 'Välj personal', icon: UserPlus, desc: 'Välj specifika medarbetare' },
];

const categoryOptions: { value: BroadcastCategory; label: string; icon: typeof Info }[] = [
  { value: 'info', label: 'Information', icon: Info },
  { value: 'weather', label: 'Vädervarning', icon: CloudRain },
  { value: 'schedule', label: 'Schemaändring', icon: CalendarClock },
  { value: 'logistics', label: 'Logistik', icon: Truck },
  { value: 'urgent', label: 'Brådskande', icon: AlertTriangle },
];

const OpsBroadcastDialog = ({ open, onOpenChange, jobQueue, timeline }: Props) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('all_today');
  const [category, setCategory] = useState<BroadcastCategory>('info');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const assignedStaff = timeline.filter(s => s.status === 'assigned');
  const activeStaff = timeline.filter(s => s.currentJob !== null);

  const recipientCount = (() => {
    switch (audience) {
      case 'all_today': return assignedStaff.length;
      case 'active_staff': return activeStaff.length;
      case 'job_staff': {
        const job = jobQueue.find(j => j.bookingId === selectedBookingId);
        return job?.assignedStaffCount || 0;
      }
      case 'selected_staff': return selectedStaffIds.length;
    }
  })();

  const toggleStaff = useCallback((id: string) => {
    setSelectedStaffIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  }, []);

  const handleSend = async () => {
    if (!content.trim() || sending) return;
    if (audience === 'job_staff' && !selectedBookingId) return;
    if (audience === 'selected_staff' && selectedStaffIds.length === 0) return;

    setSending(true);
    try {
      const senderId = user?.id || 'admin';
      const senderName = user?.email?.split('@')[0] || 'Planerare';
      await sendBroadcast(
        senderId,
        senderName,
        content,
        audience,
        category,
        audience === 'job_staff' ? selectedBookingId : undefined,
        audience === 'selected_staff' ? selectedStaffIds : undefined,
      );
      queryClient.invalidateQueries({ queryKey: ['ops-control'] });
      toast.success(`Broadcast skickat till ${recipientCount} mottagare`);
      setContent('');
      setAudience('all_today');
      setCategory('info');
      setSelectedBookingId('');
      setSelectedStaffIds([]);
      onOpenChange(false);
    } catch {
      toast.error('Kunde inte skicka broadcast');
    } finally {
      setSending(false);
    }
  };

  const CatIcon = categoryOptions.find(c => c.value === category)?.icon || Info;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Radio className="w-4 h-4 text-primary" />
            Broadcast-meddelande
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Kategori</label>
            <div className="flex flex-wrap gap-1.5">
              {categoryOptions.map(opt => {
                const Icon = opt.icon;
                const isActive = category === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setCategory(opt.value)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                      isActive
                        ? opt.value === 'urgent'
                          ? 'bg-destructive/10 text-destructive border-destructive/30'
                          : 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Audience */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Mottagare</label>
            <Select value={audience} onValueChange={(v) => setAudience(v as BroadcastAudience)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {audienceOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <opt.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      {opt.label}
                      <span className="text-muted-foreground text-xs">– {opt.desc}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job selector for job_staff audience */}
          {audience === 'job_staff' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Välj jobb</label>
              <Select value={selectedBookingId} onValueChange={setSelectedBookingId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Välj ett jobb..." />
                </SelectTrigger>
                <SelectContent>
                  {jobQueue.map(job => (
                    <SelectItem key={job.bookingId} value={job.bookingId}>
                      {job.bookingNumber || job.client} – {job.assignedStaffCount} personal
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Staff multi-select for selected_staff audience */}
          {audience === 'selected_staff' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Välj personal ({selectedStaffIds.length} valda)</label>
              <div className="max-h-32 overflow-y-auto border border-border rounded-md p-1.5 space-y-0.5">
                {assignedStaff.map(staff => (
                  <button
                    key={staff.id}
                    onClick={() => toggleStaff(staff.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${
                      selectedStaffIds.includes(staff.id)
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {staff.name}
                    {staff.role && <span className="text-muted-foreground ml-1">({staff.role})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Meddelande</label>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Skriv ditt broadcast-meddelande..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Preview badge */}
          <div className="flex items-center gap-2">
            <CatIcon className={`w-3.5 h-3.5 ${category === 'urgent' ? 'text-destructive' : 'text-primary'}`} />
            <Badge variant="secondary" className="text-[10px]">
              {recipientCount} mottagare
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Avbryt
          </Button>
          <Button
            onClick={handleSend}
            disabled={!content.trim() || sending || recipientCount === 0}
            size="sm"
            className={category === 'urgent' ? 'bg-destructive hover:bg-destructive/90' : ''}
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {sending ? 'Skickar...' : 'Skicka broadcast'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpsBroadcastDialog;
