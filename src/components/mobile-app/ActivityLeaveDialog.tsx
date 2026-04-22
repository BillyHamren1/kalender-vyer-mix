import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Building2, MapPin, Square, Clock, AlertTriangle } from 'lucide-react';
import type { ActivityLeaveDecision } from '@/hooks/useWorkDayAssistant';
import { format, parseISO } from 'date-fns';
import { useLanguage } from '@/i18n/LanguageContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision: ActivityLeaveDecision;
  submitting?: boolean;
  onStopActivity: () => void;
  onKeepRunning: () => void;
  onCreateAnomaly: () => void;
}

export const ActivityLeaveDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  decision,
  submitting,
  onStopActivity,
  onKeepRunning,
  onCreateAnomaly,
}) => {
  const { t } = useLanguage();
  const isLocation = !!decision.timer.locationId;
  const label = decision.timer.locationName || decision.timer.client;

  let outsideSince = '—';
  try {
    outsideSince = format(parseISO(decision.outsideSinceIso), 'HH:mm');
  } catch {
    /* ignore */
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t('leave.title')}
          </DialogTitle>
          <DialogDescription>
            {t('leave.body', {
              dist: decision.distanceMeters,
              label,
              since: outsideSince,
              mins: decision.outsideMinutes,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 flex items-center gap-2">
          {isLocation ? (
            <Building2 className="h-4 w-4 text-primary" />
          ) : (
            <Clock className="h-4 w-4 text-primary" />
          )}
          <span className="text-sm font-semibold truncate">{label}</span>
        </div>

        <p className="text-xs text-muted-foreground">{t('leave.guessHint')}</p>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            onClick={onStopActivity}
            disabled={submitting}
            className="w-full justify-center gap-2"
          >
            <Square className="h-4 w-4" />
            {t('leave.endActivity')}
          </Button>
          <Button
            variant="outline"
            onClick={onKeepRunning}
            disabled={submitting}
            className="w-full"
          >
            {t('leave.keepRunning')}
          </Button>
          <Button
            variant="ghost"
            onClick={onCreateAnomaly}
            disabled={submitting}
            className="w-full justify-center gap-2 text-muted-foreground"
          >
            <AlertTriangle className="h-4 w-4" />
            {t('leave.markGap')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ActivityLeaveDialog;
