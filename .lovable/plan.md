# Day Intelligence Engine — backend integration

## Mål

Bygg en **backend Day Intelligence Engine** där hårda regler (`workdayPolicy.ts`) alltid körs först, och AI bara konsulteras för specifika oklara segment. Resultatet exponeras genom befintliga snapshot-endpoints — ingen ny endpoint mot appen.

Kontraktet:
- `workdayPolicy.ts` är AUTHORITY för hårda regler — AI får inte ändra dem.
- Bekräftade arbetsplatser (booking/large_project/lager/known location) → `confirmed_work` direkt, aldrig till AI.
- Endast `unknown_needs_review` / `unclassified_within_workday` / låg-confidence travel / GPS-gap → AI.
- AI returnerar förslag (`suggestedClassification`, `confidence`, `reasoning`, `needsUserInput`, `suggestedAction`) — inga skrivningar.
- Okänd plats FÖRE arbetsdag startar inte arbetsdag, går endast till AI för förklaring.
- Okänd plats INOM arbetsdag stannar i lönegrundande tid tills explicit klassad som privat/rast.

## Arkitektur

```
get-staff-day-status (hot path)
        │
        ▼
buildStaffDaySnapshot (deterministisk)   ← workdayPolicy authority
        │
        ▼
identifyAmbiguousSegments(snapshot)      ← ny pure helper
        │
        │ (om antalet > 0 OCH cache miss/stale)
        ▼
attachInterpreterSuggestions(...)        ← läser day_interpreter_suggestions
        │                                  (skrivs av batch/manuell trigger)
        ▼
StaffDaySnapshot { ..., interpreterSuggestions, ambiguous }
```

AI körs INTE synkront i `get-staff-day-status` (latency + cost). Istället:

1. **Synkron väg**: snapshot bygger deterministiskt + bifogar redan-cachade förslag från ny tabell `day_interpreter_suggestions`.
2. **Asynkron väg**: refaktorerad `analyze-staff-day` (Day Interpreter) körs manuellt från admin-UI (etapp 1) eller scheduled (etapp 2) och skriver ENDAST till `day_interpreter_suggestions` — aldrig till `time_reports` / `travel_time_logs` / `workdays`.

## Filer

### NY: `supabase/functions/_shared/dayIntelligence.ts`

Pure helper. Innehåller:

```ts
export interface AmbiguousSegment {
  segmentId: string;
  reason: "unknown_outside_workday" | "unknown_within_workday"
        | "travel_low_confidence" | "gps_gap" | "unclassified_within_workday";
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  contextHint: string | null;
}

export function identifyAmbiguousSegments(snap: StaffDaySnapshot): AmbiguousSegment[]

export interface InterpreterSuggestion {
  segmentId: string;
  suggestedClassification: "confirmed_work" | "private" | "break"
                          | "travel" | "unknown_keep" | "needs_user_input";
  confidence: "high" | "medium" | "low";
  reasoning: string;
  needsUserInput: boolean;
  suggestedAction: "create_time_report" | "reclassify_travel"
                 | "mark_private" | "mark_break" | "manual_review" | "no_action";
  suggestedActionPayload?: Record<string, unknown>;
  generatedAt: string;
  modelVersion: string;
}
```

`identifyAmbiguousSegments` filtrerar bort allt som `isPolicyLocked` (se nedan) och allt som har `policyStatus ∈ {confirmed_work, active_work, break, private, approved}`. Adderar travel-rader med `needs_review=true` och GPS-gap >15 min mellan stängda segment inom workday.

### NY tabell: `day_interpreter_suggestions` (migration)

```sql
create table public.day_interpreter_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  report_date date not null,
  segment_id text not null,
  reason text not null,
  suggested_classification text not null,
  confidence text not null,
  reasoning text not null,
  needs_user_input boolean not null default false,
  suggested_action text not null,
  suggested_action_payload jsonb,
  resolution_status text not null default 'pending',
  resolved_at timestamptz,
  resolved_by uuid,
  model_version text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(organization_id, staff_id, report_date, segment_id)
);
```

