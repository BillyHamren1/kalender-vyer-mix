/**
 * SCANNER HARDENING – STEG 10: visuell scan-confirmation.
 *
 * Ren presentation av ScanFeedback. Visar aldrig grönt utan CONFIRMED,
 * och visar aldrig optimistisk packed quantity — endast serverbekräftad.
 */

import { Check, X, Loader2, WifiOff, HelpCircle, ScanLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScanFeedback, ScanFeedbackState } from '@/lib/scanner/scanFeedbackState';

const TONE_CLASS: Record<ScanFeedbackState, string> = {
  RECEIVED: 'bg-muted text-muted-foreground border-border',
  PROCESSING: 'bg-muted text-foreground border-border',
  CONFIRMED: 'bg-success/10 text-success border-success/30',
  REJECTED: 'bg-destructive/10 text-destructive border-destructive/30',
  OFFLINE_QUEUED: 'bg-warning/10 text-warning border-warning/30',
  CHECKING: 'bg-warning/10 text-warning border-warning/30',
};

const Icon = ({ state }: { state: ScanFeedbackState }) => {
  switch (state) {
    case 'CONFIRMED':
      return <Check className="h-4 w-4" />;
    case 'REJECTED':
      return <X className="h-4 w-4" />;
    case 'PROCESSING':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'OFFLINE_QUEUED':
      return <WifiOff className="h-4 w-4" />;
    case 'CHECKING':
      return <HelpCircle className="h-4 w-4" />;
    default:
      return <ScanLine className="h-4 w-4" />;
  }
};

interface Props {
  feedback: ScanFeedback;
  className?: string;
}

export const ScanConfirmationIndicator = ({ feedback, className }: Props) => {
  const showQty =
    typeof feedback.packedQuantity === 'number' && typeof feedback.requiredQuantity === 'number';

  return (
    <div
      data-testid="scan-confirmation"
      data-state={feedback.state}
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        TONE_CLASS[feedback.state],
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">
        <Icon state={feedback.state} />
      </span>
      <div className="min-w-0">
        <div className="font-medium leading-tight">{feedback.label}</div>
        {feedback.detail && (
          <div className="text-xs opacity-90 leading-snug">{feedback.detail}</div>
        )}
        {showQty && (
          <div className="text-xs opacity-80 tabular-nums">
            Bekräftat: {feedback.packedQuantity} / {feedback.requiredQuantity}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScanConfirmationIndicator;
