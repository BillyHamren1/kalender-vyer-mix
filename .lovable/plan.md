# Konvertera "Pick up"-projekt → To do's

De tre raderna på skärmdumpen är registrerade som **medium-projekt** (`projects`) men borde vara **to do's**. De saknar i stort sett all bokningsdata och är dessutom inte redigerbara på projektsidan. Jag flyttar dem till `todos` med typen **Upphämtning** och soft-deletar projekten.

## Berörda poster (org `f5e5cade…`)

| Projekt-id | Titel | Datum | Övrig data |
|---|---|---|---|
| `42a4fe78…` | Pick up tross workman | 2026-05-18 | – |
| `198f1d0e…` | Pick up carpet nessim | 2026-05-18 | – |
| `01fd4bb7…` | Pick up key at Kungsträdgården | 2026-05-15 | koord 59.3315, 18.0714 |

Inga `calendar_events`, inga teamtilldelningar, ingen kund/kontakt/anteckning finns kopplade — så ingenting går förlorat.

## Åtgärd

En migration som:

1. **Skapar tre rader i `todos`** med:
   - `type_id` = `aeaa26ea-…` (Upphämtning)
   - `organization_id` = `f5e5cade-…`
   - `title` = projektets namn
   - `scheduled_date` = `rigdaydate` från projektet
   - `latitude`/`longitude` när det finns (Kungsträdgården)
   - `planning_status` = `'needs_planning'`
2. **Soft-deletar de tre projekten** (`projects.deleted_at = now()`) så de försvinner från projektlistor men finns kvar i ev. audit.

Inga kodändringar behövs — `CreateTodoWizard` / kalendervy hanterar todo's redan.

## Efter körning

- De tre raderna försvinner från `IncomingBookingsList` / projektlistan.
- Tre nya to do's dyker upp (typ Upphämtning) på 15 resp. 18 maj 2026 och kan redigeras via dubbelklick i kalendern (`CreateTodoWizard` i edit-läge).