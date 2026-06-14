import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  closePackingSession,
  getPackingHistory,
  type PackingWorkSession,
} from '@/services/scannerService';

interface SignPackingSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PackingWorkSession | null;
  packingId: string;
  staffName: string;
  /** Called after a successful close (signed or closed without changes). */
  onClosed: () => void;
}

interface EventSummaryRow {
  productName: string;
  packed: number;
  unpacked: number;
  parcelEvents: number;
  unknownAdded: number;
}

const EVENT_LABEL: Record<string, string> = {
  scan_pack: 'Scannad',
  manual_pack: 'Manuellt packad',
  manual_unpack: 'Manuellt avpackad',
  decrement_pack: 'Minus',
  scan_unpack: 'Scannad bort',
  parcel_create: 'Kolli skapat',
  parcel_assign: 'Lagt i kolli',
  parcel_remove: 'Tagit ur kolli',
  unknown_product_added: 'Okänd produkt tillagd',
};

export const SignPackingSessionDialog: React.FC<SignPackingSessionDialogProps> = ({
  open, onOpenChange, session, packingId, staffName, onClosed,
}) => {
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [rows, setRows] = useState<EventSummaryRow[]>([]);
  const [byEventType, setByEventType] = useState<Record<string, number>>({});
  const [sessionEventCount, setSessionEventCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    let cancelled = false;
    setLoadingHistory(true);
    getPackingHistory(packingId, 500)
      .then((res) => {
        if (cancelled) return;
        const events = (res?.events || []).filter((e: any) => e.session_id === session.id);
        setSessionEventCount(events.length);

        const byProduct = new Map<string, EventSummaryRow>();
        const byType: Record<string, number> = {};
        for (const ev of events) {
          byType[ev.event_type] = (byType[ev.event_type] || 0) + 1;

          const key = ev.product_name || ev.packing_list_item_id || '—';
          const row = byProduct.get(key) || {
            productName: key,
            packed: 0,
            unpacked: 0,
            parcelEvents: 0,
            unknownAdded: 0,
          };
          const delta = Number(ev.quantity_delta) || 0;
          if (ev.event_type === 'unknown_product_added') row.unknownAdded += 1;
          else if (ev.event_type === 'parcel_create' || ev.event_type === 'parcel_assign' || ev.event_type === 'parcel_remove') row.parcelEvents += 1;
          else if (delta > 0) row.packed += delta;
          else if (delta < 0) row.unpacked += Math.abs(delta);
          byProduct.set(key, row);
        }
        setRows(Array.from(byProduct.values()).sort((a, b) => a.productName.localeCompare(b.productName, 'sv')));
        setByEventType(byType);
      })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoadingHistory(false); });

    return () => { cancelled = true; };
  }, [open, session, packingId]);

  const handleSignAndClose = async () => {
    if (!session) return;
    setSubmitting(true);
    const res = await closePackingSession(session.id, staffName, {
      closeWithoutChanges: sessionEventCount === 0,
    });
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error || 'Kunde inte signera sessionen');
      return;
    }
    toast.success('Packningssession signerad');
    onOpenChange(false);
    onClosed();
  };

  const hasChanges = sessionEventCount > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Signera packningssession</DialogTitle>
          <DialogDescription>
            {hasChanges
              ? `Sammanfattning av dina ${sessionEventCount} ändringar i denna session.`
              : 'Inga ändringar gjordes i denna session.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          {loadingHistory && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingHistory && hasChanges && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(byEventType).map(([type, count]) => (
                  <span key={type} className="text-[11px] bg-muted px-2 py-0.5 rounded">
                    {EVENT_LABEL[type] || type}: <b>{count}</b>
                  </span>
                ))}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-muted/40 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="col-span-6">Produkt</span>
                  <span className="col-span-2 text-right">+</span>
                  <span className="col-span-2 text-right">-</span>
                  <span className="col-span-2 text-right">
                    <Package className="h-3 w-3 inline" />
                  </span>
                </div>
                <div className="divide-y divide-border/40">
                  {rows.map((r) => (
                    <div key={r.productName} className="grid grid-cols-12 gap-1 px-2 py-1.5 text-xs items-center">
                      <span className="col-span-6 truncate" title={r.productName}>
                        {r.productName}
                        {r.unknownAdded > 0 && (
                          <span className="ml-1 text-[10px] text-amber-700 font-semibold">(okänd)</span>
                        )}
                      </span>
                      <span className="col-span-2 text-right tabular-nums text-emerald-700 font-mono">
                        {r.packed > 0 ? r.packed : ''}
                      </span>
                      <span className="col-span-2 text-right tabular-nums text-orange-700 font-mono">
                        {r.unpacked > 0 ? r.unpacked : ''}
                      </span>
                      <span className="col-span-2 text-right tabular-nums text-muted-foreground font-mono">
                        {r.parcelEvents > 0 ? r.parcelEvents : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="sm:order-1"
          >
            Fortsätt packa
          </Button>
          <Button
            onClick={handleSignAndClose}
            disabled={submitting || loadingHistory}
            className="sm:order-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {hasChanges ? `Signera som ${staffName}` : 'Stäng utan ändringar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
