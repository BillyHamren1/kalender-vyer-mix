import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSyncJobs, useSyncJobStats, SyncJob } from '@/hooks/useSyncJobs';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { RefreshCw, Clock, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

const statusConfig = {
  pending: { label: 'Väntande', icon: Clock, color: 'bg-amber-500 hover:bg-amber-600' },
  processing: { label: 'Bearbetar', icon: Loader2, color: 'bg-blue-500 hover:bg-blue-600' },
  completed: { label: 'Klar', icon: CheckCircle, color: 'bg-emerald-600 hover:bg-emerald-700' },
  failed: { label: 'Misslyckad', icon: XCircle, color: 'bg-destructive hover:bg-destructive/90' },
};

const formatTime = (dateStr: string | null) => {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'HH:mm:ss d MMM', { locale: sv });
  } catch {
    return dateStr;
  }
};

const JobRow: React.FC<{ job: SyncJob }> = ({ job }) => {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[job.status];
  const Icon = config.icon;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
      >
        <Icon className={`h-4 w-4 flex-shrink-0 ${job.status === 'processing' ? 'animate-spin' : ''} ${
          job.status === 'completed' ? 'text-emerald-600' :
          job.status === 'failed' ? 'text-destructive' :
          job.status === 'processing' ? 'text-blue-500' : 'text-amber-500'
        }`} />
        <span className="font-mono text-xs truncate flex-1">{job.booking_id}</span>
        <Badge className={`text-[10px] ${config.color}`}>{config.label}</Badge>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatTime(job.received_at)}</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 bg-muted/30 text-xs space-y-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Event type:</span>
            <span>{job.event_type}</span>
            <span className="text-muted-foreground">Försök:</span>
            <span>{job.attempts}/{job.max_attempts}</span>
            <span className="text-muted-foreground">Mottagen:</span>
            <span>{formatTime(job.received_at)}</span>
            <span className="text-muted-foreground">Startad:</span>
            <span>{formatTime(job.started_at)}</span>
            <span className="text-muted-foreground">Klar:</span>
            <span>{formatTime(job.processed_at)}</span>
          </div>
          {job.error_message && (
            <div className="mt-2 p-2 bg-destructive/10 rounded text-destructive text-[11px] break-all">
              {job.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SyncJobsPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: stats } = useSyncJobStats();
  const { data: jobs, isLoading, refetch } = useSyncJobs(statusFilter);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Sync Job-kö
            {(stats?.pending ?? 0) > 0 && (
              <Badge className="bg-amber-500 text-[10px]">{stats?.pending} väntande</Badge>
            )}
            {(stats?.failed ?? 0) > 0 && (
              <Badge variant="destructive" className="text-[10px]">{stats?.failed} misslyckade</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); refetch(); }}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(['pending', 'processing', 'completed', 'failed'] as const).map(s => {
              const cfg = statusConfig[s];
              const count = stats?.[s] ?? 0;
              return (
                <div key={s} className="text-center p-2 rounded-md bg-muted/50">
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-[10px] text-muted-foreground">{cfg.label}</div>
                </div>
              );
            })}
          </div>

          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="h-8 w-full">
              <TabsTrigger value="all" className="text-xs flex-1">Alla ({stats?.total ?? 0})</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs flex-1">Väntande</TabsTrigger>
              <TabsTrigger value="failed" className="text-xs flex-1">Misslyckade</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs flex-1">Klara</TabsTrigger>
            </TabsList>

            <TabsContent value={statusFilter} className="mt-2">
              <ScrollArea className="h-[300px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Laddar...
                  </div>
                ) : !jobs?.length ? (
                  <div className="text-center text-muted-foreground text-sm py-8">Inga jobb</div>
                ) : (
                  <div className="border rounded-md border-border">
                    {jobs.map(job => <JobRow key={job.id} job={job} />)}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
};

export default SyncJobsPanel;
