import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, AlertTriangle, CheckCircle2, Package, FileText, Database, Loader2, ArrowRight, ArrowLeft, XCircle, MinusCircle } from 'lucide-react';
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
          <h2 className="text-lg font-semibold">Detaljerad avstämning</h2>
          <p className="text-sm text-muted-foreground">Jämför alla fält — metadata, produkter, bilagor</p>
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
        </TabsList>

        <TabsContent value="overview">
          <BookingOverviewTab />
        </TabsContent>

        <TabsContent value="detailed">
          <DetailedReconciliationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SyncReconciliation;
