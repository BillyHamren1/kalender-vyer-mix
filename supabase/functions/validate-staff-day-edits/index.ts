// Lager 5.5 — Edge function som validerar användarens dag-redigeringar.
// =====================================================================
// Tar Lager 5.3-edits + display-snapshot + (frivilligt) evidence/lt-summary,
// kör `aiValidateUserTimeEdit` (deterministisk fallback) och returnerar
// resultatet som AiValidationResult.
//
// Skriver INGENTING till databasen. Skriver INTE till GPS/place_visits/
// time_reports/staff_day_submissions. Endast read-only bedömning.
import { corsHeaders } from "../_shared/cors.ts";
import {
  aiValidateUserTimeEdit,
  type AiValidateUserTimeEditInput,
} from "../_shared/time-engine/aiValidateUserTimeEdit.ts";
import {
  applyUserEditsToDisplayTimeline,
  type DisplayBlockShape,
  type UserEdit,
} from "../_shared/time-engine/applyUserEditsToDisplayTimeline.ts";

interface Body {
  staffId?: string;
  date?: string;
  displayTimelineSnapshot?: DisplayBlockShape[];
  userEdits?: UserEdit[];
  userNote?: string | null;
  dayEvidenceSummary?: AiValidateUserTimeEditInput["dayEvidenceSummary"];
  locationTruthV2Summary?: AiValidateUserTimeEditInput["locationTruthV2Summary"];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  let body: Body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }

  const blocks = Array.isArray(body.displayTimelineSnapshot) ? body.displayTimelineSnapshot : [];
  const edits = Array.isArray(body.userEdits) ? body.userEdits : [];
  if (edits.length === 0) {
    return json(200, {
      ok: true,
      validation: {
        validationStatus: "accepted",
        confidence: 1,
        summary: "Inga redigeringar att validera.",
        warnings: [],
        source: "deterministic_fallback",
        diagnostics: { editCount: 0, flaggedCount: 0, overlapDetected: false, largeShiftCount: 0, needsExplanation: false },
      },
    });
  }

  // Kör Lager 5.3 mekanisk klassning för att få appliedEdits-severity.
  const applied = applyUserEditsToDisplayTimeline(blocks, edits);

  const input: AiValidateUserTimeEditInput = {
    originalDisplayTimeline: blocks,
    dayEvidenceSummary: body.dayEvidenceSummary ?? {},
    locationTruthV2Summary: body.locationTruthV2Summary ?? {},
    userEdits: edits,
    userNote: body.userNote ?? null,
    appliedEdits: applied.appliedEdits,
  };

  try {
    // Ingen AI-klient kopplad ännu → deterministisk fallback i hjälparen.
    const validation = await aiValidateUserTimeEdit(input, null);
    return json(200, { ok: true, validation, mechanicalDiagnostics: applied.diagnostics });
  } catch (e) {
    console.error("[validate-staff-day-edits] failed", e);
    return json(200, {
      ok: false,
      error: (e as Error)?.message ?? String(e),
    });
  }
});
