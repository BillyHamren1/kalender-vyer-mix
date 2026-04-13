import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, AlertTriangle, CheckCircle2, Package, FileText, Database, Loader2, ArrowRight, ArrowLeft, XCircle, MinusCircle, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────────

interface BookingOverviewItem {
  id: string;
  bookingNumber: string | null;
  client: string;
  eventdate: string | null;
  externalStatus: string;
  localStatus: string;
  existsLocally: boolean;
  statusMatch: boolean;
}

interface Discrepancy {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  bookingStatus?: string;
  field: string;
  category: 'metadata' | 'products' | 'attachments';
  localValue: any;
  externalValue: any;
  label: string;
  chosenSource?: 'booking' | 'planning';
}

interface SyncResult {
  success: boolean;
  discrepancies: Discrepancy[];
  summary: {
    totalExternal: number;
    totalLocal: number;
    totalDiscrepancies: number;
    byCategory: { metadata: number; products: number; attachments: number };
  };
}

type ChoiceMap = Record<string, 'booking' | 'planning'>;

const categoryIcons: Record<string, React.ReactNode> = {
  metadata: <Database className="h-4 w-4" />,
  products: <Package className="h-4 w-4" />,
  attachments: <FileText className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  metadata: 'Metadata',
  products: 'Produkter',
  attachments: 'Bilagor',
};

