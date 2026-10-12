# Booking and Catering — internal-project compatibility checkpoint

Date: 2026-10-12. Owner: booking_catering worker. Status: code-reviewed and synthetic-tested; NOT integrated-runtime-tested or deployed-verified.

## Verified sources and ownership

- Booking main: `26d29842623dea970ef413da077d1f66c7ae1af5`.
- Catering main: `b1cc307850e66a05a9197553e3d4eabd64a2d7a5`.
- Catering economy draft PR #26: `a19ba24ed18f5f0ffba4198bcdbdf0a22b3bb3b8`, branch `codex/project-economy-read`, 472 changed files. This already owns Catering evidence integration. Its release/native/provider gates remain open in the PR description.
- Operations audit branch: `codex/internal-projects-booking-catering-20261012`, base `db15a2b1a305759800847322536c4d8fed836cb6`.
- Booking open PRs observed: #233 Sales settings and #234 support-context producer. No competing internal-project implementation observed.
- Read long-session and project-economy skills, their delivery/verification references, Catering AGENTS and Booking AGENTS. No production mutations, invoices, messages or deployments performed.

## Current boundaries

Booking `src/hooks/useProjects.ts` and `src/components/booking-details/BookingProjectPicker.tsx` read Booking-local `projects` and `booking_projects`; they must not be presumed identical to Operations projects simply because table names match. No internal classification is present in these interfaces.

Booking `src/hooks/useProjectBilling.ts` derives the billing queue from `project_billing.booking_id`, financial booking data and Confirmed status. A canonical Operations internal project without a Booking record is outside this queue. Preserve that boundary: never create a dummy customer, booking, commercial order or billing row to represent internal work. No Booking runtime change is justified for the first vertical slice.

Catering main `src/features/catering/infrastructure/server/booking-projection.server.ts` requires booking ID, organization ID, canonical status and source timestamp; it verifies organization before its one projection RPC. This is a commercial booking intake, not an internal-project intake. The project card/list contract is derived from BookingSummary.

Catering main `src/features/catering/infrastructure/server/workforce/scheduling.server.ts` already supports manual shifts through `catering_create_manual_shifts`. That existing scheduling path is distinct from creating a staffing requirement, which requires a booking reference. There is no canonical Operations project identity in the reviewed manual-shift service. Do not encode internal project IDs as fake booking references.

## Existing integration to reuse

PR #26 `src/features/catering/infrastructure/server/project-economy-read.server.ts` exposes a default-off, service-proof-protected read endpoint. Exact source identity consists of Catering organization, person, time entry and expected version; returned raw source and review fingerprints preserve provenance. It does not choose the Operations destination.

The PR's pinned Operations adapter at `scripts/project-economy/native-http-runtime/allocation-chain/operations/supabase/functions/_shared/catering-project-evidence.ts` accepts `CateringProjectBinding`:
- verified Catering organization/person;
- canonical Operations organization/worker/project/obligation;
- mapping revision, work date, time zone, currency, publication revision and project-review status.

Booking is not required. Operations resolves the historical rate and calculates the amount; Catering supplies native evidence and Finance consumes the resulting amount. Missing rates remain unknown. Same-address or same-workplace work requires explicit project selection.

Smallest dependency: Operations must supply a server-verified, tenant-scoped binding to the new internal project's stable ID through the existing economy program. Catering must expose that explicit selection for manual internal work only when the canonical read/assignment endpoint is available. Keep booking projection and existing customer shift generation unchanged.

## Synthetic verification

Executed on Node v24.19.0 against the two unmodified adapter source files fetched from PR26 exact SHA. Command:
`node --experimental-transform-types --test internal-project-compatibility.test.mjs`

Six tests passed:
1. Booking-free project: 120 minutes at 300 SEK/hour produces 60000 minor units.
2. Source correction to 90 minutes retains source/project identities and produces 45000 minor units.
3. Two projects sharing a workplace preserve the explicitly bound project.
4. Missing rate retains minutes and returns null amount/missing_rate coverage.
5. Foreign source organization is rejected.
6. Project approval preserves saved monetary evidence; stale publication revision is rejected.

These are pure contract tests with synthetic identities, not database authorization, transport, idempotent ingestion, login or deployed evidence. Correction test proves calculation only; receiver replacement must be verified by the canonical economy program.

Reproduce by downloading `catering-project-evidence.ts` and `project-personnel-cost.ts` from the exact PR26 path above beside the companion test. No test connects to any service.

## Open gates and next work

1. Operations owner publishes canonical project classification and verified binding/read contract.
2. Reconcile with PR26 owners; do not recreate its 472-file transport or migrate competing tables.
3. Add Catering project selection to existing manual-shift/time workflow only through that binding; retain commercial Booking behavior.
4. Integrate receiver tests for retry, correction replacement, tenant isolation, role limits and no duplicate costs.
5. Authenticated synthetic test: create canonical internal project; assign Catering manual work; report time; compare identical evidence in Operations/Finance; close without billing. Requires authenticated deployed candidate and exact version evidence.
6. Confirm customer booking/shift and invoice queues unchanged. No real invoices, payments or staff notifications for tests.
7. Parent coordinates release and recurring continuation. This module is not complete until integrated authenticated gates pass.
