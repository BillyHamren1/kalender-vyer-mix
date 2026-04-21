/**
 * TimerConflictDialog
 * ====================
 *
 * Surfaces a rule-based conflict between an already-running timer and a
 * new start the user just attempted. Replaces the old silent
 * "alreadyActive" toast with an explicit, actionable choice.
 *
 * Three buttons:
 *   • "Avbryt"               — close, do nothing
 *   • "Behåll pågående"      — close, keep current timer running
 *   • "Stoppa & byt"         — call onSwitch (parent stops old + starts new)
 */
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

interface TimerConflictDialogProps {
  open: boolean;
  /** The conflict surfaced by evaluateStartConflict — required when open. */
  evaluation: Extract<StartEvaluation, { status: 'switch' }> | null;
  /** Human label of what the user tried to start. */
  newTargetLabel: string;
  onCancel: () => void;
  onSwitch: () => void;
}

const REASON_TEXT: Record<
  Extract<StartEvaluation, { status: 'switch' }>['reason'],
  string
> = {
  one_active_timer_at_a_time:
    'Du kan bara ha en aktiv timer åt gången. Vill du stoppa den pågående och börja med den nya?',
  one_booking_at_a_time:
    'Du kan bara ha en bokning aktiv åt gången. Vill du stoppa den pågående och börja med den nya?',
  one_project_at_a_time:
    'Du kan bara ha ett projekt aktivt åt gången. Vill du stoppa det pågående och byta?',
  booking_vs_project:
    'Bokning och projekt kan inte rapporteras samtidigt. Vill du stoppa det pågående och byta?',
  one_location_at_a_time:
    'Du är redan inloggad på en plats. Vill du checka ut därifrån och in på den nya?',
};

export function TimerConflictDialog({
  open,
  evaluation,
  newTargetLabel,
  onCancel,
  onSwitch,
}: TimerConflictDialogProps) {
  const reasonText = evaluation ? REASON_TEXT[evaluation.reason] : '';
  const currentLabel = evaluation?.conflict.label ?? '';

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pågående timer</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">{reasonText}</span>
            <span className="block text-foreground">
              <strong className="font-semibold">Pågående:</strong> {currentLabel}
            </span>
            <span className="block text-foreground">
              <strong className="font-semibold">Ny:</strong> {newTargetLabel}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Behåll pågående</AlertDialogCancel>
          <AlertDialogAction onClick={onSwitch}>Stoppa & byt</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
