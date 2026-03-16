import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RefreshCw, AlertTriangle, CheckCircle2, Package, FileText, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Discrepancy {
  bookingId: string;
  bookingNumber: string | null;
  client: string;
  field: string;
  category: 'metadata' | 'products' | 'attachments';
  localValue: any;
  externalValue: any;
  label: string;
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

const SyncReconciliation = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const applyMutation = useMutation({
    mutationFn: async (corrections: Discrepancy[]) => {
      const { data, error } = await supabase.functions.invoke('sync-reconciliation', {
        body: { action: 'apply', corrections }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      toast.success(`${result.applied} korrigeringar genomförda`);
      if (result.errors?.length) {
        toast.error(`${result.errors.length} fel uppstod`, {
          description: result.errors.join(', ').substring(0, 200),
        });
      }
      setSelected(new Set());
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

  // Group by booking
  const groupedByBooking = new Map<string, Discrepancy[]>();
  for (const d of filtered) {
    const key = d.bookingId;
    const arr = groupedByBooking.get(key) || [];
    arr.push(d);
    groupedByBooking.set(key, arr);
  }

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getDiscKey = (d: Discrepancy) => `${d.bookingId}::${d.field}`;

  const selectAll = () => {
    const allKeys = filtered.map(d => getDiscKey(d));
    setSelected(new Set(allKeys));
  };

  const deselectAll = () => setSelected(new Set());

  const handleApply = () => {
    const corrections = discrepancies.filter(d => selected.has(getDiscKey(d)));
    if (!corrections.length) {
      toast.warning('Inga avvikelser valda');
      return;
    }
    applyMutation.mutate(corrections);
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined) return <span className="text-muted-foreground italic">tom</span>;
    if (typeof val === 'boolean') return val ? 'Ja' : 'Nej';
    return String(val);
  };

  return (
    <div className="min-h-screen bg-background p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Synk-avstämning</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Jämför lokal data mot bokningssystemet och korrigera avvikelser
          </p>
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
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{data.summary.totalExternal}</p>
                <p className="text-xs text-muted-foreground">Externa bokningar</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-3 px-4 text-center">
                <p className="text-2xl font-bold">{data.summary.totalLocal}</p>
                <p className="text-xs text-muted-foreground">Lokala bokningar</p>
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
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="secondary">Filtrerar: {categoryLabels[filterCategory]}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setFilterCategory(null)}>Visa alla</Button>
            </div>
          )}

          {discrepancies.length === 0 ? (
            <Card>
              <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <p className="text-lg font-semibold">Inga avvikelser</p>
                <p className="text-muted-foreground">Lokal data stämmer överens med bokningssystemet</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Actions bar */}
              <div className="flex items-center justify-between mb-4 bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" onClick={selectAll}>Markera alla ({filtered.length})</Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>Avmarkera</Button>
                  <span className="text-sm text-muted-foreground">{selected.size} valda</span>
                </div>
                <Button
                  onClick={handleApply}
                  disabled={selected.size === 0 || applyMutation.isPending}
                  variant="default"
                >
                  {applyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Korrigera valda ({selected.size})
                </Button>
              </div>

              {/* Discrepancy list grouped by booking */}
              <div className="space-y-4">
                {[...groupedByBooking.entries()].map(([bookingId, items]) => {
                  const first = items[0];
                  const allSelected = items.every(d => selected.has(getDiscKey(d)));
                  
                  return (
                    <Card key={bookingId}>
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            <span className="font-semibold">{first.client}</span>
                            {first.bookingNumber && (
                              <Badge variant="outline" className="text-xs">#{first.bookingNumber}</Badge>
                            )}
                            <span className="text-xs text-muted-foreground font-mono">{bookingId.substring(0, 8)}…</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{items.length} avvikelser</Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                const keys = items.map(d => getDiscKey(d));
                                setSelected(prev => {
                                  const next = new Set(prev);
                                  if (allSelected) {
                                    keys.forEach(k => next.delete(k));
                                  } else {
                                    keys.forEach(k => next.add(k));
                                  }
                                  return next;
                                });
                              }}
                            >
                              {allSelected ? 'Avmarkera alla' : 'Markera alla'}
                            </Button>
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="divide-y divide-border">
                          {items.map((d) => {
                            const key = getDiscKey(d);
                            return (
                              <div key={key} className="flex items-start gap-3 py-2.5">
                                <Checkbox
                                  checked={selected.has(key)}
                                  onCheckedChange={() => toggleItem(key)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${categoryColors[d.category]}`}>
                                      {categoryIcons[d.category]}
                                      {categoryLabels[d.category]}
                                    </span>
                                    <span className="text-sm font-medium">{d.label}</span>
                                  </div>
                                  <div className="flex gap-4 text-xs">
                                    <div>
                                      <span className="text-muted-foreground">Lokalt: </span>
                                      <span className="font-mono">{formatValue(d.localValue)}</span>
                                    </div>
                                    <span className="text-muted-foreground">→</span>
                                    <div>
                                      <span className="text-muted-foreground">Booking: </span>
                                      <span className="font-mono font-semibold">{formatValue(d.externalValue)}</span>
                                    </div>
                                  </div>
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
            <p className="text-muted-foreground text-sm">
              Klicka "Starta jämförelse" för att hämta data från bokningssystemet och jämföra med lokal data
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SyncReconciliation;
