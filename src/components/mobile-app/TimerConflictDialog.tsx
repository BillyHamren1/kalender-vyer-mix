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
import type { StartEvaluation } from '@/lib/timerConcurrency';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';

interface TimerConflictDialogProps {
  open: boolean;
  evaluation: Extract<StartEvaluation, { status: 'switch' }> | null;
  newTargetLabel: string;
  onCancel: () => void;
  onSwitch: () => void;
}

const REASON_KEY: Record<
  Extract<StartEvaluation, { status: 'switch' }>['reason'],
  TranslationKey
> = {
  one_active_timer_at_a_time: 'conflict.reason.oneActive',
  one_booking_at_a_time: 'conflict.reason.oneBooking',
  one_project_at_a_time: 'conflict.reason.oneProject',
  booking_vs_project: 'conflict.reason.bookingVsProject',
  one_location_at_a_time: 'conflict.reason.oneLocation',
};

export function TimerConflictDialog({
  open,
  evaluation,
  newTargetLabel,
  onCancel,
  onSwitch,
}: TimerConflictDialogProps) {
  const { t } = useLanguage();
  const reasonText = evaluation ? t(REASON_KEY[evaluation.reason]) : '';
  const currentLabel = evaluation?.conflict.label ?? '';

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('conflict.title')}</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{reasonText}</span>
            <span className="block text-foreground">
              <strong className="font-semibold">{t('conflict.current')}</strong> {currentLabel}
            </span>
            <span className="block text-foreground">
              <strong className="font-semibold">{t('conflict.new')}</strong> {newTargetLabel}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('conflict.keep')}</AlertDialogCancel>
          <AlertDialogAction onClick={onSwitch}>{t('conflict.switch')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
