import { useState } from 'react';
import { OpsJobQueueItem } from '@/services/opsControlService';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock, Eye, RefreshCw, MapPin, Users, Send, ChevronRight, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { sendAdminMessage } from '@/services/staffDashboardService';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  jobs: OpsJobQueueItem[];
  isLoading: boolean;
  onFocusJob?: (job: OpsJobQueueItem) => void;
}

const issueConfig = {
  no_staff: { icon: AlertTriangle, label: 'Saknar personal', cls: 'text-destructive bg-destructive/10', rowCls: 'bg-destructive/5 border-l-2 border-destructive' },
  starting_soon: { icon: Clock, label: 'Startar snart', cls: 'text-amber-600 bg-amber-500/10', rowCls: '' },
  unopened: { icon: Eye, label: 'Ej öppnad', cls: 'text-muted-foreground bg-muted', rowCls: '' },
  recently_modified: { icon: RefreshCw, label: 'Ändrad', cls: 'text-blue-600 bg-blue-500/10', rowCls: '' },
};

const OpsJobQueue = ({ jobs, isLoading, onFocusJob }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSendMessage = async (job: OpsJobQueueItem) => {
    if (!msgText.trim() || sending) return;
    setSending(true);
    try {
      const label = job.bookingNumber ? `#${job.bookingNumber}` : job.client;
      await sendAdminMessage(`[${label}] ${msgText}`, 'Admin');
      toast.success('Meddelande skickat');
      setMsgText('');
      queryClient.invalidateQueries({ queryKey: ['ops-control', 'messages'] });
    } catch {
      toast.error('Kunde inte skicka');
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Jobbkö</div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>Jobbkö — {jobs.length} behöver åtgärd</span>
        <div className="flex gap-1.5 text-[9px] font-medium normal-case">
          <span className="flex items-center gap-0.5 text-destructive"><AlertTriangle className="w-2.5 h-2.5" />{jobs.filter(j => j.issue === 'no_staff').length}</span>
          <span className="flex items-center gap-0.5 text-amber-600"><Clock className="w-2.5 h-2.5" />{jobs.filter(j => j.issue === 'starting_soon').length}</span>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">✓ Alla jobb ser bra ut</div>
      ) : (
        <div className="space-y-0.5 overflow-y-auto flex-1">
          {jobs.map(job => {
            const config = issueConfig[job.issue];
            const Icon = config.icon;
            const isExpanded = expandedId === job.bookingId;

            return (
              <div key={job.bookingId} className={`rounded-lg transition-colors ${config.rowCls}`}>
                {/* Main row */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : job.bookingId)}
                >
                  {/* Issue badge */}
                  <div className={`p-1 rounded shrink-0 ${config.cls}`}>
                    <Icon className="w-3 h-3" />
                  </div>

                  {/* Time */}
                  <div className="w-10 shrink-0 text-[10px] font-mono text-muted-foreground">
                    {job.startTime ? format(new Date(job.startTime), 'HH:mm') : '—'}
                  </div>

                  {/* Job info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">
                      {job.bookingNumber ? `#${job.bookingNumber} ` : ''}{job.client}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5 shrink-0" />
                      {job.deliveryAddress || 'Ingen adress'}
                    </div>
                  </div>

                  {/* Staff count */}
                  <div className={`flex items-center gap-0.5 text-[10px] shrink-0 px-1.5 py-0.5 rounded ${job.assignedStaffCount === 0 ? 'text-destructive font-bold bg-destructive/10' : 'text-muted-foreground'}`}>
                    <Users className="w-2.5 h-2.5" />
                    {job.assignedStaffCount}
                  </div>

                  {/* Issue label */}
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${config.cls}`}>
                    {config.label}
                  </span>

                  <ChevronRight className={`w-3 h-3 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="px-2 pb-2 pt-0.5 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Staff list */}
                    {job.assignedStaffNames.length > 0 && (
                      <div className="text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">Personal:</span> {job.assignedStaffNames.join(', ')}
                      </div>
                    )}
                    {job.startTime && job.endTime && (
                      <div className="text-[10px] text-muted-foreground">
                        {job.eventType || 'Jobb'} · {format(new Date(job.startTime), 'HH:mm')}–{format(new Date(job.endTime), 'HH:mm')}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        className="text-[10px] font-medium px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        onClick={(e) => { e.stopPropagation(); navigate(`/booking/${job.bookingId}`); }}
                      >
                        Öppna jobb
                      </button>
                      <button
                        className="text-[10px] font-medium px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        onClick={(e) => { e.stopPropagation(); navigate(`/booking/${job.bookingId}`); }}
                      >
                        <Users className="w-3 h-3 inline mr-0.5" />Tilldela personal
                      </button>
                      {job.latitude && job.longitude && onFocusJob && (
                        <button
                          className="text-[10px] font-medium px-2 py-1 rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onFocusJob(job); }}
                        >
                          <MapPin className="w-3 h-3 inline mr-0.5" />Visa på karta
                        </button>
                      )}
                    </div>

                    {/* Quick message */}
                    <div className="flex gap-1">
                      <input
                        className="flex-1 text-[10px] bg-muted rounded px-1.5 py-1 border-0 outline-none focus:ring-1 ring-primary text-foreground placeholder:text-muted-foreground"
                        placeholder="Skicka meddelande till teamet..."
                        value={msgText}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setMsgText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleSendMessage(job); } }}
                      />
                      <button
                        className="px-1.5 py-1 rounded bg-primary text-primary-foreground text-[9px] font-medium disabled:opacity-50"
                        onClick={(e) => { e.stopPropagation(); handleSendMessage(job); }}
                        disabled={!msgText.trim() || sending}
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OpsJobQueue;
