import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiSuggestionsForDay, useReviewDay } from '@/hooks/useAiBlockReview';

interface Props {
  staffId: string;
  date: string;
}

export const AiDayBanner = ({ staffId, date }: Props) => {
  const { data } = useAiSuggestionsForDay(staffId, date);
  const review = useReviewDay();

  const pending = (data || []).filter((s) => s.status === 'pending');
  const autoApplied = (data || []).filter((s) => s.status === 'applied' && s.applied_by_ai);

  if (pending.length === 0 && autoApplied.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card/50 text-xs">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="text-muted-foreground">Inga AI-avvikelser för dagen</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-xs"
          onClick={() => review.mutate({ staffId, date })}
          disabled={review.isPending}
        >
          {review.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Granska igen'}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-primary/40 bg-primary/5 text-xs">
      <Sparkles className="w-3.5 h-3.5 text-primary" />
      <span className="font-medium">
        {pending.length > 0 && `${pending.length} AI-förslag att granska`}
        {pending.length > 0 && autoApplied.length > 0 && ' · '}
        {autoApplied.length > 0 && `${autoApplied.length} auto-justerade`}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 text-xs"
        onClick={() => review.mutate({ staffId, date })}
        disabled={review.isPending}
      >
        {review.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Granska om'}
      </Button>
    </div>
  );
};
