// Lager 5.4 — AI-validate user time edits (read-only, ingen DB, ingen GPS-mutation)
// =============================================================================
//
// Tar Lager 5.3-edits och bedömer om de är rimliga mot evidence från
// Lager 1 (DayEvidence) och Lager 2 (LocationTruth) + det som visades i
// Lager 4 (DisplayTimeline). AI får ENDAST returnera en bedömning.
//
// Hårda principer (enforced):
//   - Ändrar ALDRIG GPS, place_visits, pings, time_reports, LTE, workday.
//   - Skriver ALDRIG till submission. Den anropande edge-funktionen
//     persisterar resultatet i `staff_day_submissions.ai_validation_json`.
//   - Om ingen AI-klient finns → deterministisk fallback (no external calls).
//
// API speglar projektets pure-helper-mönster (jfr aiWorkdayReviewer.ts).

import type { AppliedEdit, DisplayBlockShape, UserEdit } from './applyUserEditsToDisplayTimeline.ts';

// ── Input/Output-kontrakt ─────────────────────────────────────────────────

export interface DayEvidenceSummaryShape {
  /** Antal stabila stays Lager 1 hittat. */
  stayCount?: number;
  /** Total täckning i minuter. */
  coveredMinutes?: number;
  /** Top-N-platser (label + minuter) för transparens. */
  topPlaces?: Array<{ label: string; minutes: number; targetType?: string | null; targetId?: string | null }>;
  /** Aktiv dagtimer-fönster om sådant finns. */
  activeWorkdayWindow?: { startAtIso: string; endAtIso: string | null } | null;
}

export interface LocationTruthSummaryShape {
  /** Lager 2 final-segment (komprimerade). */
  segments?: Array<{
    startAtIso: string;
    endAtIso: string;
    targetType?: string | null;
    targetId?: string | null;
    label?: string | null;
    finalType?: string | null;
  }>;
}

export interface AiValidateUserTimeEditInput {
  originalDisplayTimeline: DisplayBlockShape[];
  /** Komprimerad Lager 3-allokering (vi vill inte tvinga in hela typen här). */
  originalWorkdayAllocation?: {
    segments?: Array<{
      startAtIso: string;
      endAtIso: string;
      allocationType?: string | null;
      targetType?: string | null;
      targetId?: string | null;
      label?: string | null;
    }>;
  };
  dayEvidenceSummary: DayEvidenceSummaryShape;
  locationTruthV2Summary: LocationTruthSummaryShape;
  userEdits: UserEdit[];
  /** Användarens fri-text-förklaring (kommentar/notering). */
  userNote?: string | null;
  /** Lager 5.3-utdata om sådant redan finns. Tillåter återanvändning av severity. */
  appliedEdits?: AppliedEdit[];
}

export type AiValidationStatus =
  | 'accepted'
  | 'accepted_with_warning'
  | 'needs_user_confirmation'
  | 'flagged_conflicts_with_evidence';

export interface AiValidationWarning {
  code: string;
  editId: string | null;
  humanMessage: string;
}

export interface AiValidationResult {
  validationStatus: AiValidationStatus;
  /** 0–1 — deterministisk fallback ger ≤0.7. */
  confidence: number;
  summary: string;
  warnings: AiValidationWarning[];
  requiredUserExplanation?: string | null;
  suggestedCorrection?: {
    editId: string;
    suggestedNewValue: unknown;
    reason: string;
  } | null;
  /** Märker hur svaret producerades — viktigt för audit. */
  source: 'deterministic_fallback' | 'ai_model';
  diagnostics: {
    editCount: number;
    flaggedCount: number;
    overlapDetected: boolean;
    largeShiftCount: number;
    needsExplanation: boolean;
  };
}

// ── Hjälpare ──────────────────────────────────────────────────────────────

const MS_PER_MIN = 60_000;
const LARGE_SHIFT_MIN = 60;          // > 1 h på en tidsändring -> warning
const HUGE_SHIFT_MIN = 240;          // > 4 h -> conflicts_evidence
const NOTE_REQUIRED_MIN_LEN = 8;     // minst så många tecken för "tillräcklig" kommentar
const PROJECT_REASSIGN_MIN_MIN = 60; // omflyttning av >=60 min projekttid kräver evidence

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function findOriginalBlock(
  blocks: DisplayBlockShape[],
  blockId: string | null,
): DisplayBlockShape | null {
  if (!blockId) return null;
  return blocks.find((b) => b.blockId === blockId) ?? null;
}

function blockMinutes(b: DisplayBlockShape): number {
  const s = parseIso(b.startAtIso);
  const e = parseIso(b.endAtIso);
  if (s == null || e == null || e <= s) return 0;
  return Math.round((e - s) / MS_PER_MIN);
}

