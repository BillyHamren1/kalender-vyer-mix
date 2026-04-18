import React, { useMemo } from 'react';
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
import { AlertTriangle } from 'lucide-react';
import type { ActiveTimer } from '@/hooks/useGeofencing';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface StaleTimerDialogProps {
  open: boolean;
  staleTimers: Array<{ key: string; timer: ActiveTimer }>;
  onSaveAndClose: (key: string) => void;
  onDiscard: (key: string) => void;
  onClose: () => void;
}

/**
 * Shown when one or more local timers are older than 24h with no server match.
 * Per architectural decision: never silently delete — user must decide.
 */
export const StaleTimerDialog: React.FC<StaleTimerDialogProps> = ({
  open,
  staleTimers,
  onSaveAndClose,
  onDiscard,
  onClose,
}) => {
  const first = staleTimers[0];
  const remaining = staleTimers.length - 1;

  const startedLabel = useMemo(() => {
    if (!first) return '';
    try {
      return format(new Date(first.timer.startTime), 'PPpp', { locale: sv });
    } catch {
      return first.timer.startTime;
    }
  }, [first]);

  if (!first) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Gammal timer hittad
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              <strong>{first.timer.client || first.timer.locationName || 'Okänd plats'}</strong>
            </span>
            <span className="block text-sm">
              Startad: {startedLabel}
            </span>
            <span className="block text-sm">
              Denna timer är äldre än 24 timmar och kunde inte matchas mot servern.
              Vill du spara den som en tidrapport eller kasta den?
            </span>
            {remaining > 0 && (
              <span className="block text-xs text-muted-foreground">
                {remaining} ytterligare gammal timer hanteras efter denna.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onDiscard(first.key)}>
            Kasta
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onSaveAndClose(first.key)}>
            Spara som tidrapport
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default StaleTimerDialog;
