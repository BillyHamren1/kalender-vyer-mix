// Disposable native SQL controls built by the unchanged Operations cost kernel.
// No provider response, real human payroll/project attest or deployed proof.
import {
  createIsolatedCateringAllocationFixture,
  createIsolatedCateringAllocationVectors,
} from "./catering-allocation-fixture.ts";
import {
  calculateCateringPersonnelEvidence,
  type CateringTimeEntry,
} from "../../supabase/functions/_shared/catering-project-evidence.ts";
async function digest(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function nativeAllocationControls() {
  const first = await createIsolatedCateringAllocationFixture();
  const second = JSON.parse(
    JSON.stringify(first).replaceAll("96000000-", "97000000-"),
  ) as typeof first;
  const original = JSON.parse(second.raw_entry) as CateringTimeEntry;
  const corrected = JSON.parse(second.corrected_raw_entry) as CateringTimeEntry;
  const third: CateringTimeEntry = {
    ...corrected,
    version: 3,
    ended_at: "2026-09-30T09:15:00Z",
  };
  const s = second.saved.snapshot;
  const binding = {
    catering_organization_id: s.source_organization_id,
    catering_person_id: s.source_person_id,
    organization_id: s.organization_id,
    worker_id: s.worker_id,
    project_id: s.project_id,
    obligation_id: s.obligation_id,
    mapping_revision: s.mapping_revision,
    work_date: s.work_date,
    time_zone: s.time_zone,
    currency: s.currency,
    publication_revision: 2,
    project_review_status: "preliminary" as const,
  };
  const rates = [{
    organization_id: s.organization_id,
    worker_id: s.worker_id,
    category: "work" as const,
    currency: s.currency,
    rate_revision: "historical-September",
    hourly_rate_minor: 30001,
    effective_from: "2026-09-01",
    effective_to: "2026-10-01",
  }];
  second.saved.snapshot = await calculateCateringPersonnelEvidence(
    original,
    null,
    binding,
    rates,
  );
  second.saved.raw_entry_sha256 = await digest(second.raw_entry);
  second.command.expected_source_fingerprint =
    second.saved.snapshot.source_fingerprint;
  second.correction_snapshot = await calculateCateringPersonnelEvidence(
    corrected,
    null,
    { ...binding, publication_revision: 3 },
    rates,
  );
  const thirdRaw = JSON.stringify(third);
  return {
    first,
    second,
    vectors: await createIsolatedCateringAllocationVectors(),
    third_raw_entry: thirdRaw,
    third_raw_entry_sha256: await digest(thirdRaw),
    third_snapshot: await calculateCateringPersonnelEvidence(third, null, {
      ...binding,
      publication_revision: 5,
    }, rates),
  };
}
if (import.meta.main) {
  console.log(JSON.stringify(await nativeAllocationControls()));
}
