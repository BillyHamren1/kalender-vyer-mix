// Lager 5.3 — User edits to display timeline (pure helper, no DB writes).
// =====================================================================
// Tar emot Lager 4-display-block + en lista användarredigeringar och
// returnerar en ny "edited" version av blocken + diagnostik.
//
// VIKTIGT:
//   - Rör ALDRIG GPS, place_visits, pings, time_reports, location_time_entries.
//   - Rör ALDRIG den underliggande WorkdayAllocation (Lager 3) eller
//     evidence (Lager 2). Detta lager redigerar ENDAST det som visas
//     för användaren och som ska sparas i `staff_day_submissions.user_edits_json`.
//   - AI-validering körs i Lager 5.4 — här gör vi bara mekanisk regelkontroll.
//
// Indata och utdata är rena JSON-objekt så att hela detta lager kan användas
// både i Edge Functions (Deno) och i en eventuell frontend-preview.

export type UserEditType =
  | "change_block_start"          // ändra starttid på ett block
  | "change_block_end"            // ändra sluttid på ett block
  | "link_block_to_project"       // länka block till projekt/large_project/booking
  | "mark_supplier_as_pickup"     // supplier-besök = upphämtning
  | "mark_supplier_as_dropoff"    // supplier-besök = avlämning
  | "link_address_to_project"     // okopplad adress -> projektkoppling
  | "change_workday_end"          // ändra föreslagen arbetsdagsslut
  | "add_block_comment"           // lägg till kommentar/förklaring på block
  | "add_manual_block";           // användare lägger till nytt manuellt block

export interface UserEdit {
  /** Stabil id för att kunna ångra/uppdatera senare. */
  editId: string;
  /** Display-block som redigeras (Lager 4-blockId). null = day-level (t.ex. workday_end). */
  sourceDisplayBlockId: string | null;
  editType: UserEditType;
  /** Värde som visades innan användaren ändrade. För revision/AI-validering. */
  previousValue: unknown;
  /** Det nya värdet. Tolkning beror på editType. */
  newValue: unknown;
  /** Användarens egen förklaring (kan vara null). */
  userReason: string | null;
  /** ISO-tid då redigeringen gjordes. */
  createdAt: string;
}

/** Minimal kontraktsbild av Lager 4-block — duck-typad så vi slipper koppling. */
export interface DisplayBlockShape {
  blockId: string;
  startAtIso: string;
  endAtIso: string | null;
  allocationType: string;
  targetType?: string | null;
  targetId?: string | null;
  label?: string | null;
  warnings?: string[];
  humanWarnings?: string[];
  // Övriga fält behålls som de är i originalblocket.
  [key: string]: unknown;
}

export type EditSeverity = "ok" | "minor" | "major" | "conflicts_evidence";

export interface AppliedEdit {
  edit: UserEdit;
  /** Mekanisk klassning. AI-validering i 5.4 kan höja/sänka detta. */
  severity: EditSeverity;
  /** Maskinläsbar orsak om severity != ok. */
  reasonCode?: string;
  /** Mänsklig svensk förklaring för UI. */
  humanMessage?: string;
}

export interface ApplyUserEditsResult {
  /** Block i samma form som indata, men med edits applicerade. */
  editedBlocks: DisplayBlockShape[];
  /** Per-edit utfall i samma ordning som inkommande edits. */
  appliedEdits: AppliedEdit[];
  /** Föreslagen status för submission. */
  suggestedSubmissionStatus:
    | "draft"
    | "edited_by_user"
    | "needs_user_attention"
    | "ai_flagged";
  /** Dagsnivå-edits som inte sitter på ett block (t.ex. workday_end). */
  dayLevelEdits: AppliedEdit[];
  diagnostics: {
    inputBlockCount: number;
    editCount: number;
    appliedCount: number;
    rejectedCount: number;
    flaggedCount: number;
  };
}

const ALLOWED_EDIT_TYPES: ReadonlySet<UserEditType> = new Set<UserEditType>([
  "change_block_start",
  "change_block_end",
  "link_block_to_project",
  "mark_supplier_as_pickup",
  "mark_supplier_as_dropoff",
  "link_address_to_project",
  "change_workday_end",
  "add_block_comment",
  "add_manual_block",
]);

