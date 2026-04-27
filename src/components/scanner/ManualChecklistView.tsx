import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  ArrowLeft, Check, RefreshCw, AlertCircle, Package, ChevronRight, X, Plus, Minus, PenLine,
} from 'lucide-react';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { signPacking } from '@/services/scannerService';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';
import { useOptimisticPacking } from '@/hooks/scanner/useOptimisticPacking';
import { useKolliManager } from '@/hooks/scanner/useKolliManager';
import { useManualPackingActions } from '@/hooks/scanner/useManualPackingActions';
import { getDisplayedProgressForRow } from '@/lib/packing/progress';
import { buildChildrenByParent, classifyAndFormatRow } from '@/lib/packing/displayNames';
import { PackingNotReadyView } from './PackingNotReadyView';

interface ManualChecklistViewProps {
  packingId: string;
  onBack: () => void;
  verifierName?: string;
}

export const ManualChecklistView: React.FC<ManualChecklistViewProps> = ({
  packingId,
  onBack,
  verifierName = 'Manual',
}) => {
  const { user } = useAuth();

  // === Shared state hooks (same as VerificationView) ===
  const {
    packing, items, progress, isLoading, notReady, loadData,
    applyOptimisticIncrement, applyOptimisticDecrement,
  } = useOptimisticPacking(packingId);

  const {
    isKolliMode, activeParcel, itemParcelMap,
    startKolli, nextKolli, exitKolli, assignToKolli, loadParcels,
  } = useKolliManager(packingId);

  const { manualIncrement, manualDecrement } = useManualPackingActions({
    verifierName,
    applyOptimisticIncrement,
    applyOptimisticDecrement,
    getActiveParcelId: () => (isKolliMode && activeParcel ? activeParcel.id : null),
    assignToKolli,
  });

  // === Local-only UI state ===
  const [tappedItemId, setTappedItemId] = useState<string | null>(null);
  const [staffFirstName, setStaffFirstName] = useState<string>('');
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    supabase.from('staff_members').select('name').eq('email', user.email).maybeSingle()
      .then(({ data }) => {
        if (data?.name) setStaffFirstName(data.name.split(' ')[0]);
      });
  }, [user?.email]);

  // Sync sign-state from packing metadata
  useEffect(() => {
    if (packing?.signed_by && packing?.signed_at) {
      setIsSigned(true);
      setSignedInfo({ by: packing.signed_by, at: packing.signed_at });
    }
  }, [packing?.signed_by, packing?.signed_at]);

  // Initial load + parcels
  useEffect(() => {
    const init = async () => {
      await loadData(false);
      await loadParcels();
    };
    init();
  }, [loadData, loadParcels]);

  // Realtime sync
  const realtimeTables = useMemo(() => ['packing_list_items', 'packing_projects'], []);
  useScannerRealtime({
    tables: realtimeTables,
    onChanged: useCallback(() => loadData(true), [loadData]),
    pollingInterval: 30000,
  });

  // === Action wrappers (visual feedback only) ===
  const handleIncrement = useCallback(async (itemId: string, quantityToPack: number, isParent: boolean) => {
    if (isParent) return;
    setTappedItemId(itemId);
    setTimeout(() => setTappedItemId(null), 200);
    await manualIncrement(itemId, quantityToPack, isParent);
  }, [manualIncrement]);

  const handleDecrement = useCallback(async (itemId: string, isParent: boolean) => {
    await manualDecrement(itemId, isParent);
  }, [manualDecrement]);

  const handleStartKolli = useCallback(async () => {
    await startKolli(verifierName);
  }, [startKolli, verifierName]);

  const handleNextKolli = useCallback(async () => {
    await nextKolli(verifierName);
  }, [nextKolli, verifierName]);

  const handleExitKolli = useCallback(async () => {
    exitKolli();
    await loadData(false);
  }, [exitKolli, loadData]);

  // === Render ===
  const childrenByParent = useMemo(() => buildChildrenByParent(items), [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Server explicitly refused: list isn't ready. Show repair UI; never
  // mount the checklist with a partial list.
  if (notReady) {
    return (
      <PackingNotReadyView
        notReady={notReady}
        onBack={onBack}
        onRepaired={() => loadData(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{packing?.name}</h1>
          {packing?.booking?.client && (
            <p className="text-xs text-muted-foreground truncate">{packing.booking.client}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => loadData(false)} className="shrink-0 h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Progress + Kolli button */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1">
          <Progress value={progress.percentage} className="h-2.5" />
        </div>
        <span className="text-xs font-mono font-semibold text-muted-foreground whitespace-nowrap">
          {progress.verified}/{progress.total}
        </span>
        <span className="text-xs font-bold text-primary whitespace-nowrap">
          {progress.percentage}%
        </span>
        {!isKolliMode && (
          <Button onClick={handleStartKolli} size="sm" variant="outline" className="h-8 px-2.5 gap-1">
            <Package className="h-3.5 w-3.5" />
            <span className="text-xs">Parcel</span>
          </Button>
        )}
      </div>

      {/* Kolli mode banner */}
      {isKolliMode && activeParcel && (
        <div className="bg-primary text-primary-foreground rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span className="font-semibold text-sm">PARCEL #{activeParcel.parcel_number}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleNextKolli} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                <ChevronRight className="h-3 w-3" />
                Next
              </Button>
              <Button onClick={handleExitKolli} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                <X className="h-3 w-3" />
                End
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground px-1">
        Use + and − to count up/down each component
      </p>

      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm">No products</p>
                <p className="text-xs text-amber-700 mt-0.5">Packing list has not been generated yet.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Product</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packed</span>
          </div>

          <div className="divide-y divide-border/30 max-h-[calc(100vh-280px)] overflow-y-auto">
            {items.map(item => {
              const cls = classifyAndFormatRow(item, childrenByParent);
              const display = getDisplayedProgressForRow(item, items);
              const packed = display.displayedPacked;
              const total = display.displayedTotal;

              const isComplete = packed >= total && total > 0;
              const isPartial = packed > 0 && packed < total;
              const isTapped = tappedItemId === item.id;
              const parcelNumber = itemParcelMap[item.id];

              return (
                <div
                  key={item.id}
                  className={`w-full flex items-center gap-2 transition-all select-none ${
                    isComplete ? 'bg-primary/5'
                      : isPartial ? 'bg-amber-50/50'
                      : ''
                  } ${
                    cls.isParent ? 'bg-muted border-b border-t border-border' : ''
                  } ${
                    isTapped ? 'bg-primary/10' : ''
                  } ${cls.isChild ? 'pl-3 pr-2 py-2' : 'px-3 py-2.5'}`}
                >
                  {/* Status circle */}
                  <div className={`shrink-0 rounded-full flex items-center justify-center ${
                    cls.isChild ? 'w-5 h-5' : 'w-6 h-6'
                  } ${
                    isComplete ? 'bg-primary'
                      : isPartial ? 'bg-amber-500'
                      : cls.isParent ? 'border-2 border-dashed border-muted-foreground/30'
                      : 'border-2 border-muted-foreground/40'
                  }`}>
                    {isComplete && <Check className="text-white w-3 h-3" />}
                    {isPartial && <span className="text-white text-[10px] font-bold">{packed}</span>}
                  </div>

                  {/* Product name */}
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${
                      cls.isChild ? 'text-xs font-normal' : 'text-xs font-semibold tracking-wide'
                    } ${
                      isComplete ? 'text-primary'
                        : isPartial ? 'text-amber-800'
                        : cls.isChild ? 'text-muted-foreground'
                        : 'text-foreground'
                    }`}>
                      {cls.displayName}
                    </span>
                    {cls.isParent && (
                      <span className="text-[9px] text-muted-foreground">
                        Auto when all parts packed
                      </span>
                    )}
                  </div>

                  {/* Parcel badge */}
                  {parcelNumber && (
                    <div className="shrink-0 flex items-center gap-0.5 text-primary">
                      <Package className="h-3 w-3" />
                      <span className="text-[10px] font-bold">#{parcelNumber}</span>
                    </div>
                  )}

                  {/* +/- controls */}
                  {!cls.isParent ? (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(item.id, false)}
                        disabled={packed === 0}
                        className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors ${
                          packed === 0
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed'
                            : 'border-border text-foreground active:bg-muted hover:bg-muted/60'
                        }`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className={`min-w-[44px] flex items-center justify-center rounded-md px-1.5 py-1 ${
                        isComplete ? 'bg-primary/10 text-primary'
                          : isPartial ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className="font-mono font-bold text-xs">
                          {packed}/{total}
                        </span>
                      </div>
                      <button
                        onClick={() => handleIncrement(item.id, item.quantity_to_pack, false)}
                        disabled={isComplete}
                        className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors ${
                          isComplete
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed'
                            : 'border-primary bg-primary/10 text-primary active:bg-primary/20 hover:bg-primary/15'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className={`shrink-0 min-w-[44px] flex items-center justify-center rounded-md px-1.5 py-1 ${
                      isComplete ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground'
                    }`}>
                      <span className="font-mono font-bold text-xs">
                        {packed}/{total}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sign */}
      {isSigned && signedInfo ? (
        <div className="sticky bottom-0 pt-4 pb-2 -mx-1 px-1 bg-gradient-to-t from-background via-background to-transparent">
          <div className="w-full h-12 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-primary font-semibold">
            <Check className="h-5 w-5" />
            <span className="text-sm">
              Signed by {signedInfo.by}, {new Date(signedInfo.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(signedInfo.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ) : progress.percentage === 100 && (
        <div className="sticky bottom-0 pt-4 pb-2 -mx-1 px-1 bg-gradient-to-t from-background via-background to-transparent">
          <ConfirmationDialog
            title="Sign packing list"
            description={`Have you${staffFirstName ? ` ${staffFirstName}` : ''} verified that everything on the list is packed?`}
            confirmLabel="Yes"
            cancelLabel="No"
            onConfirm={async () => {
              setIsSigning(true);
              const signerName = staffFirstName || 'Unknown';
              const now = new Date().toISOString();
              try {
                await signPacking(packingId, signerName);
                setIsSigning(false);
                setIsSigned(true);
                setSignedInfo({ by: signerName, at: now });
                toast.success('Signing complete!');
              } catch (err) {
                setIsSigning(false);
                console.error('Signing error:', err);
                toast.error('Could not sign the packing list');
              }
            }}
          >
            <Button
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-white gap-2"
              disabled={isSigning}
            >
              <PenLine className="h-5 w-5" />
              {isSigning ? 'Signing...' : 'Sign'}
            </Button>
          </ConfirmationDialog>
        </div>
      )}
    </div>
  );
};