const categoryColors: Record<string, string> = {
  metadata: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  products: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  attachments: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const getDiscKey = (d: Discrepancy) => `${d.bookingId}::${d.field}`;

// ── Booking Overview Tab ─────────────────────────────────────────────────

const BookingOverviewTab = () => {
  const [filter, setFilter] = useState<'all' | 'issues' | 'non-confirmed'>('issues');

  const { data, isLoading, refetch, isFetching } = useQuery<{ bookings: BookingOverviewItem[] }>({
    queryKey: ['booking-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'booking-overview' }
      });
      if (error) throw error;
      return data;
    },
    enabled: false,
  });

  const bookings = data?.bookings || [];
  const confirmed = bookings.filter(b => b.externalStatus === 'CONFIRMED');
  const issues = confirmed.filter(b => !b.existsLocally || !b.statusMatch);
  const matching = confirmed.filter(b => b.existsLocally && b.statusMatch);
  const nonConfirmedInPlanning = bookings.filter(b => b.externalStatus !== 'CONFIRMED' && b.existsLocally);
  const displayed = filter === 'issues' ? issues : filter === 'non-confirmed' ? nonConfirmedInPlanning : confirmed;

  const statusBadge = (status: string) => {
    if (status === 'CONFIRMED') return <Badge className="bg-green-600 text-white text-xs">{status}</Badge>;
    if (status === 'CANCELLED' || status === 'AVBOKAD') return <Badge className="bg-red-500 text-white text-xs">{status}</Badge>;
    if (status === 'OFFER' || status === 'DRAFT') return <Badge className="bg-amber-500 text-white text-xs">{status}</Badge>;
    if (status === 'SAKNAS') return <Badge className="bg-red-700 text-white text-xs">SAKNAS</Badge>;
    return <Badge variant="outline" className="text-xs">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bokningsöversikt — CONFIRMED</h2>
          <p className="text-sm text-muted-foreground">Visar alla bekräftade bokningar från Booking och om de finns/matchar i Planning</p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} size="lg">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {data ? 'Kör igen' : 'Hämta bokningar'}
        </Button>
      </div>

      {isLoading || isFetching ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Hämtar bokningar från båda systemen...</p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{bookings.length}</p>
                <p className="text-xs text-muted-foreground">Totalt i Booking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{confirmed.length}</p>
                <p className="text-xs text-muted-foreground">CONFIRMED</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-green-600">{matching.length}</p>
                <p className="text-xs text-muted-foreground">Matchar Planning</p>
              </CardContent>
            </Card>
            <Card className={issues.length > 0 ? 'ring-2 ring-red-400' : ''}>
              <CardContent className="py-3 px-4 text-center">
                <p className={`text-2xl font-bold ${issues.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{issues.length}</p>
                <p className="text-xs text-muted-foreground">Avviker / Saknas</p>
              </CardContent>
            </Card>
            <Card className={nonConfirmedInPlanning.length > 0 ? 'ring-2 ring-amber-400' : ''}>
              <CardContent className="py-3 px-4 text-center">
                <p className={`text-2xl font-bold ${nonConfirmedInPlanning.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{nonConfirmedInPlanning.length}</p>
                <p className="text-xs text-muted-foreground">Ej bekräftade i Planning</p>
              </CardContent>
            </Card>
          </div>

          {/* Filter toggle */}
          <div className="flex gap-2">
            <Button variant={filter === 'issues' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('issues')}>
              Bara avvikelser ({issues.length})
            </Button>
            <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>
              Alla CONFIRMED ({confirmed.length})
            </Button>
            <Button variant={filter === 'non-confirmed' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('non-confirmed')}>
              <AlertTriangle className="h-3 w-3 mr-1" />
              Ej bekräftade i Planning ({nonConfirmedInPlanning.length})
            </Button>
          </div>

          {displayed.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold">Alla bekräftade bokningar matchar!</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bokningsnr</TableHead>
                      <TableHead>Klient</TableHead>
                      <TableHead>Eventdatum</TableHead>
                      <TableHead>Status Booking</TableHead>
                      <TableHead>Status Planning</TableHead>
                      <TableHead>Finns i Planning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayed.map(b => {
                      const hasIssue = !b.existsLocally || !b.statusMatch;
                      return (
                        <TableRow key={b.id} className={hasIssue ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell className="font-mono text-sm">{b.bookingNumber || '—'}</TableCell>
                          <TableCell className="font-medium">{b.client || 'Okänd'}</TableCell>
                          <TableCell>{b.eventdate || '—'}</TableCell>
                          <TableCell>{statusBadge(b.externalStatus)}</TableCell>
                          <TableCell>{statusBadge(b.localStatus)}</TableCell>
                          <TableCell>
                            {b.existsLocally ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <RefreshCw className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Redo att hämta</p>
            <p className="text-muted-foreground text-sm">Klicka "Hämta bokningar" för att jämföra bekräftade bokningar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ── Detailed Reconciliation Tab (existing) ───────────────────────────────

const DetailedReconciliationTab = () => {
  const [choices, setChoices] = useState<ChoiceMap>({});
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<SyncResult>({
    queryKey: ['sync-reconciliation'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'compare' }
      });
      if (error) throw error;
      return data;
    },
    enabled: false,
  });

  const autoChoices = useMemo(() => {
    if (!data?.discrepancies) return {};
    const auto: ChoiceMap = {};
    for (const d of data.discrepancies) {
      const key = getDiscKey(d);
      const extEmpty = d.externalValue === null || d.externalValue === undefined || d.externalValue === '';
      const locEmpty = d.localValue === null || d.localValue === undefined || d.localValue === '';
      if (extEmpty && !locEmpty) auto[key] = 'planning';
      else if (locEmpty && !extEmpty) auto[key] = 'booking';
    }
    return auto;
  }, [data?.discrepancies]);

  const effectiveChoices = useMemo(() => ({ ...autoChoices, ...choices }), [autoChoices, choices]);

  const applyMutation = useMutation({
    mutationFn: async (corrections: Discrepancy[]) => {
      const { data, error } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'apply', corrections }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      toast.success(`${result.applied} korrigeringar genomförda via Booking API`);
      if (result.errors?.length) {
        toast.error(`${result.errors.length} fel uppstod`, {
          description: result.errors.join(', ').substring(0, 200),
        });
      }
      setChoices({});
      refetch();
    },
    onError: (err: Error) => {
      toast.error('Kunde inte genomföra korrigeringar', { description: err.message });
    }
  });

  const discrepancies = data?.discrepancies || [];
  const filtered = filterCategory
    ? discrepancies.filter(d => d.category === filterCategory)
    : discrepancies;

  const groupedByBooking = useMemo(() => {
    const map = new Map<string, Discrepancy[]>();
    for (const d of filtered) {
      const arr = map.get(d.bookingId) || [];
      arr.push(d);
      map.set(d.bookingId, arr);
    }
    return map;
  }, [filtered]);

  const setChoice = (key: string, source: 'booking' | 'planning') => {
    setChoices(prev => ({ ...prev, [key]: source }));
  };

  const chooseAllBooking = () => {
    const newChoices: ChoiceMap = {};
    for (const d of filtered) newChoices[getDiscKey(d)] = 'booking';
    setChoices(prev => ({ ...prev, ...newChoices }));
  };

  const chooseAllPlanning = () => {
    const newChoices: ChoiceMap = {};
    for (const d of filtered) newChoices[getDiscKey(d)] = 'planning';
    setChoices(prev => ({ ...prev, ...newChoices }));
  };

  const resolvedCount = filtered.filter(d => effectiveChoices[getDiscKey(d)]).length;

  const handleApply = () => {
    const corrections: Discrepancy[] = [];
    for (const d of discrepancies) {
      const key = getDiscKey(d);
      const source = effectiveChoices[key];
      if (source) corrections.push({ ...d, chosenSource: source });
    }
    if (!corrections.length) {
      toast.warning('Inga avvikelser har ett valt värde');
      return;
    }
    applyMutation.mutate(corrections);
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic">tom</span>;
    if (typeof val === 'boolean') return val ? 'Ja' : 'Nej';
    if (typeof val === 'object') return String(JSON.stringify(val));
    const str = String(val);
    return str.length > 60 ? str.substring(0, 57) + '…' : str;
  };

  const safeClientName = (client: any): string => {
    if (!client) return 'Okänd';
    if (typeof client === 'string') return client;
    if (typeof client === 'object' && client.name) return client.name;
    return String(client);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Detaljerad avstämning — CONFIRMED</h2>
          <p className="text-sm text-muted-foreground">Jämför alla bekräftade bokningar fält för fält — metadata, produkter, bilagor</p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} size="lg">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {data ? 'Kör igen' : 'Starta jämförelse'}
        </Button>
      </div>

      {isLoading || isFetching ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Hämtar och jämför data mot bokningssystemet...</p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{data.summary.totalExternal}</p>
                <p className="text-xs text-muted-foreground">Booking</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{data.summary.totalLocal}</p>
                <p className="text-xs text-muted-foreground">Planning</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:ring-2 ring-primary" onClick={() => setFilterCategory(filterCategory === 'metadata' ? null : 'metadata')}>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{data.summary.byCategory.metadata}</p>
                <p className="text-xs text-muted-foreground">Metadata</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:ring-2 ring-primary" onClick={() => setFilterCategory(filterCategory === 'products' ? null : 'products')}>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{data.summary.byCategory.products}</p>
                <p className="text-xs text-muted-foreground">Produkter</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:ring-2 ring-primary" onClick={() => setFilterCategory(filterCategory === 'attachments' ? null : 'attachments')}>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{data.summary.byCategory.attachments}</p>
                <p className="text-xs text-muted-foreground">Bilagor</p>
              </CardContent>
            </Card>
          </div>

          {filterCategory && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Filtrerar: {categoryLabels[filterCategory]}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setFilterCategory(null)}>Visa alla</Button>
            </div>
          )}

          {discrepancies.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold">Inga avvikelser</p>
                <p className="text-muted-foreground">Data stämmer överens mellan systemen</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between bg-muted/50 rounded-lg p-3 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={chooseAllBooking} className="gap-1">
                    <ArrowLeft className="h-3 w-3" /> Välj alla Booking
                  </Button>
                  <Button variant="outline" size="sm" onClick={chooseAllPlanning} className="gap-1">
                    Välj alla Planning <ArrowRight className="h-3 w-3" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{resolvedCount}/{filtered.length} valda</span>
                </div>
                <Button onClick={handleApply} disabled={resolvedCount === 0 || applyMutation.isPending} variant="default" className="gap-1">
                  {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Applicera via Booking API ({resolvedCount})
                </Button>
              </div>

              <div className="space-y-4">
                {[...groupedByBooking.entries()].map(([bookingId, items]) => {
                  const first = items[0];
                  const bookingItemsResolved = items.filter(d => effectiveChoices[getDiscKey(d)]).length;
                  const extStatus = first.bookingStatus?.toUpperCase() || 'UNKNOWN';
                  const isNonConfirmed = extStatus !== 'CONFIRMED';
                  const statusStyle = extStatus === 'OFFER' || extStatus === 'DRAFT' || extStatus === 'UTKAST'
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30'
                    : extStatus === 'CANCELLED' || extStatus === 'AVBOKAD'
                    ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                    : '';
                  const statusLabel = extStatus === 'OFFER' ? 'OFFERT'
                    : extStatus === 'DRAFT' || extStatus === 'UTKAST' ? 'UTKAST'
                    : extStatus === 'CANCELLED' || extStatus === 'AVBOKAD' ? 'AVBOKAD'
                    : extStatus;

                  return (
                    <Card key={bookingId} className={isNonConfirmed ? statusStyle : ''}>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="font-semibold">{safeClientName(first.client)}</span>
                            {first.bookingNumber && <Badge variant="outline" className="text-xs">#{first.bookingNumber}</Badge>}
                            {isNonConfirmed && (
                              <Badge className={`text-xs ${extStatus === 'CANCELLED' || extStatus === 'AVBOKAD' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                                {statusLabel}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground font-mono">{bookingId.substring(0, 8)}…</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{bookingItemsResolved}/{items.length} valda</Badge>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const nc: ChoiceMap = {};
                              items.forEach(d => { nc[getDiscKey(d)] = 'booking'; });
                              setChoices(prev => ({ ...prev, ...nc }));
                            }}>Alla → Booking</Button>
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
                              const nc: ChoiceMap = {};
                              items.forEach(d => { nc[getDiscKey(d)] = 'planning'; });
                              setChoices(prev => ({ ...prev, ...nc }));
                            }}>Alla → Planning</Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="divide-y divide-border">
                          {items.map((d) => {
                            const key = getDiscKey(d);
                            const chosen = effectiveChoices[key];
                            const isAutoSelected = autoChoices[key] && !choices[key];
                            return (
                              <div key={key} className="py-2.5">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${categoryColors[d.category]}`}>
                                    {categoryIcons[d.category]} {categoryLabels[d.category]}
                                  </span>
                                  <span className="text-sm font-medium">{d.label}</span>
                                  {isAutoSelected && <Badge variant="outline" className="text-xs text-green-600 border-green-300">auto</Badge>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <button type="button" onClick={() => setChoice(key, 'booking')}
                                    className={`text-left p-2 rounded-md border text-xs transition-all ${chosen === 'booking' ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="font-semibold text-muted-foreground">Booking</span>
                                      {chosen === 'booking' && <CheckCircle2 className="h-3 w-3 text-primary" />}
                                    </div>
                                    <div className="font-mono break-all">{formatValue(d.externalValue)}</div>
                                  </button>
                                  <button type="button" onClick={() => setChoice(key, 'planning')}
                                    className={`text-left p-2 rounded-md border text-xs transition-all ${chosen === 'planning' ? 'border-primary bg-primary/10 ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}`}>
                                    <div className="flex items-center gap-1 mb-1">
                                      <span className="font-semibold text-muted-foreground">Planning</span>
                                      {chosen === 'planning' && <CheckCircle2 className="h-3 w-3 text-primary" />}
                                    </div>
                                    <div className="font-mono break-all">{formatValue(d.localValue)}</div>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <RefreshCw className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Redo att jämföra</p>
            <p className="text-muted-foreground text-sm">Klicka "Starta jämförelse" för att hämta data</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ── Schedule Audit Tab ────────────────────────────────────────────────────

interface ScheduleRow {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  localRigdaydate: string | null;
  localEventdate: string | null;
  localRigdowndate: string | null;
  localRigStart: string | null;
  localRigEnd: string | null;
  localEventStart: string | null;
  localEventEnd: string | null;
  localRigdownStart: string | null;
  localRigdownEnd: string | null;
  localCalRigDates: string[];
  localCalEventDates: string[];
  localCalRigdownDates: string[];
  extRigDates: string[];
  extEventDates: string[];
  extRigdownDates: string[];
  extRigStart: string | null;
  extRigEnd: string | null;
  extEventStart: string | null;
  extEventEnd: string | null;
  extRigdownStart: string | null;
  extRigdownEnd: string | null;
  hasDiscrepancy: boolean;
  discrepancyDetails: string[];
}

const normalizeDateStr = (d: string | null | undefined): string | null => {
  if (!d) return null;
  return d.substring(0, 10);
};

const normalizeTimeStr = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const match = t.match(/(\d{2}:\d{2})/);
  return match ? match[1] : t;
};

const datesArraysMatch = (a?: string[], b?: string[]): boolean => {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  const sa = [...aa].sort();
  const sb = [...bb].sort();
  return sa.every((v, i) => v === sb[i]);
};

const ScheduleAuditTab = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<ScheduleRow[]>({
    queryKey: ['schedule-audit'],
    queryFn: async () => {
      const { data: localBookings, error: localErr } = await supabase
        .from('bookings')
        .select('id, booking_number, client, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time')
        .eq('status', 'CONFIRMED')
        .order('eventdate', { ascending: true });

      if (localErr) throw localErr;

      // Fetch local calendar events for multi-day data
      const bookingIds = (localBookings || []).map(b => b.id);
      let calEvents: any[] = [];
      for (let i = 0; i < bookingIds.length; i += 200) {
        const chunk = bookingIds.slice(i, i + 200);
        const { data: ce } = await supabase
          .from('calendar_events')
          .select('booking_id, event_type, start_time, source_date')
          .in('booking_id', chunk);
        if (ce) calEvents = calEvents.concat(ce);
      }

      const calMap = new Map<string, { rig: string[]; event: string[]; rigdown: string[] }>();
      for (const ce of calEvents) {
        if (!ce.booking_id) continue;
        const entry = calMap.get(ce.booking_id) || { rig: [], event: [], rigdown: [] };
        const date = normalizeDateStr(ce.source_date) || normalizeDateStr(ce.start_time);
        if (!date) continue;
        const type = ce.event_type as string;
        if (type === 'rig' && !entry.rig.includes(date)) entry.rig.push(date);
        if (type === 'event' && !entry.event.includes(date)) entry.event.push(date);
        if ((type === 'rigdown' || type === 'teardown') && !entry.rigdown.includes(date)) entry.rigdown.push(date);
        calMap.set(ce.booking_id, entry);
      }

      // Fetch external data
      const { data: extData, error: extErr } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'raw-dump' }
      });
      if (extErr) throw extErr;

      const extBookings: any[] = extData?.bookings || [];
      const extMap = new Map<string, any>();
      for (const eb of extBookings) extMap.set(eb.id, eb);

      const rows: ScheduleRow[] = (localBookings || []).map((lb) => {
        const ext = extMap.get(lb.id);
        const cal = calMap.get(lb.id) || { rig: [], event: [], rigdown: [] };
        const discDetails: string[] = [];

        const extRigDates = ((ext?.rig_dates?.length ? ext.rig_dates : (ext?.rigdaydate ? [ext.rigdaydate] : [])) as string[]).map(d => normalizeDateStr(d)).filter(Boolean) as string[];
        const extEventDates = ((ext?.event_dates?.length ? ext.event_dates : (ext?.eventdate ? [ext.eventdate] : [])) as string[]).map(d => normalizeDateStr(d)).filter(Boolean) as string[];
        const extRigdownDates = ((ext?.rigdown_dates?.length ? ext.rigdown_dates : (ext?.rigdowndate ? [ext.rigdowndate] : [])) as string[]).map(d => normalizeDateStr(d)).filter(Boolean) as string[];

        const localRigDates = cal.rig.length > 0 ? cal.rig : (lb.rigdaydate ? [normalizeDateStr(lb.rigdaydate)!] : []);
        const localEventDates = cal.event.length > 0 ? cal.event : (lb.eventdate ? [normalizeDateStr(lb.eventdate)!] : []);
        const localRigdownDates = cal.rigdown.length > 0 ? cal.rigdown : (lb.rigdowndate ? [normalizeDateStr(lb.rigdowndate)!] : []);

        if (!datesArraysMatch(localRigDates, extRigDates)) {
          discDetails.push(`Rigg: [${localRigDates.join(', ') || 'inga'}] ≠ [${extRigDates.join(', ') || 'inga'}]`);
        }
        if (!datesArraysMatch(localEventDates, extEventDates)) {
          discDetails.push(`Event: [${localEventDates.join(', ') || 'inga'}] ≠ [${extEventDates.join(', ') || 'inga'}]`);
        }
        if (!datesArraysMatch(localRigdownDates, extRigdownDates)) {
          discDetails.push(`Nedrigg: [${localRigdownDates.join(', ') || 'inga'}] ≠ [${extRigdownDates.join(', ') || 'inga'}]`);
        }

        const cmpTime = (label: string, local: string | null, external: string | null) => {
          const nl = normalizeTimeStr(local);
          const ne = normalizeTimeStr(external);
          if (nl && ne && nl !== ne) discDetails.push(`${label}: ${nl} ≠ ${ne}`);
        };
        if (ext) {
          cmpTime('Rigg start', lb.rig_start_time, ext.rig_start_time);
          cmpTime('Rigg slut', lb.rig_end_time, ext.rig_end_time);
          cmpTime('Event start', lb.event_start_time, ext.event_start_time);
          cmpTime('Event slut', lb.event_end_time, ext.event_end_time);
          cmpTime('Nedrigg start', lb.rigdown_start_time, ext.rigdown_start_time);
          cmpTime('Nedrigg slut', lb.rigdown_end_time, ext.rigdown_end_time);
        }

        return {
          bookingId: lb.id, bookingNumber: lb.booking_number, client: lb.client,
          localRigdaydate: lb.rigdaydate, localEventdate: lb.eventdate, localRigdowndate: lb.rigdowndate,
          localRigStart: lb.rig_start_time, localRigEnd: lb.rig_end_time,
          localEventStart: lb.event_start_time, localEventEnd: lb.event_end_time,
          localRigdownStart: lb.rigdown_start_time, localRigdownEnd: lb.rigdown_end_time,
          localCalRigDates: localRigDates.sort(), localCalEventDates: localEventDates.sort(), localCalRigdownDates: localRigdownDates.sort(),
          extRigDates: extRigDates.sort(), extEventDates: extEventDates.sort(), extRigdownDates: extRigdownDates.sort(),
          extRigStart: ext?.rig_start_time || null, extRigEnd: ext?.rig_end_time || null,
          extEventStart: ext?.event_start_time || null, extEventEnd: ext?.event_end_time || null,
          extRigdownStart: ext?.rigdown_start_time || null, extRigdownEnd: ext?.rigdown_end_time || null,
          hasDiscrepancy: discDetails.length > 0, discrepancyDetails: discDetails,
        };
      });

      rows.sort((a, b) => {
        if (a.hasDiscrepancy && !b.hasDiscrepancy) return -1;
        if (!a.hasDiscrepancy && b.hasDiscrepancy) return 1;
        return (a.localEventdate || '').localeCompare(b.localEventdate || '');
      });

      return rows;
    },
    enabled: false,
  });

  const rows = data || [];
  const filtered = searchTerm.trim()
    ? rows.filter(r =>
        (r.bookingNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.client.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : rows;
  const discCount = rows.filter(r => r.hasDiscrepancy).length;

  const DataBlock = ({ label, values, emphasize }: { label: string; values: string[]; emphasize?: boolean }) => (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="space-y-0.5">
        {values.length === 0 ? (
          <div className="text-xs text-muted-foreground">—</div>
        ) : values.map((value) => (
          <div key={`${label}-${value}`} className={`text-xs ${emphasize ? 'font-semibold' : ''}`}>{value}</div>
        ))}
      </div>
    </div>
  );

  const DatesCell = ({ localDates: _ld, extDates: _ed, hasDisc }: { localDates?: string[]; extDates?: string[]; hasDisc: boolean }) => {
    const localDates = (_ld ?? []).slice().sort();
    const extDates = (_ed ?? []).slice().sort();

    return (
      <div className={`space-y-2 rounded-md border p-2 ${hasDisc ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-background'}`}>
        <DataBlock label="Planning" values={localDates} emphasize={hasDisc} />
        <DataBlock label="Booking" values={extDates} />
      </div>
    );
  };

  const TimesCell = ({ local, ext }: { local: string | null; ext: string | null }) => {
    const nl = normalizeTimeStr(local) || '—';
    const ne = normalizeTimeStr(ext) || '—';
    const hasDisc = nl !== ne;

    return (
      <div className={`space-y-2 rounded-md border p-2 ${hasDisc ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-background'}`}>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Planning</div>
          <div className={`text-xs ${hasDisc ? 'font-semibold' : 'text-muted-foreground'}`}>{nl}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Booking</div>
          <div className="text-xs text-muted-foreground">{ne}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Datumöversikt — CONFIRMED</h2>
          <p className="text-sm text-muted-foreground">Alla bokningars rigg-, event- och nedriggdagar (inkl. flerdagars) jämfört med Booking-systemet</p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} size="lg">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {data ? 'Uppdatera' : 'Hämta datumdata'}
        </Button>
      </div>

      {isLoading || isFetching ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Hämtar datum från båda system...</p>
          </CardContent>
        </Card>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{rows.length}</p>
                <p className="text-xs text-muted-foreground">Totalt</p>
              </CardContent>
            </Card>
            <Card className={discCount > 0 ? 'border-red-300' : ''}>
              <CardContent className="py-3 px-4 text-center">
                <p className={`text-2xl font-bold ${discCount > 0 ? 'text-red-600' : 'text-green-600'}`}>{discCount}</p>
                <p className="text-xs text-muted-foreground">Avvikelser</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold text-green-600">{rows.length - discCount}</p>
                <p className="text-xs text-muted-foreground">OK</p>
              </CardContent>
            </Card>
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Sök bokning..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-[80px]">Bokning</TableHead>
                      <TableHead className="text-xs w-[120px]">Kund</TableHead>
                      <TableHead className="text-xs">Riggdagar</TableHead>
                      <TableHead className="text-xs w-[60px]">Tid</TableHead>
                      <TableHead className="text-xs">Eventdagar</TableHead>
                      <TableHead className="text-xs w-[60px]">Tid</TableHead>
                      <TableHead className="text-xs">Nedriggdagar</TableHead>
                      <TableHead className="text-xs w-[60px]">Tid</TableHead>
                      <TableHead className="text-xs w-[70px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => {
                      const rigDisc = !datesArraysMatch(row.localCalRigDates, row.extRigDates);
                      const eventDisc = !datesArraysMatch(row.localCalEventDates, row.extEventDates);
                      const rigdownDisc = !datesArraysMatch(row.localCalRigdownDates, row.extRigdownDates);

                      return (
                        <TableRow key={row.bookingId} className={row.hasDiscrepancy ? 'bg-red-50 dark:bg-red-950/20' : ''}>
                          <TableCell className="font-mono text-xs font-medium">
                            {row.bookingNumber || row.bookingId.substring(0, 8)}
                          </TableCell>
                          <TableCell className="text-xs truncate max-w-[120px]">{row.client}</TableCell>
                          <TableCell>
                            <DatesCell localDates={row.localCalRigDates} extDates={row.extRigDates} hasDisc={rigDisc} />
                          </TableCell>
                          <TableCell>
                            <TimesCell local={row.localRigStart} ext={row.extRigStart} />
                          </TableCell>
                          <TableCell>
                            <DatesCell localDates={row.localCalEventDates} extDates={row.extEventDates} hasDisc={eventDisc} />
                          </TableCell>
                          <TableCell>
                            <TimesCell local={row.localEventStart} ext={row.extEventStart} />
                          </TableCell>
                          <TableCell>
                            <DatesCell localDates={row.localCalRigdownDates} extDates={row.extRigdownDates} hasDisc={rigdownDisc} />
                          </TableCell>
                          <TableCell>
                            <TimesCell local={row.localRigdownStart} ext={row.extRigdownStart} />
                          </TableCell>
                          <TableCell>
                            {row.hasDiscrepancy ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5">
                                {row.discrepancyDetails.length} avv.
                              </Badge>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Inga bokningar matchar sökningen
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <RefreshCw className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Redo att hämta</p>
            <p className="text-muted-foreground text-sm">Klicka "Hämta datumdata" för att jämföra datum mot bokningssystemet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ── Raw Data Tab ─────────────────────────────────────────────────────────

interface RawBooking {
  id: string;
  booking_number: string | null;
  client: string;
  status: string;
  rigdaydate: string | null;
  eventdate: string | null;
  rigdowndate: string | null;
  rig_start_time: string | null;
  rig_end_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  rigdown_start_time: string | null;
  rigdown_end_time: string | null;
  deliveryaddress: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  internalnotes: string | null;
  carry_more_than_10m: boolean;
  ground_nails_allowed: boolean;
  exact_time_needed: boolean;
  exact_time_info: string | null;
  products: Array<{
    name: string;
    sku: string | null;
    quantity: number;
    unit_price: number | null;
    total_price: number | null;
    discount: number;
    assembly_cost: number;
    handling_cost: number;
    purchase_cost: number;
    notes: string | null;
    is_package_component: boolean;
    parent_package_id: string | null;
  }>;
  attachments: Array<{
    url: string;
    file_name: string;
    file_type: string;
  }>;
}

const FieldRow = ({ label, value }: { label: string; value: any }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-muted-foreground text-sm min-w-[140px]">{label}:</span>
      <span className="text-sm font-medium">{String(value)}</span>
    </div>
  );
};

const TimeComparisonTable = ({ booking, local }: { booking: RawBooking; local: any }) => {
  const fields = [
    { label: 'Riggdatum', ext: booking.rigdaydate, loc: local?.rigdaydate },
    { label: 'Rigg start', ext: booking.rig_start_time, loc: local?.rig_start_time },
    { label: 'Rigg slut', ext: booking.rig_end_time, loc: local?.rig_end_time },
    { label: 'Eventdatum', ext: booking.eventdate, loc: local?.eventdate },
    { label: 'Event start', ext: booking.event_start_time, loc: local?.event_start_time },
    { label: 'Event slut', ext: booking.event_end_time, loc: local?.event_end_time },
    { label: 'Nedriggdatum', ext: booking.rigdowndate, loc: local?.rigdowndate },
    { label: 'Nedrigg start', ext: booking.rigdown_start_time, loc: local?.rigdown_start_time },
    { label: 'Nedrigg slut', ext: booking.rigdown_end_time, loc: local?.rigdown_end_time },
  ];
  return (
    <>
      <div className="border rounded overflow-hidden">
        <div className="grid grid-cols-3 gap-0 bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          <span>Fält</span>
          <span>Booking</span>
          <span>Planning</span>
        </div>
        {fields.map(({ label, ext, loc }) => {
          const extVal = ext || '—';
          const locVal = loc || '—';
          const mismatch = ext && loc && ext !== loc;
          return (
            <div key={label} className={`grid grid-cols-3 gap-0 px-2 py-1 text-xs border-t ${mismatch ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono">{extVal}</span>
              <span className={`font-mono ${mismatch ? 'text-amber-700 dark:text-amber-400 font-bold' : ''}`}>{locVal}</span>
            </div>
          );
        })}
      </div>
      {!local && <p className="text-xs text-muted-foreground mt-1 italic">Ej hittad i Planning</p>}
    </>
  );
};

const RawDataTab = () => {
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery<{ bookings: RawBooking[]; total: number }>({
    queryKey: ['raw-dump'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'raw-dump' }
      });
      if (error) throw error;
      return data;
    },
    enabled: false,
  });

  // Fetch local times from Planning DB for all bookings
  const bookingIds = useMemo(() => (data?.bookings || []).map(b => b.id), [data]);
  const { data: localBookings } = useQuery({
    queryKey: ['local-booking-times', bookingIds],
    queryFn: async () => {
      if (!bookingIds.length) return [];
      // Fetch in chunks of 100
      const all: any[] = [];
      for (let i = 0; i < bookingIds.length; i += 100) {
        const chunk = bookingIds.slice(i, i + 100);
        const { data } = await supabase
          .from('bookings')
          .select('id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time')
          .in('id', chunk);
        if (data) all.push(...data);
      }
      return all;
    },
    enabled: bookingIds.length > 0,
  });

  const localTimesMap = useMemo(() => {
    const map = new Map<string, any>();
    (localBookings || []).forEach(b => map.set(b.id, b));
    return map;
  }, [localBookings]);

  const [showOnlyWithTimes, setShowOnlyWithTimes] = useState(false);

  const bookings = data?.bookings || [];

  const hasCustomTimes = (b: RawBooking) =>
    !!(b.rig_start_time || b.rig_end_time || b.event_start_time || b.event_end_time || b.rigdown_start_time || b.rigdown_end_time);

  const filtered = useMemo(() => {
    let result = bookings;
    if (showOnlyWithTimes) {
      result = result.filter(hasCustomTimes);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        (b.booking_number || '').toLowerCase().includes(q) ||
        (b.client || '').toLowerCase().includes(q) ||
        (b.id || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [bookings, search, showOnlyWithTimes]);

  const withTimesCount = useMemo(() => bookings.filter(hasCustomTimes).length, [bookings]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Booking Rådata</CardTitle>
              <p className="text-muted-foreground text-sm mt-1">
                Hämtar ALL data direkt från Booking-systemet (read-only, ingen skrivning)
              </p>
            </div>
            <Button onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Hämta all data från Booking
            </Button>
          </div>
        </CardHeader>
      </Card>

      {isLoading || isFetching ? (
        <Card><CardContent className="py-12 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Hämtar bokningar från Booking...</span>
        </CardContent></Card>
      ) : bookings.length > 0 ? (
        <>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök bokningsnummer, klient..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={showOnlyWithTimes ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOnlyWithTimes(!showOnlyWithTimes)}
            >
              Särskild tid ({withTimesCount})
            </Button>
            <Badge variant="secondary">{filtered.length} / {bookings.length} bokningar</Badge>
          </div>

          <Accordion type="multiple" className="space-y-2">
            {filtered.map(b => {
              const hasTimes = hasCustomTimes(b);
              return (
              <AccordionItem key={b.id} value={b.id} className={`border rounded-lg px-4 ${hasTimes ? 'border-primary/40 bg-primary/5' : ''}`}>
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3 text-left">
                    <Badge variant="outline" className="font-mono text-xs">{b.booking_number || '—'}</Badge>
                    <span className="font-medium">{b.client || 'Okänd kund'}</span>
                    <Badge className={
                      b.status === 'CONFIRMED' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      b.status === 'CANCELLED' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }>{b.status}</Badge>
                    {hasTimes && <Badge className="bg-primary/20 text-primary text-[10px]">Särskild tid</Badge>}
                    {b.eventdate && <span className="text-muted-foreground text-xs">{b.eventdate}</span>}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                    {/* Dates & Times - Side by side */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Datum & Tider</h4>
                      <TimeComparisonTable booking={b} local={localTimesMap.get(b.id)} />
                    </div>

                    {/* Contact & Address */}
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Kontakt & Adress</h4>
                      <FieldRow label="Kontaktperson" value={b.contact_name} />
                      <FieldRow label="Telefon" value={b.contact_phone} />
                      <FieldRow label="E-post" value={b.contact_email} />
                      <FieldRow label="Adress" value={b.deliveryaddress} />
                      <FieldRow label="Stad" value={b.delivery_city} />
                      <FieldRow label="Postnr" value={b.delivery_postal_code} />
                      <FieldRow label="Bära >10m" value={b.carry_more_than_10m ? 'Ja' : 'Nej'} />
                      <FieldRow label="Markspik OK" value={b.ground_nails_allowed ? 'Ja' : 'Nej'} />
                      <FieldRow label="Exakt tid" value={b.exact_time_needed ? 'Ja' : 'Nej'} />
                      <FieldRow label="Tidsinfo" value={b.exact_time_info} />
                    </div>
                  </div>

                  {b.internalnotes && (
                    <div className="mt-3">
                      <h4 className="font-semibold text-sm mb-1">Interna noter</h4>
                      <p className="text-sm bg-muted p-2 rounded whitespace-pre-wrap">{b.internalnotes}</p>
                    </div>
                  )}

                  {b.products && b.products.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm mb-2">Produkter ({b.products.length})</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Namn</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Antal</TableHead>
                            <TableHead className="text-right">À-pris</TableHead>
                            <TableHead className="text-right">Totalt</TableHead>
                            <TableHead className="text-right">Assembly</TableHead>
                            <TableHead className="text-right">Handling</TableHead>
                            <TableHead className="text-right">Purchase</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {b.products.map((p, i) => (
                            <TableRow key={i} className={p.is_package_component ? 'opacity-60 text-xs' : ''}>
                              <TableCell>{p.is_package_component ? '  ↳ ' : ''}{p.name}</TableCell>
                              <TableCell className="font-mono text-xs">{p.sku || '—'}</TableCell>
                              <TableCell className="text-right">{p.quantity}</TableCell>
                              <TableCell className="text-right">{p.unit_price ?? '—'}</TableCell>
                              <TableCell className="text-right">{p.total_price ?? '—'}</TableCell>
                              <TableCell className="text-right">{p.assembly_cost || '—'}</TableCell>
                              <TableCell className="text-right">{p.handling_cost || '—'}</TableCell>
                              <TableCell className="text-right">{p.purchase_cost || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {b.attachments && b.attachments.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-sm mb-2">Bilagor ({b.attachments.length})</h4>
                      <div className="space-y-1">
                        {b.attachments.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <FileText className="h-3 w-3" />
                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {a.file_name || 'Bilaga'}
                            </a>
                            <span className="text-muted-foreground text-xs">({a.file_type})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-muted-foreground">ID: {b.id}</div>
                </AccordionContent>
              </AccordionItem>
              );
            })}
          </Accordion>
        </>
      ) : (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Database className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-semibold">Booking Rådata</p>
            <p className="text-muted-foreground text-sm">Klicka "Hämta all data" för att visa ALL bokningsdata direkt från Booking</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────

const SyncReconciliation = () => {
  return (
    <div className="min-h-screen bg-background p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Synk-avstämning</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Jämför Planning mot Booking
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Bokningsöversikt</TabsTrigger>
          <TabsTrigger value="detailed">Detaljerad avstämning</TabsTrigger>
          <TabsTrigger value="schedule">Datumöversikt</TabsTrigger>
          <TabsTrigger value="rawdata">Booking Rådata</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <BookingOverviewTab />
        </TabsContent>

        <TabsContent value="detailed">
          <DetailedReconciliationTab />
        </TabsContent>

        <TabsContent value="schedule">
          <ScheduleAuditTab />
        </TabsContent>

        <TabsContent value="rawdata">
          <RawDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SyncReconciliation;