function gpsSupportsTarget(
  truth: LocationTruthSummaryShape,
  startAtIso: string | null,
  endAtIso: string | null,
  targetType: string | null,
  targetId: string | null,
): { supports: boolean; minutesAtTarget: number; minutesElsewhere: number } {
  const segs = truth.segments ?? [];
  const s = parseIso(startAtIso);
  const e = parseIso(endAtIso);
  if (s == null || e == null || e <= s) {
    return { supports: false, minutesAtTarget: 0, minutesElsewhere: 0 };
  }
  let atTarget = 0;
  let elsewhere = 0;
  for (const seg of segs) {
    const ss = parseIso(seg.startAtIso);
    const se = parseIso(seg.endAtIso);
    if (ss == null || se == null) continue;
    const overlap = Math.max(0, Math.min(e, se) - Math.max(s, ss));
    if (overlap === 0) continue;
    const mins = Math.round(overlap / MS_PER_MIN);
    const sameTarget =
      targetType && targetId &&
      seg.targetType === targetType && seg.targetId === targetId;
    if (sameTarget) atTarget += mins;
    else elsewhere += mins;
  }
  // GPS stödjer om majoriteten av tidsfönstret pekar på target och vi har minst 10 min underlag.
  const supports = atTarget >= 10 && atTarget >= elsewhere;
  return { supports, minutesAtTarget: atTarget, minutesElsewhere: elsewhere };
}

function detectOverlapAfterEdits(
  originalBlocks: DisplayBlockShape[],
  edits: UserEdit[],
): boolean {
  // Bygg en simulerad tidslinje med edits applicerade (utan att mutera).
  const sim = originalBlocks.map((b) => ({
    blockId: b.blockId,
    start: parseIso(b.startAtIso) ?? 0,
    end: parseIso(b.endAtIso) ?? 0,
  }));
  for (const ed of edits) {
    const idx = sim.findIndex((s) => s.blockId === ed.sourceDisplayBlockId);
    if (idx === -1) continue;
    if (ed.editType === 'change_block_start') {
      const next = parseIso(ed.newValue);
      if (next != null) sim[idx].start = next;
    } else if (ed.editType === 'change_block_end') {
      const next = parseIso(ed.newValue);
      if (next != null) sim[idx].end = next;
    }
  }
  const valid = sim.filter((s) => s.end > s.start);
  valid.sort((a, b) => a.start - b.start);
  for (let i = 1; i < valid.length; i++) {
    if (valid[i].start < valid[i - 1].end) return true;
  }
  return false;
}

// ── Deterministisk fallback-validering ────────────────────────────────────

