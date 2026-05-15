/**
 * useDisplayTimelineV2 — Lager 4.5 + 5.5
 *
 * Read-only Display Timeline från `get-staff-presence-day` (Lager 4) plus
 * Lager 5.5-actions:
 *   - validateEdits()  → ai-validerar pågående edits (deterministisk fallback)
 *   - submitDay()      → skickar in dagen till `staff_day_submissions`
 *
 * Hooken är fortfarande tystkopplad: vid fel returneras `data: null` och
 * UI faller tillbaka till befintlig vy. Skriver inget i GPS/evidence.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DisplayTimelineV2Action {
  actionType: string;
  type?: string;
  label: string;
  requiresAiValidation?: boolean;
  requiresUserNote?: boolean;
  severity?: 'info' | 'primary' | 'warning' | 'critical';
  payload?: Record<string, unknown>;
}

export interface DisplayTimelineV2Block {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  subtitle: string | null;
  displayType: string;
  durationMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  severity: 'normal' | 'info' | 'warning' | 'needs_user_review';
  warnings: string[];
  humanWarnings: string[];
  actions: DisplayTimelineV2Action[];
  address?: string | null;
  label?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  allocationType?: string;
}

export interface StaffDaySubmissionRow {
  id: string;
  status: string;
  comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  user_edits_json: any | null;
  ai_validation_json: any | null;
}

export interface DisplayTimelineV2Data {
  blocks: DisplayTimelineV2Block[];
  dayActions: DisplayTimelineV2Action[];
  diagnostics: any | null;
  proposals: any[];
  aiProposals: any[];
  submission: StaffDaySubmissionRow | null;
}

interface UseDisplayTimelineV2Args {
  staffId: string | null | undefined;
  date: string | null | undefined;
  disabled?: boolean;
}

export type AiValidationStatus =
  | 'accepted'
  | 'accepted_with_warning'
  | 'needs_user_confirmation'
  | 'flagged_conflicts_with_evidence';

export interface AiValidationResult {
  validationStatus: AiValidationStatus;
  confidence: number;
  summary: string;
  warnings: Array<{ code: string; editId: string | null; humanMessage: string }>;
  source: string;
  diagnostics?: any;
  requiredUserExplanation?: string | null;
}

export interface UserEditPayload {
  editId: string;
  sourceDisplayBlockId: string | null;
  editType: string;
  previousValue: unknown;
  newValue: unknown;
  userReason: string | null;
  createdAt: string;
}

interface UseDisplayTimelineV2Result {
  data: DisplayTimelineV2Data | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  validateEdits: (edits: UserEditPayload[], userNote: string | null) => Promise<AiValidationResult | null>;
  submitDay: (args: {
    edits: UserEditPayload[];
    comment: string | null;
    breakMinutes?: number;
  }) => Promise<{ ok: boolean; error?: string; status?: string }>;
}

/** Mappa V2 (id/startAt) → Lager 5.3 DisplayBlockShape (blockId/startAtIso). */
function snapshotForBackend(blocks: DisplayTimelineV2Block[]) {
  return blocks.map((b) => ({
    blockId: b.id,
    startAtIso: b.startAt,
    endAtIso: b.endAt,
    allocationType: b.allocationType ?? b.displayType,
    targetType: b.targetType ?? null,
    targetId: b.targetId ?? null,
    label: b.label ?? b.title,
    warnings: b.warnings ?? [],
    humanWarnings: b.humanWarnings ?? [],
  }));
}

export function useDisplayTimelineV2({
  staffId,
  date,
  disabled,
}: UseDisplayTimelineV2Args): UseDisplayTimelineV2Result {
  const [data, setData] = useState<DisplayTimelineV2Data | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    if (disabled || !staffId || !date) {
      setData(null);
      setError(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        'get-staff-presence-day',
        { body: { staffId, date } },
      );
      if (myId !== reqIdRef.current) return;
      if (invokeErr) throw invokeErr;
      if (!resp || (resp as any).ok === false) {
        setData(null);
        setError(null);
        return;
      }
      const r: any = resp;
      const blocksRaw = Array.isArray(r.displayTimelineBlocksV2)
        ? r.displayTimelineBlocksV2
        : [];
      if (blocksRaw.length === 0 && !r.displayTimelineDiagnosticsV2) {
        setData(null);
        return;
      }
      setData({
        blocks: blocksRaw,
        dayActions: Array.isArray(r.displayTimelineDayActionsV2) ? r.displayTimelineDayActionsV2 : [],
        diagnostics: r.displayTimelineDiagnosticsV2 ?? null,
        proposals: Array.isArray(r.workdayAllocationProposals) ? r.workdayAllocationProposals : [],
        aiProposals: Array.isArray(r.aiWorkdayReviewProposals) ? r.aiWorkdayReviewProposals : [],
        submission: r.staffDaySubmissionV2 ?? null,
      });
    } catch (e: any) {
      if (myId !== reqIdRef.current) return;
      console.warn('[useDisplayTimelineV2] load failed (fallback)', e?.message ?? e);
      setData(null);
      setError(e?.message ?? String(e));
    } finally {
      if (myId === reqIdRef.current) setIsLoading(false);
    }
  }, [staffId, date, disabled]);

  useEffect(() => { void load(); }, [load]);

  const validateEdits = useCallback(
    async (edits: UserEditPayload[], userNote: string | null): Promise<AiValidationResult | null> => {
      if (!staffId || !date || !data) return null;
      try {
        const { data: resp, error: err } = await supabase.functions.invoke(
          'validate-staff-day-edits',
          {
            body: {
              staffId,
              date,
              displayTimelineSnapshot: snapshotForBackend(data.blocks),
              userEdits: edits,
              userNote,
            },
          },
        );
        if (err) throw err;
        if (!resp || (resp as any).ok === false) return null;
        return (resp as any).validation ?? null;
      } catch (e) {
        console.warn('[useDisplayTimelineV2] validateEdits failed', e);
        return null;
      }
    },
    [staffId, date, data],
  );

  const submitDay = useCallback(
    async ({ edits, comment, breakMinutes }: { edits: UserEditPayload[]; comment: string | null; breakMinutes?: number }) => {
      if (!staffId || !date) return { ok: false, error: 'missing_args' };
      try {
        const { data: resp, error: err } = await supabase.functions.invoke(
          'submit-staff-day-v3',
          {
            body: {
              staffId,
              date,
              comment,
              breakMinutes: breakMinutes ?? 0,
              userEdits: edits,
              displayTimelineSnapshot: data ? snapshotForBackend(data.blocks) : [],
            },
          },
        );
        if (err) throw err;
        const r: any = resp ?? {};
        if (r.error) return { ok: false, error: String(r.error) };
        await load();
        return { ok: true, status: r.status ?? r.submission?.status ?? 'submitted' };
      } catch (e: any) {
        console.warn('[useDisplayTimelineV2] submitDay failed', e);
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
    [staffId, date, data, load],
  );

  return { data, isLoading, error, refresh: load, validateEdits, submitDay };
}
