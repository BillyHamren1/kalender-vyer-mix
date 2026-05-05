import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  PackageOpen,
  RotateCcw,
  Search,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchPackingForScanner,
  fetchPackingListItems,
  returnScanSku,
  physicalReturnScan,
  parseScanResult,
  returnToggleItem,
  returnDecrementItem,
  returnResetItem,
} from '@/services/scannerService';
import type { PackingWithBooking } from '@/types/packing';
import type { ScanEvent } from '@/services/scanner/types';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';

interface Item {
  id: string;
  quantity_to_pack: number;
  quantity_packed: number;
  quantity_returned: number;
  manual_name?: string | null;
  booking_products?: {
    id?: string;
    name?: string | null;
    sku?: string | null;
    parent_product_id?: string | null;
    is_package_component?: boolean | null;
  } | null;
}

interface Props {
  packingId: string;
  onBack: () => void;
  registerScanHandler?: (handler: (scan: ScanEvent) => void) => void;
  returnedBy?: string;
}

const cleanName = (name: string) =>
  name.replace(/^[↳└⦿\s,L]+/, '').trim();

const ReturnView: React.FC<Props> = ({
  packingId,
  onBack,
  registerScanHandler,
  returnedBy = 'Scanner',
}) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scanInput, setScanInput] = useState('');
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [lastResult, setLastResult] = useState<{
    level: 'success' | 'warning' | 'error';
    text: string;
    productName?: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pack, rows] = await Promise.all([
        fetchPackingForScanner(packingId),
        fetchPackingListItems(packingId),
      ]);
      setPacking(pack);
      setItems((rows || []) as Item[]);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte ladda packlistan');
    } finally {
      setIsLoading(false);
    }
  }, [packingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: items + packing project changes
  const tables = useMemo(() => ['packing_list_items', 'packing_projects'], []);
  useScannerRealtime({
    tables,
    onChanged: loadData,
    pollingInterval: 30000,
  });

  // Returnable rows = sent something out, and not a package header
  const headerProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const it of items) {
      const pid = it.booking_products?.parent_product_id;
      if (pid) ids.add(pid);
    }
    return ids;
  }, [items]);

  const isReturnable = (it: Item) => {
    const pid = it.booking_products?.id;
    if (pid && headerProductIds.has(pid)) return false; // package header
    return (it.quantity_packed ?? 0) > 0;
  };

  const totals = useMemo(() => {
    let totalOut = 0;
    let totalReturned = 0;
    for (const it of items) {
      if (!isReturnable(it)) continue;
      const sent = Math.max(0, it.quantity_packed ?? 0);
      const back = Math.max(0, it.quantity_returned ?? 0);
      totalOut += sent;
      totalReturned += Math.min(back, sent);
    }
    const pct = totalOut > 0 ? Math.round((totalReturned / totalOut) * 100) : 0;
    return { totalOut, totalReturned, pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, headerProductIds]);

  const flashHighlight = (itemId: string) => {
    setHighlightItemId(itemId);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightItemId(null), 1200);
  };

  const applyScanResult = useCallback(
    (res: Awaited<ReturnType<typeof physicalReturnScan>>, fallbackName: string) => {
      if (res.success && !res.alreadyReturned) {
        setLastResult({
          level: 'success',
          text: `+1 returnerad (${res.quantity_returned}/${res.quantity_packed})`,
          productName: res.productName || fallbackName,
        });
        if (res.itemId) flashHighlight(res.itemId);
        setItems(prev =>
          prev.map(it =>
            it.id === res.itemId
              ? { ...it, quantity_returned: res.quantity_returned ?? it.quantity_returned }
              : it,
          ),
        );
        loadData();
      } else if (res.success && res.alreadyReturned) {
        setLastResult({
          level: 'warning',
          text: `Redan returnerad (${res.quantity_returned ?? '–'}/${res.quantity_packed ?? '–'})`,
          productName: res.productName || fallbackName,
        });
        if (res.itemId) flashHighlight(res.itemId);
        loadData();
      } else if (res.debugCode === 'LOCAL_RETURN_MATCH_MISSING') {
        const wmsInfo = res.wms
          ? ` (item_type=${res.wms.item_type_id ?? '–'}, sku=${res.wms.sku ?? '–'})`
          : '';
        setLastResult({
          level: 'warning',
          text: `WMS godkände scan men ingen rad matchar packlistan${wmsInfo}`,
          productName: fallbackName,
        });
        toast.warning('Ingen matchande rad i packlistan');
      } else {
        setLastResult({
          level: 'error',
          text: res.error ? `WMS-fel: ${res.error}` : 'Scan misslyckades',
          productName: fallbackName,
        });
        toast.error(res.error || 'Scan misslyckades');
      }
    },
    [loadData],
  );

  const handleHardwareScan = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      setScanInput('');
      const res = await physicalReturnScan(packingId, value, returnedBy);
      applyScanResult(res, value);
    },
    [packingId, returnedBy, applyScanResult],
  );

  const handleManualSubmit = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      setScanInput('');
      const res = await returnScanSku(packingId, value, returnedBy);
      applyScanResult(res, value);
    },
    [packingId, returnedBy, applyScanResult],
  );

  // Wire scanner hardware → physical (WMS-backed) flow
  useEffect(() => {
    registerScanHandler?.(handleHardwareScan);
  }, [handleHardwareScan, registerScanHandler]);

  const handleManualPlus = async (it: Item) => {
    const sent = it.quantity_packed ?? 0;
    if ((it.quantity_returned ?? 0) >= sent) return;
    // Optimistic
    setItems(prev =>
      prev.map(x =>
        x.id === it.id
          ? { ...x, quantity_returned: Math.min((x.quantity_returned ?? 0) + 1, sent) }
          : x,
      ),
    );
    flashHighlight(it.id);
    const res = await returnToggleItem(it.id, returnedBy);
    if (!res.success) {
      toast.error(res.error || 'Kunde inte uppdatera');
      loadData();
    }
  };

  const handleManualMinus = async (it: Item) => {
    if ((it.quantity_returned ?? 0) <= 0) return;
    setItems(prev =>
      prev.map(x =>
        x.id === it.id
          ? { ...x, quantity_returned: Math.max((x.quantity_returned ?? 0) - 1, 0) }
          : x,
      ),
    );
    const res = await returnDecrementItem(it.id);
    if (!res.success) {
      toast.error(res.error || 'Kunde inte uppdatera');
      loadData();
    }
  };

  const handleResetRow = async (it: Item) => {
    setItems(prev =>
      prev.map(x => (x.id === it.id ? { ...x, quantity_returned: 0 } : x)),
    );
    const res = await returnResetItem(it.id);
    if (!res.success) loadData();
  };

  const sortedItems = useMemo(() => {
    return [...items]
      .filter(isReturnable)
      .sort((a, b) => {
        // Outstanding first, then alphabetical
        const aLeft = (a.quantity_packed ?? 0) - (a.quantity_returned ?? 0);
        const bLeft = (b.quantity_packed ?? 0) - (b.quantity_returned ?? 0);
        if ((aLeft > 0) !== (bLeft > 0)) return aLeft > 0 ? -1 : 1;
        const an = (a.booking_products?.name || a.manual_name || '').toLowerCase();
        const bn = (b.booking_products?.name || b.manual_name || '').toLowerCase();
        return an.localeCompare(bn, 'sv');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, headerProductIds]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const isFullyReturned = totals.totalOut > 0 && totals.totalReturned >= totals.totalOut;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Tillbaka
        </Button>
        <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700">
          IN · Retur
        </span>
      </div>

      <Card className="p-3 border-l-4 border-l-orange-400">
        <div className="flex items-center gap-2 mb-1.5">
          <PackageOpen className="h-4 w-4 text-orange-600" />
          <h2 className="text-sm font-semibold truncate">{packing?.name}</h2>
        </div>
        {packing?.booking?.client && (
          <p className="text-xs text-muted-foreground mb-2 pl-6">
            {packing.booking.client}
          </p>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {totals.totalReturned} / {totals.totalOut} returnerade
            </span>
            <span
              className={`font-bold ${
                isFullyReturned ? 'text-emerald-700' : 'text-orange-700'
              }`}
            >
              {totals.pct}%
            </span>
          </div>
          <Progress
            value={totals.pct}
            className={isFullyReturned ? '[&>div]:bg-emerald-500' : '[&>div]:bg-orange-500'}
          />
        </div>
      </Card>

      {/* Scan input */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Scanna tillbaka till hyllan</span>
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            handleManualSubmit(scanInput);
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Skriv SKU eller produktnamn manuellt — fysiska scans hanteras av läsaren"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            autoFocus
            className="h-9 flex-1"
          />
          <Button
            type="submit"
            size="sm"
            className="h-9"
            disabled={!scanInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        {lastResult && (
          <div
            className={`mt-2 px-2.5 py-1.5 rounded-md text-xs flex items-start gap-2 ${
              lastResult.level === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : lastResult.level === 'warning'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {lastResult.level === 'success' ? (
              <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {lastResult.productName && (
                <div className="font-semibold truncate">{lastResult.productName}</div>
              )}
              <div className="opacity-90">{lastResult.text}</div>
            </div>
          </div>
        )}
      </Card>

      {/* Items list */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <div className="px-3 py-1.5 border-b bg-muted/40 flex items-center justify-between">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Packlista (utskickad)
          </span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Tillbaka / Skickat
          </span>
        </div>
        <div className="divide-y divide-border/30 max-h-[calc(100vh-360px)] overflow-y-auto">
          {sortedItems.length === 0 && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Inga utskickade artiklar att returnera.
            </div>
          )}
          {sortedItems.map(it => {
            const sent = it.quantity_packed ?? 0;
            const back = it.quantity_returned ?? 0;
            const left = sent - back;
            const complete = back >= sent && sent > 0;
            const partial = back > 0 && back < sent;
            const isHighlighted = highlightItemId === it.id;
            const name = cleanName(it.booking_products?.name || it.manual_name || 'Okänd produkt');
            return (
              <div
                key={it.id}
                className={`flex items-center gap-2 px-2 py-2 transition-all duration-300 ${
                  isHighlighted
                    ? 'bg-orange-100 ring-2 ring-orange-400'
                    : complete
                      ? 'bg-emerald-50/70'
                      : partial
                        ? 'bg-amber-50/50'
                        : ''
                }`}
              >
                <div
                  className={`shrink-0 rounded-full flex items-center justify-center w-5 h-5 ${
                    complete
                      ? 'bg-emerald-500'
                      : partial
                        ? 'bg-amber-500'
                        : 'border-2 border-muted-foreground/40'
                  }`}
                >
                  {complete && <Check className="text-white w-2.5 h-2.5" />}
                  {partial && (
                    <span className="text-white text-[8px] font-bold">{back}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{name.toUpperCase()}</div>
                  {it.booking_products?.sku && (
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {it.booking_products.sku}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleManualMinus(it)}
                    disabled={back <= 0}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <div
                    className={`min-w-[44px] text-center rounded px-1.5 py-0.5 font-mono text-xs font-bold ${
                      complete
                        ? 'bg-emerald-100 text-emerald-700'
                        : partial
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted/60 text-muted-foreground'
                    }`}
                  >
                    {back}/{sent}
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleManualPlus(it)}
                    disabled={complete}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  {back > 0 && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => handleResetRow(it)}
                      title="Nollställ raden"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isFullyReturned && (
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2 text-emerald-800">
            <Check className="h-5 w-5" />
            <span className="text-sm font-semibold">
              Allt material är tillbaka på hyllan.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ReturnView;
