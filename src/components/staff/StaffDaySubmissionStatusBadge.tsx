import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle2, Pencil, AlertTriangle, HelpCircle, Hourglass } from 'lucide-react';
import type { SubmissionDisplay } from '@/hooks/useStaffDaySubmissionsRange';

interface Props {
  display: SubmissionDisplay;
}

/**
 * Lager 5.7 — Visar status för användarens egen inlämnade dag.
 * Detta är INTE admin approval. Det är speglad status från staff_day_submissions.
 */
export const StaffDaySubmissionStatusBadge: React.FC<Props> = ({ display }) => {
  const Icon =
    display.status === 'submitted_by_user'
      ? CheckCircle2
      : display.status === 'edited_by_user'
        ? Pencil
        : display.status === 'ai_flagged'
          ? AlertTriangle
          : display.status === 'needs_user_attention'
            ? HelpCircle
            : Hourglass;

  const toneClass =
    display.tone === 'success'
      ? 'border-emerald-500/40 text-emerald-700 bg-emerald-500/10 dark:text-emerald-300'
      : display.tone === 'info'
        ? 'border-sky-500/40 text-sky-700 bg-sky-500/10 dark:text-sky-300'
        : display.tone === 'warning'
          ? 'border-amber-500/40 text-amber-800 bg-amber-500/10 dark:text-amber-300'
          : display.tone === 'danger'
            ? 'border-destructive/40 text-destructive bg-destructive/10'
            : 'border-border text-muted-foreground';

  const tooltip = (
    <div className="space-y-1 text-xs max-w-[260px]">
      <div className="font-medium">{display.label}</div>
      {display.submittedAt && (
        <div className="text-muted-foreground">
          Inskickad: {new Date(display.submittedAt).toLocaleString('sv-SE')}
        </div>
      )}
      {display.editCount > 0 && (
        <div>{display.editCount} användarredigering{display.editCount === 1 ? '' : 'ar'}</div>
      )}
      {display.warningCount > 0 && (
        <div>{display.warningCount} AI-varning{display.warningCount === 1 ? '' : 'ar'}</div>
      )}
      {display.aiSummary && <div className="italic">{display.aiSummary}</div>}
      {display.comment && (
        <div className="pt-1 border-t border-border/40">
          <span className="text-muted-foreground">Kommentar:</span> {display.comment}
        </div>
      )}
      <div className="pt-1 text-[10px] text-muted-foreground">
        Status från användarens egen inlämning — inte admin-godkännande.
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`text-[10px] gap-1 cursor-help ${toneClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon className="h-2.5 w-2.5" />
            {display.label}
            {display.editCount > 0 && (
              <span className="ml-1 opacity-80">·{display.editCount}</span>
            )}
            {display.warningCount > 0 && (
              <span className="ml-1 opacity-80">⚠{display.warningCount}</span>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