RLS: org-scoped read för admin/projekt + self-read för staff. Insert endast via SECURITY DEFINER edge functions (service role nyckel i analyze-staff-day).

### EDIT: `supabase/functions/_shared/workdayPolicy.ts`

Lägg till:

```ts
export function isPolicyLocked(seg: PolicySegment, wd: PolicyWorkday | null): boolean {
  if (seg.approved || wd?.approved) return true;
  if (isConfirmedWorksitePresence(seg)) return true;
  if (seg.classification === "private" || seg.classification === "break") return true;
  return false;
}
```

### EDIT: `supabase/functions/_shared/staff-day-status.ts`

- Lägg till fält i `StaffDaySnapshot`:
  - `ambiguous: AmbiguousSegment[]`
  - `interpreterSuggestions: InterpreterSuggestion[]`
- Bygg `ambiguous` via `identifyAmbiguousSegments(snapshot)` precis innan return.
- `interpreterSuggestions` injectas av callern (ny parameter `interpreterSuggestions?: InterpreterSuggestion[]` på `SnapshotInput`, default `[]`).
- Ingen ändring av classify-logik.

### EDIT: `supabase/functions/get-staff-day-status/index.ts`

Efter `buildStaffDaySnapshot`:
1. Hämta cachade rader från `day_interpreter_suggestions` för (org, staff, date) där `resolution_status = 'pending'`.
2. Skicka in via `interpreterSuggestions` i `SnapshotInput`.
3. Returnera oförändrat format + nya fält.

### EDIT: `supabase/functions/analyze-staff-day/index.ts`

Refaktorera till Day Interpreter:
1. Bygg snapshot via samma `buildStaffDaySnapshot` (delar fetch-logiken med `get-staff-day-status` — extrahera DB-fetchen till en delad helper i `_shared/staff-day-status.ts` som `fetchSnapshotInputs(admin, orgId, staffId, date)`).
2. Kör `identifyAmbiguousSegments(snapshot)`. Tom → returnera `{ status: "no_ambiguity" }`.
3. Skicka **endast** ambiguous-segment + minimal kontext (workday-fönstret + närmaste confirmed-segment + reverse-geocoded address för segmentets centerpunkt) till AI gateway.
4. Tar emot strukturerat svar (en `InterpreterSuggestion` per ambiguous segment) via tool-call schema.
5. Upserterar i `day_interpreter_suggestions` på unique (org, staff, date, segment_id).
6. Returnerar förslagen.

Behåller verify_jwt-skyddet och org-resolution. Skriver ALDRIG till `time_reports` / `travel_time_logs` / `workdays`.

### Oförändrade

- `supabase/functions/_shared/dayReality.ts` — redan deterministisk; ingen ändring.
- `supabase/functions/_shared/reality-actions.ts` — fortsätter validera mot policy.
- `supabase/functions/_shared/timeline/*` — gap-detect kan exporteras om nyttigt; annars duplicerar dayIntelligence enkel gap-logik (delta>15 min mellan sorted closed segments).
- `get-staff-month-status` / `get-staff-time-report-period` — får automatiskt med nya fälten via `buildStaffDaySnapshot`.

## Acceptans

- `get-staff-day-status` returnerar samma deterministiska totals som idag + nya fält `ambiguous` och `interpreterSuggestions` (tom array om inget cachat).
- Bekräftad arbetsplats hamnar aldrig i `ambiguous[]` (verifierat i unit-test).
- Okänd plats före workday-start: finns i segments som `unknown_needs_review`, är med i `ambiguous`, öppnar INTE workday (`canStartWorkdayAutomatically` oförändrad).
- Okänd plats inom workday: räknas fortfarande i `unallocatedMinutes` / `unknownWithinWorkdayMinutes`. AI ändrar inte det förrän accept-flödet körs.
- `analyze-staff-day` skriver bara till `day_interpreter_suggestions`.
- Mobilappen får snapshot oförändrat — bara nya fält tillkommer.

## Out of scope (etapp 2)

- Admin-UI för accept/reject av suggestions.
- `apply-day-suggestion` edge function som validerar mot policy + skriver via existerande tabeller.
- Auto-trigger av Day Interpreter (cron eller realtime).
