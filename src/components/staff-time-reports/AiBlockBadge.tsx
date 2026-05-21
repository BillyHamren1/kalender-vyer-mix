import { Sparkles, AlertTriangle, CheckCircle2, Clock, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AiSuggestion } from '@/hooks/useAiBlockReview';

interface Props {
  suggestion?: AiSuggestion;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

export const AiBlockBadge = ({ suggestion, onClick, className }: Props) => {
  if (!suggestion) return null;
  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  if (suggestion.status === 'applied' && suggestion.applied_by_ai) {
    return (
      <Badge
        variant="outline"
        onClick={handle}
        className={cn('cursor-pointer gap-1 text-[10px] border-primary/50 text-primary', className)}
        title={suggestion.ai_reasoning ?? ''}
      >
        <Wand2 className="w-3 h-3" /> Justerad av AI
      </Badge>
    );
  }
  if (suggestion.status === 'pending' && suggestion.ai_verdict === 'suggested') {
    return (
      <Badge
        variant="outline"
        onClick={handle}
        className={cn('cursor-pointer gap-1 text-[10px] border-amber-500/60 text-amber-700 dark:text-amber-300', className)}
        title={suggestion.ai_reasoning ?? ''}
      >
        <Sparkles className="w-3 h-3" /> AI-förslag
      </Badge>
    );
  }
  if (suggestion.status === 'pending' && suggestion.ai_verdict === 'wait_for_next') {
    return (
      <Badge variant="outline" className={cn('gap-1 text-[10px] text-muted-foreground', className)}>
        <Clock className="w-3 h-3" /> Inväntar nästa
      </Badge>
    );
  }
  if (suggestion.ai_verdict === 'clean') {
    return (
      <Badge variant="outline" className={cn('gap-1 text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-500/40', className)} title="AI granskad – inga avvikelser">
        <CheckCircle2 className="w-3 h-3" /> Granskad
      </Badge>
    );
  }
  if (suggestion.ai_verdict === 'error') {
    return (
      <Badge variant="outline" className={cn('gap-1 text-[10px] text-destructive', className)}>
        <AlertTriangle className="w-3 h-3" /> AI-fel
      </Badge>
    );
  }
  return null;
};