function parseIso(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function cloneBlock(block: DisplayBlockShape): DisplayBlockShape {
  // Strukturell shallow-clone räcker — vi skriver bara ett fåtal fält.
  return { ...block, warnings: [...(block.warnings ?? [])], humanWarnings: [...(block.humanWarnings ?? [])] };
}

function classifyTimeShiftSeverity(
  prevIso: string | null | undefined,
  nextIso: string | null | undefined,
): { severity: EditSeverity; reasonCode?: string; humanMessage?: string } {
  const prev = parseIso(prevIso ?? null);
  const next = parseIso(nextIso ?? null);
  if (next == null) {
    return { severity: "major", reasonCode: "invalid_new_time", humanMessage: "Ogiltig ny tid." };
  }
  if (prev == null) {
    return { severity: "minor" };
  }
  const diffMin = Math.abs(next - prev) / 60000;
  if (diffMin <= 10) return { severity: "ok" };
  if (diffMin <= 60) return { severity: "minor" };
  if (diffMin <= 240) return { severity: "major", reasonCode: "large_time_shift", humanMessage: "Stor tidsändring jämfört med GPS-underlaget." };
  return { severity: "conflicts_evidence", reasonCode: "shift_conflicts_evidence", humanMessage: "Ändringen avviker mycket från GPS-underlaget och behöver granskas." };
}

function findBlock(blocks: DisplayBlockShape[], blockId: string | null): number {
  if (!blockId) return -1;
  return blocks.findIndex((b) => b.blockId === blockId);
}

export function applyUserEditsToDisplayTimeline(
  inputBlocks: DisplayBlockShape[],
  edits: UserEdit[],
): ApplyUserEditsResult {
  const editedBlocks: DisplayBlockShape[] = inputBlocks.map(cloneBlock);
  const appliedEdits: AppliedEdit[] = [];
  const dayLevelEdits: AppliedEdit[] = [];

  let appliedCount = 0;
  let rejectedCount = 0;
  let flaggedCount = 0;

  for (const edit of edits ?? []) {
    if (!edit || !ALLOWED_EDIT_TYPES.has(edit.editType)) {
      const result: AppliedEdit = {
        edit,
        severity: "major",
        reasonCode: "unsupported_edit_type",
        humanMessage: "Den här ändringen stöds inte ännu.",
      };
      appliedEdits.push(result);
      rejectedCount += 1;
      continue;
    }

    // Day-level edits (inget block-id krävs).
    if (edit.editType === "change_workday_end") {
      const sev = classifyTimeShiftSeverity(
        typeof edit.previousValue === "string" ? edit.previousValue : null,
        typeof edit.newValue === "string" ? edit.newValue : null,
      );
      const result: AppliedEdit = { edit, ...sev };
      dayLevelEdits.push(result);
      appliedEdits.push(result);
      appliedCount += 1;
      if (sev.severity === "conflicts_evidence" || sev.severity === "major") flaggedCount += 1;
      continue;
    }

    const idx = findBlock(editedBlocks, edit.sourceDisplayBlockId);
    if (idx === -1) {
      const result: AppliedEdit = {
        edit,
        severity: "major",
        reasonCode: "block_not_found",
        humanMessage: "Blocket går inte att hitta i den visade dagen.",
      };
      appliedEdits.push(result);
      rejectedCount += 1;
      continue;
    }
    const block = editedBlocks[idx];

    switch (edit.editType) {
      case "change_block_start": {
        const sev = classifyTimeShiftSeverity(block.startAtIso, edit.newValue as string);
        if (sev.severity !== "major" || sev.reasonCode !== "invalid_new_time") {
          block.startAtIso = String(edit.newValue);
          appliedCount += 1;
        } else {
          rejectedCount += 1;
        }
        const result: AppliedEdit = { edit, ...sev };
        appliedEdits.push(result);
        if (sev.severity === "conflicts_evidence" || sev.severity === "major") flaggedCount += 1;
        break;
      }
      case "change_block_end": {
        const sev = classifyTimeShiftSeverity(block.endAtIso, edit.newValue as string);
        if (sev.severity !== "major" || sev.reasonCode !== "invalid_new_time") {
          block.endAtIso = String(edit.newValue);
          appliedCount += 1;
        } else {
          rejectedCount += 1;
        }
        const result: AppliedEdit = { edit, ...sev };
        appliedEdits.push(result);
        if (sev.severity === "conflicts_evidence" || sev.severity === "major") flaggedCount += 1;
        break;
      }
      case "link_block_to_project":
      case "link_address_to_project": {
        const nv = edit.newValue as
          | { targetType?: string; targetId?: string; label?: string }
          | undefined;
        if (!nv || !nv.targetType || !nv.targetId) {
          appliedEdits.push({
            edit,
            severity: "major",
            reasonCode: "missing_target",
            humanMessage: "Du måste välja vilket projekt blocket ska kopplas till.",
          });
          rejectedCount += 1;
          break;
        }
        block.targetType = nv.targetType;
        block.targetId = nv.targetId;
        if (nv.label) block.label = nv.label;
        appliedEdits.push({ edit, severity: "minor" });
        appliedCount += 1;
        break;
      }
      case "mark_supplier_as_pickup":
      case "mark_supplier_as_dropoff": {
        if (block.allocationType !== "supplier_visit") {
          appliedEdits.push({
            edit,
            severity: "major",
            reasonCode: "not_a_supplier_block",
            humanMessage: "Det här blocket är inte ett leverantörsbesök.",
          });
          rejectedCount += 1;
          break;
        }
        (block as Record<string, unknown>).supplierIntent =
          edit.editType === "mark_supplier_as_pickup" ? "pickup" : "dropoff";
        appliedEdits.push({ edit, severity: "minor" });
        appliedCount += 1;
        break;
      }
      case "add_block_comment": {
        const text = typeof edit.newValue === "string" ? edit.newValue.trim() : "";
        if (!text) {
          appliedEdits.push({
            edit,
            severity: "minor",
            reasonCode: "empty_comment",
            humanMessage: "Tom kommentar — ingen ändring sparades.",
          });
          rejectedCount += 1;
          break;
        }
        const list = ((block as Record<string, unknown>).userComments as string[] | undefined) ?? [];
        (block as Record<string, unknown>).userComments = [...list, text];
        appliedEdits.push({ edit, severity: "ok" });
        appliedCount += 1;
        break;
      }
    }
  }

  // Bestäm föreslagen submission-status.
  let suggestedSubmissionStatus: ApplyUserEditsResult["suggestedSubmissionStatus"] = "draft";
  if (appliedCount > 0) suggestedSubmissionStatus = "edited_by_user";
  if (appliedEdits.some((a) => a.severity === "major")) suggestedSubmissionStatus = "needs_user_attention";
  if (appliedEdits.some((a) => a.severity === "conflicts_evidence")) suggestedSubmissionStatus = "ai_flagged";

  return {
    editedBlocks,
    appliedEdits,
    dayLevelEdits,
    suggestedSubmissionStatus,
    diagnostics: {
      inputBlockCount: inputBlocks.length,
      editCount: edits?.length ?? 0,
      appliedCount,
      rejectedCount,
      flaggedCount,
    },
  };
}
