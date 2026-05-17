/**
 * DisplayTimelineV2Card — Lager 4.5 + 5.5
 *
 * Interaktiv vy av Display Timeline V2 i appen:
 *   - Header (datum, status, total arbetstid)
 *   - Banner: "Kontrollera och godkänn din dag" med Godkänn/Redigera
 *   - Lista med display-block (titel, tid, warnings, Redigera-knapp)
 *   - AI-validering av användarens edits (deterministisk fallback)
 *   - Skicka in dagen (submit-staff-day-v3)
 *   - Visar submission-status efter inskickning
 *
 * Skriver ALDRIG till GPS/place_visits/time_reports/active_time_registrations.
 * Vid V2-data saknas → returnerar null (fallback till befintlig vy).
 */
import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertTriangle, Pencil, ShieldCheck, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { formatStockholmHm } from '@/lib/staff/formatStockholmTime';
import { formatHoursMinutes } from '@/utils/formatHours';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import {
  useDisplayTimelineV2,
  type DisplayTimelineV2Block,
  type DisplayTimelineV2Action,
  type AiValidationResult,
  type UserEditPayload,
} from '@/hooks/useDisplayTimelineV2';
import BlockEditDialog from './BlockEditDialog';

interface Props {
  date?: string;
}

const SEVERITY_DOT: Record<string, string> = {
  normal: 'bg-muted',
  info: 'bg-blue-400',
  warning: 'bg-amber-500',
  needs_user_review: 'bg-destructive',
};

const SEVERITY_BADGE: Record<string, string> = {
  normal: 'bg-muted text-muted-foreground',
  info: 'bg-blue-100 text-blue-900',
  warning: 'bg-amber-100 text-amber-900',
  needs_user_review: 'bg-destructive/10 text-destructive',
};

function blockRange(b: DisplayTimelineV2Block): string {
  return `${formatStockholmHm(b.startAt)}–${formatStockholmHm(b.endAt)}`;
}

const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  draft: 'Utkast',
  pending_user_review: 'Väntar på din granskning',
  submitted: 'Inskickad',
  edited: 'Inskickad (redigerad)',
  needs_user_attention: 'Behöver din uppmärksamhet',
  ai_flagged: 'AI flaggade',
  superseded: 'Ersatt',
  approved: 'Godkänd av admin',
  rejected: 'Avvisad av admin',
};

