/**
 * SubmitGpsDayCard — sammanfattning av dagens GPS-förslag + inskick.
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
  breakLabel?: string | null;
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
  breakLabel,
}) => {
  const heading = overrideCount > 0 ? 'Skicka in ändrad tidrapport' : 'Skicka in tidrapport';
  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold">{heading}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {segmentCount} segment · totalt {totalLabel}
          {overrideCount > 0 ? ` · ${overrideCount} ändringar` : ''}
          {breakLabel ? ` · rast ${breakLabel}` : ''}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="day-comment">Kommentar till admin (valfri)</Label>
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
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Skickar…</>
        ) : (
          <><Send className="h-4 w-4 mr-2" />Skicka in tidrapport</>
        )}
      </Button>
    </Card>
  );
};

export default SubmitGpsDayCard;
