import React, { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Camera, Trash2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { listQrParcels, registerQrParcel, deleteQrParcel, type QrParcel } from '@/services/scannerService';
import { QRScanner } from './QRScanner';

interface QrParcelManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packingId: string;
  verifierName: string;
  activeSessionId: string | null;
}

/**
 * QR-only parcel manager.
 *
 * Lets the user stick free-form QR codes on physical parcels and register
 * them against the booking by scanning. These parcels do NOT hold products —
 * they are a pure physical counter ("hur många kollin ska skickas").
 * The same QR can be reused across bookings over time (per-packing unique only).
 */
export const QrParcelManager: React.FC<QrParcelManagerProps> = ({
  open, onOpenChange, packingId, verifierName, activeSessionId,
}) => {
  const [parcels, setParcels] = useState<QrParcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listQrParcels(packingId);
      setParcels(data);
    } catch (err) {
      console.error('[QrParcelManager] list failed:', err);
    } finally {
      setLoading(false);
    }
  }, [packingId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleAdd = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await registerQrParcel(packingId, trimmed, verifierName, activeSessionId);
      if (!res.success) {
        if (res.error === 'duplicate') {
          toast.warning(`QR-koden finns redan på denna packlista (#${res.parcel?.parcel_number})`);
        } else {
          toast.error(res.error || 'Kunde inte registrera QR-kollit');
        }
        return;
      }
      setLastAdded(trimmed);
      setTimeout(() => setLastAdded(null), 2000);
      toast.success(`Kolli #${res.parcel?.parcel_number} registrerat`);
      setManualCode('');
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Fel vid registrering');
    } finally {
      setSubmitting(false);
    }
  }, [packingId, verifierName, activeSessionId, refresh]);

  const handleDelete = useCallback(async (parcelId: string, num: number) => {
    if (!confirm(`Ta bort QR-kolli #${num}?`)) return;
    try {
      await deleteQrParcel(parcelId, activeSessionId);
      toast.success(`Kolli #${num} borttaget`);
      await refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte ta bort');
    }
  }, [refresh, activeSessionId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              QR-kollin
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Klistra valfri QR-kod på kollit och scanna den för att räkna det.
              Inga produkter knyts — det är bara en räknare för antal kollin som ska skickas.
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                onClick={() => setScannerOpen(true)}
                className="flex-1 gap-2"
                disabled={submitting}
              >
                <Camera className="h-4 w-4" />
                Scanna QR
              </Button>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Eller skriv in koden manuellt"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd(manualCode)}
                disabled={submitting}
              />
              <Button
                variant="secondary"
                onClick={() => handleAdd(manualCode)}
                disabled={!manualCode.trim() || submitting}
              >
                Lägg till
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Registrerade ({parcels.length})
                </span>
                {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </div>
              {parcels.length === 0 && !loading ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Inga QR-kollin registrerade än.
                </div>
              ) : (
                <ul className="divide-y max-h-[40vh] overflow-y-auto">
                  {parcels.map((p) => (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                        lastAdded === p.qr_code ? 'bg-emerald-100' : ''
                      }`}
                    >
                      <span className="font-mono font-bold text-primary w-10 shrink-0">
                        #{p.parcel_number}
                      </span>
                      <span className="flex-1 text-xs font-mono truncate" title={p.qr_code}>
                        {p.qr_code}
                      </span>
                      {lastAdded === p.qr_code && (
                        <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      )}
                      <button
                        onClick={() => handleDelete(p.id, p.parcel_number)}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Ta bort"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Klar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QRScanner
        isActive={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title="Scanna QR-kolli"
        onScan={(value) => {
          // Stay open so user can scan multiple in a row
          handleAdd(value);
        }}
      />
    </>
  );
};