const VALIDATION_LABEL: Record<string, { label: string; tone: string; icon: React.ReactNode }> = {
  accepted: { label: 'Godkänd', tone: 'bg-emerald-100 text-emerald-900', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  accepted_with_warning: { label: 'Godkänd med varning', tone: 'bg-amber-100 text-amber-900', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  needs_user_confirmation: { label: 'Behöver din bekräftelse', tone: 'bg-amber-100 text-amber-900', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  flagged_conflicts_with_evidence: { label: 'Stämmer dåligt med signalerna', tone: 'bg-destructive/10 text-destructive', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

const BlockRow: React.FC<{
  block: DisplayTimelineV2Block;
  edited: boolean;
  readOnly: boolean;
  onEdit: () => void;
}> = ({ block, edited, readOnly, onEdit }) => {
  const dot = SEVERITY_DOT[block.severity] ?? 'bg-muted';
  return (
    <li className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 inline-block h-2 w-2 rounded-full shrink-0', dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-medium text-sm truncate">{block.title}</div>
            <div className="text-xs text-muted-foreground tabular-nums shrink-0">
              {blockRange(block)} · {formatHoursMinutes((block.durationMinutes ?? 0) / 60)}
            </div>
          </div>
          {block.subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{block.subtitle}</div>
          )}
          {(block.humanWarnings?.length > 0 || edited) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {edited && (
                <Badge variant="secondary" className="text-[10px] font-normal bg-blue-100 text-blue-900">
                  Redigerad
                </Badge>
              )}
              {block.humanWarnings?.map((w, i) => (
                <Badge key={i} variant="secondary"
                  className={cn('text-[10px] font-normal', SEVERITY_BADGE[block.severity] ?? '')}>
                  {w}
                </Badge>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="mt-2">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={onEdit}>
                <Pencil className="w-3 h-3" /> Redigera block
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const ValidationBanner: React.FC<{ result: AiValidationResult }> = ({ result }) => {
  const meta = VALIDATION_LABEL[result.validationStatus] ?? VALIDATION_LABEL.accepted;
  return (
    <div className={cn('rounded-xl px-3 py-2 text-xs space-y-1', meta.tone)}>
      <div className="flex items-center gap-1.5 font-semibold">
        {meta.icon}
        {meta.label}
        <span className="ml-auto opacity-70">
          {result.source === 'ai_model' ? 'AI' : 'Regel'} · {Math.round((result.confidence ?? 0) * 100)}%
        </span>
      </div>
      <div className="opacity-90">{result.summary}</div>
      {result.warnings?.length > 0 && (
        <ul className="list-disc list-inside space-y-0.5 opacity-90">
          {result.warnings.map((w, i) => <li key={i}>{w.humanMessage}</li>)}
        </ul>
      )}
      {result.requiredUserExplanation && (
        <div className="italic opacity-80">
          Din ändring skiljer sig från GPS/platsdata. Lägg en kommentar och bekräfta om detta ändå stämmer.
        </div>
      )}
    </div>
  );
};

const DisplayTimelineV2Card: React.FC<Props> = ({ date }) => {
  const { effectiveStaffId } = useMobileAuth();
  const today = date ?? new Date().toISOString().slice(0, 10);
  const { data, isLoading, error, validateEdits, submitDay, refresh } = useDisplayTimelineV2({
    staffId: effectiveStaffId,
    date: today,
  });
  const { toast } = useToast();

  const [edits, setEdits] = useState<UserEditPayload[]>([]);
  const [editingBlock, setEditingBlock] = useState<DisplayTimelineV2Block | null>(null);
  const [validation, setValidation] = useState<AiValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const editedBlockIds = useMemo(
    () => new Set(edits.map((e) => e.sourceDisplayBlockId).filter(Boolean) as string[]),
    [edits],
  );

  if (!data) {
    if (isLoading) {
      return (
        <div className="rounded-2xl border border-dashed border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Laddar V2-tidslinje…
        </div>
      );
    }
    return null;
  }

  const submission = data.submission;
  const isSubmitted =
    !!submission &&
    ['submitted', 'edited', 'approved', 'ai_flagged', 'needs_user_attention'].includes(submission.status);
  // Total tid renderas inte här längre — admin-Gantt och Mobilens
  // "Totaler idag" är canonical. Att summera V2-block här bröt mot mirror-only
  // (V2-blocks är förslag som ej alltid renderas i Gantt).


  const status = submission
    ? SUBMISSION_STATUS_LABEL[submission.status] ?? submission.status
    : data.diagnostics?.warnings?.includes('no_workday_allocation_input')
      ? 'Ingen arbetsdag'
      : data.blocks.length === 0
        ? 'Tom dag'
        : 'Klar för granskning';

  const handleSaveEdits = async (newEdits: UserEditPayload[]) => {
    if (newEdits.length === 0) return;
    const merged = [...edits, ...newEdits];
    setEdits(merged);
    setIsValidating(true);
    try {
      const res = await validateEdits(merged, comment || null);
      setValidation(res);
    } finally {
      setIsValidating(false);
    }
  };

  const handleQuickApprove = async () => {
    setIsSubmitting(true);
    const res = await submitDay({ edits: [], comment: comment || null });
    setIsSubmitting(false);
    if (res.ok) {
      toast({ title: 'Dagen är inskickad', description: SUBMISSION_STATUS_LABEL[res.status ?? 'submitted'] });
      setEdits([]);
      setValidation(null);
    } else {
      toast({ title: 'Kunde inte skicka in', description: res.error, variant: 'destructive' });
    }
  };

  const handleSubmitWithEdits = async () => {
    setIsSubmitting(true);
    const res = await submitDay({ edits, comment: comment || null });
    setIsSubmitting(false);
    if (res.ok) {
      toast({ title: 'Dagen är inskickad', description: SUBMISSION_STATUS_LABEL[res.status ?? 'edited'] });
      setEdits([]);
      setValidation(null);
      setShowSubmitConfirm(false);
    } else {
      toast({ title: 'Kunde inte skicka in', description: res.error, variant: 'destructive' });
    }
  };

  const aiBlocking =
    validation?.validationStatus === 'flagged_conflicts_with_evidence' ||
    validation?.validationStatus === 'needs_user_confirmation';

  return (
    <section
      className="rounded-2xl border border-border/60 bg-card p-3 space-y-3"
      aria-label="Display Timeline V2"
    >
      <header className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Dagens översikt
          </div>
          <div className="text-sm font-semibold">{today}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total tid</div>
          <div className="text-sm font-semibold tabular-nums">{formatHoursMinutes(totalMin / 60)}</div>
        </div>
      </header>

      {/* Banner — bara om dagen inte är submitted */}
      {!isSubmitted && data.blocks.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold">Kontrollera och godkänn din dag</div>
              <div className="text-xs text-muted-foreground">
                Granska blocken nedan. Allt ser rätt ut? Tryck Godkänn dag. Behöver något ändras? Tryck Redigera på blocket.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={handleQuickApprove} disabled={isSubmitting || edits.length > 0}>
              {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Godkänn dag
            </Button>
            <Button size="sm" variant="outline" className="flex-1" disabled={isSubmitting}
              onClick={() => editingBlock || (data.blocks[0] && setEditingBlock(data.blocks[0]))}>
              <Pencil className="w-3.5 h-3.5" /> Redigera
            </Button>
          </div>
        </div>
      )}

      {/* Submitted-banner */}
      {isSubmitted && submission && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Dagen är inskickad</div>
            <div className="text-xs text-muted-foreground">
              Status: {SUBMISSION_STATUS_LABEL[submission.status] ?? submission.status}
              {submission.submitted_at ? ` · ${formatStockholmHm(submission.submitted_at)}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Blockslista */}
      {data.blocks.length === 0 ? (
        <div className="text-xs text-muted-foreground">Inga block för dagen.</div>
      ) : (
        <ul className="space-y-2">
          {data.blocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              edited={editedBlockIds.has(b.id)}
              readOnly={isSubmitted}
              onEdit={() => setEditingBlock(b)}
            />
          ))}
        </ul>
      )}

      {/* AI-validering */}
      {isValidating && (
        <div className="rounded-xl bg-muted/40 p-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Validerar dina ändringar…
        </div>
      )}
      {validation && !isValidating && <ValidationBanner result={validation} />}

      {/* Skicka in om edits finns */}
      {!isSubmitted && edits.length > 0 && (
        <div className="space-y-2 pt-1 border-t border-border/40">
          <div className="text-xs text-muted-foreground">
            {edits.length} {edits.length === 1 ? 'ändring' : 'ändringar'} ska skickas in.
          </div>
          {aiBlocking && !comment.trim() && (
            <textarea
              className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5"
              rows={2}
              placeholder="Skriv en kort förklaring innan du skickar in"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={isSubmitting || (aiBlocking && !comment.trim())}
            onClick={handleSubmitWithEdits}
          >
            {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Skicka in dagen
          </Button>
          <Button size="sm" variant="ghost" className="w-full" disabled={isSubmitting}
            onClick={() => { setEdits([]); setValidation(null); setComment(''); }}>
            Ångra alla ändringar
          </Button>
        </div>
      )}

      {error && (
        <div className="text-[10px] text-muted-foreground italic">
          (V2 kunde inte laddas — visar ingen data)
        </div>
      )}

      <BlockEditDialog
        block={editingBlock}
        date={today}
        onClose={() => setEditingBlock(null)}
        onSave={handleSaveEdits}
      />
    </section>
  );
};

export default DisplayTimelineV2Card;
