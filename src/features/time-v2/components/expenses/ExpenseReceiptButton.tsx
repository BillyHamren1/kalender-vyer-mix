import React from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink, FileWarning, Paperclip } from 'lucide-react';
import { useReceiptUrl } from '@/features/time-v2/hooks/useTimeV2Expenses';
import type { ExpenseAttachmentV1 } from '@/features/time-v2/lib/expenseContract';

interface Props {
  submissionId: string;
  attachment: ExpenseAttachmentV1;
  /** Unbound / foreign snapshots never get a signed read. */
  disabled?: boolean;
}

const fmtBytes = (n: number | null) =>
  n === null ? '' : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Opens the receipt through a SHORT-LIVED signed read minted server-side on
 * click. The URL is never stored, never cached and never rendered as a
 * permanent link.
 */
const ExpenseReceiptButton: React.FC<Props> = ({ submissionId, attachment, disabled }) => {
  const mint = useReceiptUrl();
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!mint.data) return;
    const ttl = mint.data.ttlSeconds;
    setSecondsLeft(ttl);
    const startedAt = Date.now();
    const t = window.setInterval(() => {
      const left = Math.max(0, ttl - Math.floor((Date.now() - startedAt) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        window.clearInterval(t);
        mint.reset();
      }
    }, 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mint.data]);

  const open = () =>
    mint.mutate(
      { submissionId, attachmentId: attachment.attachmentId },
      { onSuccess: (r) => window.open(r.url, '_blank', 'noopener,noreferrer') },
    );

  return (
    <div className="rounded-lg border bg-card px-3 py-2 flex flex-wrap items-center gap-2" data-testid="time-v2-expense-receipt">
      <Paperclip className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-foreground">
        Kvitto {attachment.mimeType ? `· ${attachment.mimeType}` : ''} {fmtBytes(attachment.sizeBytes)}
      </span>
      <span className="text-[10px] text-muted-foreground">{attachment.state}</span>
      {attachment.sha256 && (
        <span className="text-[10px] font-mono text-muted-foreground">sha256 {attachment.sha256.slice(0, 12)}…</span>
      )}
      {attachment.carriedFromSubmissionId && (
        <span className="text-[10px] text-muted-foreground">buret från tidigare version</span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {mint.data && secondsLeft !== null && (
          <span className="text-[10px] tabular-nums text-muted-foreground" data-testid="time-v2-receipt-ttl">
            länk giltig {secondsLeft}s
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || mint.isPending}
          onClick={open}
          data-testid="time-v2-open-receipt"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" /> {mint.isPending ? 'Signerar…' : 'Öppna kvitto'}
        </Button>
      </div>
      {mint.error && (
        <p className="w-full text-xs text-destructive inline-flex items-center gap-1" data-testid="time-v2-receipt-error">
          <FileWarning className="w-3 h-3" /> {mint.error.message}
        </p>
      )}
    </div>
  );
};

export default ExpenseReceiptButton;
