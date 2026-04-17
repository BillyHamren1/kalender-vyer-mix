import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Plus, Minus } from 'lucide-react';

export interface PendingUnknownProduct {
  scannedValue: string;
  scannedSku: string | null;
  scannedName: string | null;
}

interface AddUnknownProductDialogProps {
  pending: PendingUnknownProduct | null;
  onConfirm: (name: string, quantity: number) => Promise<void> | void;
  onDismiss: () => void;
}

export const AddUnknownProductDialog: React.FC<AddUnknownProductDialogProps> = ({
  pending,
  onConfirm,
  onDismiss,
}) => {
  const [step, setStep] = useState<'ask' | 'quantity'>('ask');
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pending) {
      setStep('ask');
      setQuantity(1);
      setName(pending.scannedName || pending.scannedSku || pending.scannedValue);
      setSubmitting(false);
    }
  }, [pending]);

  if (!pending) return null;

  const displayCode = pending.scannedSku || pending.scannedValue;

  const handleConfirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(name.trim() || displayCode, Math.max(1, quantity));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !submitting) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            {step === 'ask' ? 'Okänd produkt' : 'Hur många?'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Du har scannat <span className="font-mono font-semibold">{displayCode}</span> – den finns inte i packlistan.
              </p>
              {pending.scannedName && (
                <p className="text-sm">
                  Namn från lagersystemet: <span className="font-medium">{pending.scannedName}</span>
                </p>
              )}
              {step === 'ask' && <p>Vill du lägga till den i packlistan?</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === 'quantity' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="unknown-product-name">Produktnamn</Label>
              <Input
                id="unknown-product-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Produktnamn"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unknown-product-qty">Antal att packa</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="unknown-product-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="text-center font-mono text-lg"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Produkten registreras med 1 av {quantity} redan packade.
              </p>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          {step === 'ask' ? (
            <>
              <AlertDialogCancel onClick={onDismiss} disabled={submitting}>
                Nej
              </AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); setStep('quantity'); }}>
                Ja, lägg till
              </AlertDialogAction>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep('ask')} disabled={submitting}>
                Tillbaka
              </Button>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirm(); }}
                disabled={submitting || quantity < 1}
              >
                {submitting ? 'Lägger till…' : 'Lägg till'}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
