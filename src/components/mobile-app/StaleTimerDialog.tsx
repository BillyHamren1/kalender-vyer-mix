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
import { sv, enUS } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageContext';

interface StaleTimerDialogProps {
  open: boolean;
  staleTimers: Array<{ key: string; timer: ActiveTimer }>;
  onSaveAndClose: (key: string) => void;
  onDiscard: (key: string) => void;
  onClose: () => void;
}

export const StaleTimerDialog: React.FC<StaleTimerDialogProps> = ({
  open,
  staleTimers,
  onSaveAndClose,
  onDiscard,
  onClose,
}) => {
  const { t, locale } = useLanguage();
  const dateLocale = locale === 'en' ? enUS : sv;
  const first = staleTimers[0];
  const remaining = staleTimers.length - 1;

  const startedLabel = useMemo(() => {
    if (!first) return '';
    try {
      return format(new Date(first.timer.startTime), 'PPpp', { locale: dateLocale });
    } catch {
      return first.timer.startTime;
    }
  }, [first, dateLocale]);

  if (!first) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {t('staleTimer.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              <strong>{first.timer.client || first.timer.locationName || t('staleTimer.unknownPlace')}</strong>
            </span>
            <span className="block text-sm">
              {t('staleTimer.startedLabel', { date: startedLabel })}
            </span>
            <span className="block text-sm">
              {t('staleTimer.body')}
            </span>
            {remaining > 0 && (
              <span className="block text-xs text-muted-foreground">
                {t('staleTimer.moreCount', { count: remaining })}
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onDiscard(first.key)}>
            {t('staleTimer.discard')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={() => onSaveAndClose(first.key)}>
            {t('staleTimer.save')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default StaleTimerDialog;
