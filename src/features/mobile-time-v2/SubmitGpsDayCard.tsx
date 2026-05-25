/**
 * SubmitGpsDayCard — bottom card with day summary, comment field and
 * "Skicka in dagen" action. The actual submit call lives in the parent
 * page so it can refresh the view after success.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Send, Loader2 } from 'lucide-react';

interface Props {
  segmentCount: number;
  totalLabel: string;
  overrideCount: number;
  userComment: string;
  onUserCommentChange: (v: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}

const SubmitGpsDayCard: React.FC<Props> = ({
  segmentCount,
  totalLabel,
  overrideCount,
  userComment,
  onUserCommentChange,
  onSubmit,
  isSubmitting,
  disabled,
  disabledReason,
}) => {
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold">Skicka in dagen</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {segmentCount} segment · totalt {totalLabel}
          {overrideCount > 0 ? ` · ${overrideCount} ändrade` : ''}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="day-comment">Kommentar (valfri)</Label>
        <Textarea
          id="day-comment"
          placeholder="t.ex. långa körningar, oplanerad omdirigering …"
          value={userComment}
          onChange={(e) => onUserCommentChange(e.target.value)}
          rows={3}
          disabled={disabled || isSubmitting}
        />
      </div>

      {disabled && disabledReason && (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      )}

      <Button
        onClick={onSubmit}
        disabled={disabled || isSubmitting}
        className="w-full"
        size="lg"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Skickar…
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Skicka in dagen
          </>
        )}
      </Button>
    </Card>
  );
};

export default SubmitGpsDayCard;
