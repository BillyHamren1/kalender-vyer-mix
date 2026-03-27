import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useSyncAuditLog, useSyncAuditMismatches, useLiveCalendarCheck, SyncAuditEntry } from '@/hooks/useSyncAuditLog';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Activity, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Search, RefreshCw, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SyncAuditPanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchBookingId, setSearchBookingId] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const { data: auditLogs, isLoading, refetch } = useSyncAuditLog(100);
  const { data: mismatches } = useSyncAuditMismatches();
  const { data: liveCheck } = useLiveCalendarCheck(selectedBookingId);

  const mismatchCount = mismatches?.length || 0;

  const filteredLogs = searchBookingId
    ? auditLogs?.filter(l => l.booking_id.toLowerCase().includes(searchBookingId.toLowerCase()))
    : auditLogs;

  const getActionBadge = (entry: SyncAuditEntry) => {
    if (entry.error_message) {
      return <Badge variant="destructive" className="text-xs">FEL</Badge>;
    }
    if (entry.has_mismatch) {
      return <Badge className="text-xs bg-amber-500 hover:bg-amber-600">MISMATCH</Badge>;
    }
    switch (entry.sync_action) {
      case 'imported':
        return <Badge className="text-xs bg-emerald-600 hover:bg-emerald-700">NY IMPORT</Badge>;
      case 'updated':
        return <Badge className="text-xs bg-blue-600 hover:bg-blue-700">UPPDATERAD</Badge>;
      case 'skipped':
        return <Badge variant="secondary" className="text-xs">SKIPPED</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{entry.sync_action}</Badge>;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'HH:mm:ss d MMM', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="w-full border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sync Audit Log
            {mismatchCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {mismatchCount} mismatches
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Sök booking_id..."
              value={searchBookingId}
              onChange={e => setSearchBookingId(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="all" className="text-xs flex-1">
                Alla ({auditLogs?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="mismatches" className="text-xs flex-1">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Mismatches ({mismatchCount})
              </TabsTrigger>
              <TabsTrigger value="inspect" className="text-xs flex-1">
                <Search className="h-3 w-3 mr-1" />
                Live Check
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-2">
              <ScrollArea className="h-80">
                <div className="space-y-1.5">
                  {isLoading ? (
                    <div className="text-xs text-muted-foreground text-center py-4">Laddar...</div>
                  ) : !filteredLogs?.length ? (
                    <div className="text-xs text-muted-foreground text-center py-4">Inga loggar ännu</div>
                  ) : (
                    filteredLogs.map(entry => (
                      <AuditLogEntry
                        key={entry.id}
                        entry={entry}
                        getActionBadge={getActionBadge}
                        formatTime={formatTime}
                        onSelect={() => setSelectedBookingId(entry.booking_id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="mismatches" className="mt-2">
              <ScrollArea className="h-80">
                <div className="space-y-1.5">
                  {!mismatches?.length ? (
                    <div className="text-xs text-muted-foreground text-center py-4 flex items-center justify-center gap-1">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Inga mismatches
                    </div>
                  ) : (
                    mismatches.map(entry => (
                      <AuditLogEntry
                        key={entry.id}
                        entry={entry}
                        getActionBadge={getActionBadge}
                        formatTime={formatTime}
                        onSelect={() => setSelectedBookingId(entry.booking_id)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="inspect" className="mt-2">
              <div className="space-y-3">
                <Input
                  placeholder="Ange booking_id för live-check..."
                  value={selectedBookingId || ''}
                  onChange={e => setSelectedBookingId(e.target.value || null)}
                  className="h-8 text-xs"
                />
                {liveCheck && <LiveCheckResult data={liveCheck} />}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
};

interface AuditLogEntryProps {
  entry: SyncAuditEntry;
  getActionBadge: (e: SyncAuditEntry) => React.ReactNode;
  formatTime: (d: string) => string;
  onSelect: () => void;
}

const AuditLogEntry: React.FC<AuditLogEntryProps> = ({ entry, getActionBadge, formatTime, onSelect }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`text-xs rounded border p-2 cursor-pointer transition-colors ${
        entry.has_mismatch
          ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700'
          : entry.error_message
            ? 'border-destructive/50 bg-destructive/5'
            : 'border-border bg-card hover:bg-accent/50'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {getActionBadge(entry)}
          <span className="font-mono truncate">{entry.booking_id}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground">{formatTime(entry.created_at)}</span>
          <span className="text-muted-foreground">
            +{entry.events_created} ✏{entry.events_updated} −{entry.events_deleted}
          </span>
        </div>
      </div>

      {entry.mismatch_details && (
        <div className="mt-1 text-amber-700 dark:text-amber-400 font-mono">
          ⚠ {entry.mismatch_details}
        </div>
      )}

      {entry.error_message && (
        <div className="mt-1 text-destructive font-mono">
          ✗ {entry.error_message}
        </div>
      )}

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          {entry.booking_dates && (
            <div>
              <div className="font-semibold text-muted-foreground mb-0.5">Bokningsdatum:</div>
              <div className="font-mono text-[10px] grid grid-cols-3 gap-1">
                <span>Rigg: {entry.booking_dates.rigdaydate || '–'}</span>
                <span>Event: {entry.booking_dates.eventdate || '–'}</span>
                <span>Nedrigg: {entry.booking_dates.rigdowndate || '–'}</span>
              </div>
              <div className="font-mono text-[10px] grid grid-cols-3 gap-1 mt-0.5">
                <span>Rigg tid: {entry.booking_dates.rig_start_time || 'default'}</span>
                <span>Event tid: {entry.booking_dates.event_start_time || 'default'}</span>
                <span>Nedrigg tid: {entry.booking_dates.rigdown_start_time || 'default'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="font-semibold text-muted-foreground mb-0.5">Förväntade ({entry.expected_events?.length || 0}):</div>
              {entry.expected_events?.map((e, i) => (
                <div key={i} className="font-mono text-[10px]">
                  {e.event_type} {e.date} {e.start_time?.split('T')[1]}-{e.end_time?.split('T')[1]}
                </div>
              ))}
            </div>
            <div>
              <div className="font-semibold text-muted-foreground mb-0.5">Faktiska ({entry.actual_events?.length || 0}):</div>
              {entry.actual_events?.map((e, i) => (
                <div key={i} className="font-mono text-[10px]">
                  {e.event_type} {e.date} {e.start_time?.split('T')[1]}-{e.end_time?.split('T')[1]} [{e.resource_id}]
                </div>
              ))}
            </div>
          </div>

          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={(e) => { e.stopPropagation(); }}>
            Inspektera live →
          </Button>
        </div>
      )}
    </div>
  );
};

interface LiveCheckResultProps {
  data: {
    bookingId: string;
    bookingStatus: string | null | undefined;
    expected: any[];
    actual: any[];
    missing: string[];
    extra: string[];
    timeMismatches: string[];
    isHealthy: boolean;
    lastAuditAt: string | null;
  };
}

const LiveCheckResult: React.FC<LiveCheckResultProps> = ({ data }) => {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        {data.isHealthy ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        <span className="font-mono">{data.bookingId}</span>
        <Badge variant="outline" className="text-[10px]">{data.bookingStatus || '–'}</Badge>
      </div>

      {data.lastAuditAt && (
        <div className="text-muted-foreground">
          Senaste audit: {format(new Date(data.lastAuditAt), 'HH:mm:ss d MMM', { locale: sv })}
        </div>
      )}

      {data.missing.length > 0 && (
        <div className="p-2 rounded bg-destructive/10 border border-destructive/30">
          <div className="font-semibold text-destructive mb-1">Saknas i DB:</div>
          {data.missing.map((k, i) => (
            <div key={i} className="font-mono">{k}</div>
          ))}
        </div>
      )}

      {data.extra.length > 0 && (
        <div className="p-2 rounded bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700">
          <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Extra i DB (ej förväntat):</div>
          {data.extra.map((k, i) => (
            <div key={i} className="font-mono">{k}</div>
          ))}
        </div>
      )}

      {data.timeMismatches.length > 0 && (
        <div className="p-2 rounded bg-amber-100 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700">
          <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">Tidsskillnader:</div>
          {data.timeMismatches.map((m, i) => (
            <div key={i} className="font-mono">{m}</div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="font-semibold text-muted-foreground mb-0.5">Förväntat ({data.expected.length}):</div>
          {data.expected.map((e, i) => (
            <div key={i} className="font-mono text-[10px]">
              {e.event_type} {e.date} {e.start_time?.split('T')[1]}-{e.end_time?.split('T')[1]}
            </div>
          ))}
        </div>
        <div>
          <div className="font-semibold text-muted-foreground mb-0.5">Faktiskt ({data.actual.length}):</div>
          {data.actual.map((e, i) => (
            <div key={i} className="font-mono text-[10px]">
              {e.event_type} {e.date} {e.start_time?.split('T')[1]}-{e.end_time?.split('T')[1]} [{e.resource_id}]
            </div>
          ))}
        </div>
      </div>

      {data.isHealthy && data.expected.length > 0 && (
        <div className="text-emerald-600 font-medium flex items-center gap-1">
          <CheckCircle className="h-3 w-3" /> Alla kalenderhändelser matchar
        </div>
      )}
    </div>
  );
};

export default SyncAuditPanel;
