// Explicit isolated control records, not source/provider or authenticated-human proof.
import {
  calculateCateringPersonnelEvidence,
  type CateringTimeEntry,
} from "../../supabase/functions/_shared/catering-project-evidence.ts";
import {
  buildCateringReassignment,
  type CateringReassignmentCommand,
  type ResolvedCateringAllocationAuthority,
  type SavedCateringPublication,
} from "../../supabase/functions/_shared/catering-project-reassignment.ts";
const id = (n: number) =>
  `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function createIsolatedCateringAllocationFixture(
  missingRate = false,
) {
  // Explicit isolated unit records calculated by the existing Operations kernel;
  // these are not provider responses, persisted human attest or native runtime proof.
  const entry: CateringTimeEntry = {
    id: id(5),
    organization_id: id(3),
    person_id: id(4),
    workplace_id: id(6),
    started_at: "2026-09-30T08:00:00Z",
    ended_at: "2026-09-30T09:45:00Z",
    break_minutes: 0,
    status: "pending",
    approved_by: null,
    approved_at: null,
    version: 1,
    source: "manual",
  };
  const snapshot = await calculateCateringPersonnelEvidence(
    entry,
    null,
    {
      catering_organization_id: id(3),
      catering_person_id: id(4),
      organization_id: id(1),
      worker_id: id(2),
      project_id: id(7),
      obligation_id: id(8),
      mapping_revision: "initial-unit-map",
      work_date: "2026-09-30",
      time_zone: "Europe/Stockholm",
      currency: "SEK",
      publication_revision: 2,
      project_review_status: "preliminary",
    },
    missingRate ? [] : [{
      organization_id: id(1),
      worker_id: id(2),
      category: "work",
      currency: "SEK",
      rate_revision: "historical-September",
      hourly_rate_minor: 30001,
      effective_from: "2026-09-01",
      effective_to: "2026-10-01",
    }],
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(entry)),
  );
  const rawHash = Array.from(
    new Uint8Array(digest),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const saved: SavedCateringPublication = {
    source_stream_id: `catering:${id(3)}:${id(5)}`,
    source_revision: 2,
    observation_id: id(9),
    mapping_id: id(10),
    raw_entry_sha256: rawHash,
    raw_review_sha256: null,
    snapshot,
  };
  const command: CateringReassignmentCommand = {
    schema_version: "operations-catering-reassignment-command.v2",
    source_stream_id: saved.source_stream_id,
    expected_source_revision: 2,
    expected_allocation_revision: 0,
    expected_observation_id: saved.observation_id,
    expected_source_fingerprint: snapshot.source_fingerprint,
    from_project_id: id(7),
    from_obligation_id: id(8),
    target_project_id: id(11),
    target_obligation_id: id(12),
    expected_target_obligation_revision: 1,
    idempotency_key: "isolated-allocation-unit-v2",
    reason: 'Flytta kostnad – kök "A"\nprojekt B',
  };
  const resolved: ResolvedCateringAllocationAuthority = {
    organization_id: id(1),
    actor_system_user_id: id(13),
    allocation_revision: 0,
    event_id: id(14),
    next_mapping_id: id(15),
    next_mapping_revision: "native-allocation-v2:" + id(14),
    created_at: "2026-10-02T00:00:00.123456+00:00",
    target_obligation: {
      organization_id: id(1),
      project_id: id(11),
      obligation_id: id(12),
      currency: "SEK",
      cost_basis: "time",
      current_revision: 1,
    },
  };
  const correctedEntry: CateringTimeEntry = {
    ...entry,
    version: 2,
    ended_at: "2026-09-30T09:30:00Z",
  };
  const correctionSnapshot = await calculateCateringPersonnelEvidence(
    correctedEntry,
    null,
    {
      catering_organization_id: id(3),
      catering_person_id: id(4),
      organization_id: id(1),
      worker_id: id(2),
      project_id: id(7),
      obligation_id: id(8),
      mapping_revision: "initial-unit-map",
      work_date: "2026-09-30",
      time_zone: "Europe/Stockholm",
      currency: "SEK",
      publication_revision: 4,
      project_review_status: "preliminary",
    },
    missingRate ? [] : [{
      organization_id: id(1),
      worker_id: id(2),
      category: "work",
      currency: "SEK",
      rate_revision: "historical-September",
      hourly_rate_minor: 30001,
      effective_from: "2026-09-01",
      effective_to: "2026-10-01",
    }],
  );
  return {
    command,
    saved,
    resolved,
    raw_entry: JSON.stringify(entry),
    corrected_raw_entry: JSON.stringify(correctedEntry),
    correction_snapshot: correctionSnapshot,
  };
}

export async function createIsolatedCateringAllocationVectors() {
  const complete = await createIsolatedCateringAllocationFixture();
  const missing = await createIsolatedCateringAllocationFixture(true);
  const full = await buildCateringReassignment(
    complete.command,
    complete.saved,
    complete.resolved,
  );
  const nullable = await buildCateringReassignment(
    missing.command,
    missing.saved,
    missing.resolved,
  );
  return [full, nullable];
}
if (import.meta.main) {
  console.log(JSON.stringify(await createIsolatedCateringAllocationVectors()));
}
