import React, { useMemo, useState } from 'react';
import { Brain, CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  isBlockEligibleForAiReview,
  useAiReviewsForDay,
  useRequestAiReviewMutation,
  useResolveAiReviewMutation,
  type AiReviewConfidence,
  type TimeReportAiReviewRow,
} from '@/services/timeReportAiReviewApi';

interface BlockLike {
  id: string;
  kind: string;
  reviewState?: string;
  confidence?: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  title?: string;
  subtitle?: string | null;
  fromLabel?: string | null;
  toLabel?: string | null;
  reviewReasons?: string[];
  targetType?: string | null;
  targetLabel?: string | null;
  signalGapMinutes?: number;
  evidenceSummary?: Record<string, unknown> | null;
}

const CONFIDENCE_BADGE: Record<AiReviewConfidence, string> = {
  very_high: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-rose-50 text-rose-700 border-rose-200',
};

const CONFIDENCE_LABEL: Record<AiReviewConfidence, string> = {
  very_high: 'Mycket hög',
  high: 'Hög',
  medium: 'Medel',
  low: 'Låg',
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  work: 'Arbete',
  transport: 'Transport',
  unknown: 'Okänd plats',
  break: 'Rast',
  private: 'Privat tid',
  exclude_from_report: 'Exkludera från rapport',
  needs_human_review: 'Behöver manuell granskning',
};

export interface BlockAiReviewPanelProps {
  block: BlockLike;
  organizationId: string | null | undefined;
  staffId: string | null | undefined;
  date: string | null | undefined;
  engineVersion?: string;
  contextSnapshot?: Record<string, unknown>;
}

