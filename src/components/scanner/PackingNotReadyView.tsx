import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle, RefreshCw, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { repairPackingItems, type PackingListNotReady } from '@/services/scannerService';

interface PackingNotReadyViewProps {
  notReady: PackingListNotReady;
  onBack: () => void;
  onRepaired: () => void | Promise<void>;
}

/**
 * Shown when scanner-api reports `get_packing_items` returned an empty list
 * but the source booking has products (i.e. the packing list never
 * synced or got cleared). Replaces the previous behavior where opening
 * the scanner would silently insert rows on read.
 *
 * Operator must press "Regenerera packlista" to trigger an explicit
 * `repair_packing_items` call.
 */
export const PackingNotReadyView: React.FC<PackingNotReadyViewProps> = ({
  notReady,
  onBack,
  onRepaired,
}) => {
  const [isRepairing, setIsRepairing] = React.useState(false);

  const handleRepair = async () => {
    setIsRepairing(true);
    try {
      const result = await repairPackingItems(notReady.packingId);
      toast.success(
        `Packlistan reparerad: +${result.inserted} ny(a), ${result.updated} uppdaterad(e), -${result.deleted} borttagna`,
      );
      await onRepaired();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte reparera packlistan');
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">Packlistan är inte redo</h1>
      </div>

      <Card className="border-amber-500/60 bg-amber-50">
        <CardContent className="py-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900 text-sm">Packlista saknas</p>
              <p className="text-xs text-amber-800">
                {notReady.message}
              </p>
              <p className="text-[11px] text-amber-700">
                Bokningen har {notReady.bookingProductCount} produkt(er) men packlistan är tom.
                Skannern startar inte förrän listan är genererad.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              onClick={handleRepair}
              disabled={isRepairing}
              className="w-full gap-2"
            >
              {isRepairing
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Reparerar…</>
                : <><Wrench className="h-4 w-4" /> Regenerera packlista</>}
            </Button>
            <Button onClick={onBack} variant="outline" className="w-full">
              Tillbaka
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