export function deterministicValidateUserEdits(
  input: AiValidateUserTimeEditInput,
): AiValidationResult {
  const warnings: AiValidationWarning[] = [];
  const edits = input.userEdits ?? [];
  const originalBlocks = input.originalDisplayTimeline ?? [];
  const note = (input.userNote ?? '').trim();
  let largeShiftCount = 0;
  let flaggedCount = 0;
  let needsExplanation = false;
  let suggestedCorrection: AiValidationResult['suggestedCorrection'] = null;

  for (const edit of edits) {
    const block = findOriginalBlock(originalBlocks, edit.sourceDisplayBlockId);

    // 1. Tidsändringar — jämför mot original-block-tider.
    if (edit.editType === 'change_block_start' || edit.editType === 'change_block_end') {
      const prev = parseIso(
        edit.editType === 'change_block_start'
          ? block?.startAtIso ?? edit.previousValue
          : block?.endAtIso ?? edit.previousValue,
      );
      const next = parseIso(edit.newValue);
      if (prev != null && next != null) {
        const diffMin = Math.abs(next - prev) / MS_PER_MIN;
        if (diffMin > HUGE_SHIFT_MIN) {
          largeShiftCount++;
          flaggedCount++;
          warnings.push({
            code: 'huge_time_shift',
            editId: edit.editId,
            humanMessage: `Tidsändringen är ${Math.round(diffMin)} min — det avviker mycket från GPS-underlaget.`,
          });
        } else if (diffMin > LARGE_SHIFT_MIN) {
          largeShiftCount++;
          warnings.push({
            code: 'large_time_shift',
            editId: edit.editId,
            humanMessage: `Du flyttade tiden med ${Math.round(diffMin)} min. Lägg gärna en kort förklaring.`,
          });
          if (note.length < NOTE_REQUIRED_MIN_LEN) needsExplanation = true;
        }
      }
    }

    // 2. Länkning av block till projekt — kräver GPS-stöd för >=60 min projekttid.
    if (edit.editType === 'link_block_to_project' || edit.editType === 'link_address_to_project') {
      const nv = edit.newValue as { targetType?: string; targetId?: string } | undefined;
      if (block && nv?.targetType && nv?.targetId) {
        const minutes = blockMinutes(block);
        if (minutes >= PROJECT_REASSIGN_MIN_MIN) {
          const gps = gpsSupportsTarget(
            input.locationTruthV2Summary,
            block.startAtIso,
            block.endAtIso,
            nv.targetType,
            nv.targetId,
          );
          if (!gps.supports) {
            flaggedCount++;
            warnings.push({
              code: 'project_link_without_gps_support',
              editId: edit.editId,
              humanMessage:
                `Du kopplar ${minutes} min till valt projekt, men GPS visar ${gps.minutesAtTarget} min där och ${gps.minutesElsewhere} min på annan plats.`,
            });
            if (note.length < NOTE_REQUIRED_MIN_LEN) needsExplanation = true;
          }
        }
      }
    }

    // 3. change_workday_end mot aktiv workday-window.
    if (edit.editType === 'change_workday_end') {
      const win = input.dayEvidenceSummary.activeWorkdayWindow;
      const next = parseIso(edit.newValue);
      if (win && next != null) {
        const winEnd = parseIso(win.endAtIso ?? null);
        if (winEnd != null) {
          const diffMin = Math.abs(next - winEnd) / MS_PER_MIN;
          if (diffMin > HUGE_SHIFT_MIN) {
            flaggedCount++;
            warnings.push({
              code: 'workday_end_far_from_active_timer',
              editId: edit.editId,
              humanMessage: `Föreslaget arbetsdagsslut ligger ${Math.round(diffMin)} min från senaste GPS-aktivitet.`,
            });
          }
        }
      }
    }
  }

  // 4. Överlapp efter alla edits.
  const overlapDetected = detectOverlapAfterEdits(originalBlocks, edits);
  if (overlapDetected) {
    flaggedCount++;
    warnings.push({
      code: 'edits_create_overlap',
      editId: null,
      humanMessage: 'Dina ändringar gör att två arbetsblock överlappar i tid.',
    });
  }

  // 5. Klassificera slutstatus.
  let status: AiValidationStatus = 'accepted';
  let summary = 'Ändringarna ser rimliga ut.';
  if (warnings.some((w) => w.code === 'huge_time_shift' || w.code === 'edits_create_overlap' || w.code === 'workday_end_far_from_active_timer')) {
    status = 'flagged_conflicts_with_evidence';
    summary = 'Ändringarna avviker tydligt från GPS-underlaget och bör granskas.';
  } else if (warnings.some((w) => w.code === 'project_link_without_gps_support')) {
    status = needsExplanation ? 'needs_user_confirmation' : 'accepted_with_warning';
    summary = 'Projektkoppling saknar GPS-stöd. Bekräfta gärna.';
  } else if (warnings.length > 0) {
    status = needsExplanation ? 'needs_user_confirmation' : 'accepted_with_warning';
    summary = 'Mindre avvikelser hittades. Du kan välja att bekräfta eller komplettera.';
  }

  // Konfidens — fallback har alltid tak 0.7 så UI vet att en riktig AI inte
  // bekräftat detta.
  let confidence = warnings.length === 0 ? 0.7 : 0.55;
  if (status === 'flagged_conflicts_with_evidence') confidence = 0.4;

  return {
    validationStatus: status,
    confidence,
    summary,
    warnings,
    requiredUserExplanation: needsExplanation
      ? 'Skriv en kort förklaring så att administratören förstår varför du redigerade dagen.'
      : null,
    suggestedCorrection,
    source: 'deterministic_fallback',
    diagnostics: {
      editCount: edits.length,
      flaggedCount,
      overlapDetected,
      largeShiftCount,
      needsExplanation,
    },
  };
}

// ── Public entry: AI-klient kan injekteras senare ─────────────────────────

export interface AiValidationClient {
  /** Returnerar en AiValidationResult med source='ai_model'. */
  validate(input: AiValidateUserTimeEditInput): Promise<AiValidationResult>;
}

/**
 * Validera användarredigering. Om ingen AI-klient skickas in eller anropet
 * misslyckas → deterministisk fallback. Aldrig kast.
 */
export async function aiValidateUserTimeEdit(
  input: AiValidateUserTimeEditInput,
  client?: AiValidationClient | null,
): Promise<AiValidationResult> {
  if (client) {
    try {
      const result = await client.validate(input);
      // Tvinga in source='ai_model' så audit aldrig blir vilseledande.
      return { ...result, source: 'ai_model' };
    } catch (e) {
      // Tyst fallback. Loggning sker i edge-funktionen.
      console.warn('[aiValidateUserTimeEdit] client failed → fallback', e);
    }
  }
  return deterministicValidateUserEdits(input);
}