export const BlockAiReviewPanel: React.FC<BlockAiReviewPanelProps> = ({
  block,
  organizationId,
  staffId,
  date,
  engineVersion,
  contextSnapshot,
}) => {
  const eligible = isBlockEligibleForAiReview(block);
  const reviewsQ = useAiReviewsForDay({ staffId, date });
  const reqMut = useRequestAiReviewMutation();
  const resolveMut = useResolveAiReviewMutation({ staffId, date });

  const latest = useMemo<TimeReportAiReviewRow | null>(() => {
    const list = reviewsQ.data ?? [];
    const forBlock = list
      .filter((r) => r.block_id === block.id && r.review_status !== 'superseded')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return forBlock[0] ?? null;
  }, [reviewsQ.data, block.id]);

  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  if (!eligible && !latest) return null;

  const onAnalyze = async () => {
    if (!organizationId || !staffId || !date) {
      toast({
        title: 'Saknar kontext',
        description: 'Org/personal/datum krävs för AI-granskning.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await reqMut.mutateAsync({
        organizationId,
        staffId,
        date,
        blockId: block.id,
        engineVersion,
        blockSnapshot: {
          kind: block.kind,
          startAt: block.startAt,
          endAt: block.endAt,
          durationMinutes: block.durationMinutes,
          title: block.title,
          subtitle: block.subtitle ?? null,
          fromLabel: block.fromLabel ?? null,
          toLabel: block.toLabel ?? null,
          confidence: block.confidence,
          reviewState: block.reviewState,
          reviewReasons: block.reviewReasons ?? [],
          targetType: block.targetType ?? null,
          targetLabel: block.targetLabel ?? null,
          signalGapMinutes: block.signalGapMinutes,
          evidenceSummary: block.evidenceSummary ?? null,
        },
        contextSnapshot,
      });
      toast({ title: 'AI-förslag klart', description: 'Kontrollera förslaget nedan.' });
    } catch (err) {
      toast({
        title: 'AI-granskning misslyckades',
        description: String((err as Error)?.message ?? err),
        variant: 'destructive',
      });
    }
  };

  const onAccept = async () => {
    if (!latest) return;
    try {
      await resolveMut.mutateAsync({ reviewId: latest.id, decision: 'accepted' });
      toast({ title: 'Förslag accepterat' });
    } catch (err) {
      toast({ title: 'Kunde inte spara beslut', description: String((err as Error)?.message ?? err), variant: 'destructive' });
    }
  };
  const onReject = async () => {
    if (!latest) return;
    try {
      await resolveMut.mutateAsync({
        reviewId: latest.id,
        decision: 'rejected',
        adminFeedback: feedback || undefined,
      });
      setShowFeedback(false);
      setFeedback('');
      toast({ title: 'Förslag avvisat' });
    } catch (err) {
      toast({ title: 'Kunde inte spara beslut', description: String((err as Error)?.message ?? err), variant: 'destructive' });
    }
  };
  const onMarkManual = async () => {
    if (!latest) return;
    try {
      await resolveMut.mutateAsync({
        reviewId: latest.id,
        decision: 'needs_human_review',
        adminFeedback: feedback || undefined,
      });
      toast({ title: 'Markerad för manuell granskning' });
    } catch (err) {
      toast({ title: 'Kunde inte spara beslut', description: String((err as Error)?.message ?? err), variant: 'destructive' });
    }
  };

  if (!latest) {
    return (
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={onAnalyze}
          disabled={reqMut.isPending}
          className="h-7 text-xs gap-1"
        >
          {reqMut.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Brain className="h-3.5 w-3.5" />}
          AI-granska
        </Button>
      </div>
    );
  }

  const cls = (latest.suggested_classification ?? 'needs_human_review') as string;
  const conf = (latest.confidence ?? 'low') as AiReviewConfidence;
  const status = latest.review_status;

  return (
    <div className="mt-2 rounded-md border border-purple-200 bg-purple-50/50 dark:bg-purple-950/20 dark:border-purple-900/50 p-3 text-xs space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Brain className="h-4 w-4 text-purple-700" />
        <span className="font-medium text-foreground">AI-förslag</span>
        <Badge variant="outline" className="text-[10px] py-0 h-4">
          {CLASSIFICATION_LABEL[cls] ?? cls}
        </Badge>
        <Badge variant="outline" className={`text-[10px] py-0 h-4 ${CONFIDENCE_BADGE[conf]}`}>
          {CONFIDENCE_LABEL[conf]}{latest.confidence_score != null ? ` · ${(Number(latest.confidence_score) * 100).toFixed(0)}%` : ''}
        </Badge>
        {status !== 'suggested' && (
          <Badge variant="outline" className="text-[10px] py-0 h-4 capitalize">
            {status === 'accepted' ? 'Accepterat' : status === 'rejected' ? 'Avvisat' : status === 'needs_human_review' ? 'Manuell granskning' : status}
          </Badge>
        )}
      </div>

      {latest.suggested_label && (
        <div className="text-foreground">{latest.suggested_label}</div>
      )}
      {latest.reasoning_summary && (
        <div className="text-muted-foreground whitespace-pre-wrap">{latest.reasoning_summary}</div>
      )}

      {(latest.evidence_used_json?.length ?? 0) > 0 && (
        <div>
          <div className="font-medium text-foreground mb-0.5">Evidens</div>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            {latest.evidence_used_json!.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {(latest.concerns_json?.length ?? 0) > 0 && (
        <div>
          <div className="font-medium text-foreground mb-0.5 flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-amber-600" /> Risker / oklarheter
          </div>
          <ul className="list-disc list-inside text-amber-800/80 space-y-0.5">
            {latest.concerns_json!.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {latest.suggested_action_json?.actionType && (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Föreslagen åtgärd: </span>
          {latest.suggested_action_json.actionType}
        </div>
      )}

      {latest.admin_feedback && (
        <div className="rounded bg-background/60 border border-border p-2">
          <div className="font-medium text-foreground mb-0.5">Admin-feedback</div>
          <div className="text-muted-foreground whitespace-pre-wrap">{latest.admin_feedback}</div>
        </div>
      )}

      {status === 'suggested' && (
        <div className="space-y-2 pt-1">
          {showFeedback && (
            <Textarea
              placeholder="Varför är AI-förslaget fel? (valfritt)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="text-xs min-h-[60px]"
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" onClick={onAccept} disabled={resolveMut.isPending} className="h-7 text-xs gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Acceptera
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => (showFeedback ? onReject() : setShowFeedback(true))}
              disabled={resolveMut.isPending}
              className="h-7 text-xs gap-1"
            >
              <XCircle className="h-3.5 w-3.5" />
              {showFeedback ? 'Bekräfta avvisning' : 'Avvisa'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onMarkManual}
              disabled={resolveMut.isPending}
              className="h-7 text-xs gap-1"
            >
              <AlertCircle className="h-3.5 w-3.5" /> Behöver manuell kontroll
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onAnalyze}
              disabled={reqMut.isPending}
              className="h-7 text-xs gap-1 ml-auto"
            >
              {reqMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
              Kör om
            </Button>
          </div>
        </div>
      )}

      {status !== 'suggested' && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={onAnalyze}
            disabled={reqMut.isPending}
            className="h-7 text-xs gap-1"
          >
            {reqMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            Kör ny AI-granskning
          </Button>
        </div>
      )}
    </div>
  );
};

export default BlockAiReviewPanel;
