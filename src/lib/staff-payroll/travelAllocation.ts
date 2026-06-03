/**
 * travelAllocation — härleder vilket projekt/booking en rese-rad belastar,
 * baserat enbart på redan hämtad rapportdata (StaffTimeMatrixCell.rows).
 *
 * Ingen DB, ingen omklassning av tid. Endast presentation.
 *
 * Regelordning:
 *   1. travel.toLabel matchar en work-rad samma dag → belastar dit (resa TILL projekt).
 *   2. travel.fromLabel matchar en work-rad samma dag (och toLabel saknar match)
 *      → belastar fromLabel (resa FRÅN projekt, t.ex. retur till lager).
 *   3. Annars unknown.
 */
import type { StaffTimeMatrixCell, StaffTimeMatrixRowItem } from "@/hooks/staffTimeFlow/useStaffTimeWeekMatrix";

export type TravelAllocation =
  | { kind: "linked"; label: string; projectKey: string }
  | { kind: "unknown"; label: null; projectKey: null };

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function resolveTravelAllocation(
  cell: StaffTimeMatrixCell,
  travel: StaffTimeMatrixRowItem,
): TravelAllocation {
  if (travel.kind !== "travel") {
    return { kind: "unknown", label: null, projectKey: null };
  }
  const workLabels = (cell.rows ?? [])
    .filter((r) => r.kind === "work" && r.label)
    .map((r) => r.label);

  const to = norm(travel.toLabel);
  const from = norm(travel.fromLabel);

  const matchTo = workLabels.find((l) => norm(l) === to);
  if (matchTo) return { kind: "linked", label: matchTo, projectKey: matchTo };

  const matchFrom = workLabels.find((l) => norm(l) === from);
  if (matchFrom) return { kind: "linked", label: matchFrom, projectKey: matchFrom };

  return { kind: "unknown", label: null, projectKey: null };
}
