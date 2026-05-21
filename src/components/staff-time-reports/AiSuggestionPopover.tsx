import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X, Undo2 } from 'lucide-react';
import { useApplySuggestion, useDismissSuggestion, useUndoAiApply, type AiSuggestion } from '@/hooks/useAiBlockReview';

interface Props {
  suggestion: AiSuggestion;
  children: React.ReactNode;
}

export const AiSuggestionPopover = ({ suggestion, children }: Props) => {
  const apply = useApplySuggestion();
  const dismiss = useDismissSuggestion();
  const undo = useUndoAiApply();
  const pending = suggestion.status === 'pending';
  const wasApplied = suggestion.status === 'applied' && suggestion.applied_by_ai;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80" side="top" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="w-4 h-4 text-primary" />
            AI-analys
            <span className="ml-auto text-xs text-muted-foreground">
              {Math.round(suggestion.confidence * 100)}% säker
            </span>
          </div>
          <div className="text-sm text-foreground/90 leading-relaxed">
            {suggestion.ai_reasoning || suggestion.human_readable_text}
          </div>
          {(suggestion.suggested_start_time || suggestion.suggested_end_time) && (
            <div className="text-xs bg-muted/50 rounded p-2 font-mono">
              Förslag: {suggestion.suggested_start_time ?? '—'} → {suggestion.suggested_end_time ?? '—'}
            </div>
          )}
          {suggestion.ai_model && (
            <div className="text-[10px] text-muted-foreground">
              {suggestion.ai_model} · {suggestion.apply_rule ?? 'manuell godkänning krävs'}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {pending && (
              <>
                <Button
                  size="sm"
                  onClick={() => apply.mutate(suggestion.id)}
                  disabled={apply.isPending}
                  className="flex-1"
                >
                  <Check className="w-3.5 h-3.5 mr-1" /> Godkänn
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dismiss.mutate(suggestion.id)}
                  disabled={dismiss.isPending}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Avvisa
                </Button>
              </>
            )}
            {wasApplied && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => undo.mutate(suggestion.id)}
                disabled={undo.isPending}
                className="flex-1"
              >
                <Undo2 className="w-3.5 h-3.5 mr-1" /> Ångra AI-ändring
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
